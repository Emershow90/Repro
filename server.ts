import express, { Request, Response, NextFunction } from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { SQL_CATALOG, resolveSqlTemplate } from './src/lib/sqlCatalog';

// -------------------------------------------------------------
// 0. ODBC LAZY LOADER (não quebra se o driver nativo não existir)
// -------------------------------------------------------------
let odbcModule: typeof import("odbc") | null = null;
let odbcLoadAttempted = false;

async function loadOdbc(): Promise<typeof import("odbc") | null> {
  if (odbcLoadAttempted) return odbcModule;
  odbcLoadAttempted = true;
  try {
    odbcModule = await import("odbc");
    console.log("✅ [ODBC] Módulo carregado com sucesso.");
  } catch (err: any) {
    odbcModule = null;
    console.warn(
      "⚠️ [ODBC] Módulo indisponível. Endpoints ODBC/AS400 responderão 503.",
      err?.message || err
    );
  }
  return odbcModule;
}

// -------------------------------------------------------------
// 1. IN-MEMORY HIGH PERFORMANCE RATE LIMITER (SLIDING WINDOW)
// -------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter {
  private limits = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private maxRequests: number;
  private name: string;
  private cleanupTimer: NodeJS.Timeout;

  constructor(name: string, maxRequests: number, windowMs: number = 60000) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // GC a cada 5 minutos. .unref() para NÃO impedir shutdown gracioso.
    this.cleanupTimer = setInterval(() => this.cleanup(), 300000);
    this.cleanupTimer.unref();
  }

  /**
   * Usa req.ip (respeita `trust proxy`). NÃO parsear X-Forwarded-For manualmente —
   * essa é a porta de entrada para spoof de IP e bypass do rate limit.
   */
  private getClientIp(req: Request): string {
    return req.ip || req.socket.remoteAddress || "127.0.0.1";
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIp(req);
      const key = `${this.name}:${ip}`;
      const now = Date.now();

      let record = this.limits.get(key);
      if (!record || now - record.windowStart > this.windowMs) {
        record = { count: 1, windowStart: now };
        this.limits.set(key, record);
      } else {
        record.count++;
      }

      const remaining = Math.max(0, this.maxRequests - record.count);
      const resetTime = Math.ceil((record.windowStart + this.windowMs - now) / 1000);

      res.setHeader("X-RateLimit-Limit", this.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTime);

      if (record.count > this.maxRequests) {
        res.setHeader("Retry-After", resetTime);
        console.warn(
          `⚠️ [RateLimit:${this.name}] IP ${ip} ultrapassou limite (${record.count}/${this.maxRequests} req/min).`
        );
        return res.status(429).json({
          error: "Limite de requisições excedido. Aguarde antes de tentar novamente.",
          limit: this.maxRequests,
          retryAfterSeconds: resetTime,
        });
      }

      next();
    };
  }

  public getStats() {
    return {
      activeIps: this.limits.size,
      maxRequestsPerMin: this.maxRequests,
      windowMs: this.windowMs,
      note: "Contadores são por instância. Em múltiplas réplicas, use Redis/Upstash para limite global.",
    };
  }

  public destroy() {
    clearInterval(this.cleanupTimer);
    this.limits.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.limits.entries()) {
      if (now - record.windowStart > this.windowMs * 2) {
        this.limits.delete(key);
      }
    }
  }
}

const globalLimiter = new InMemoryRateLimiter("Global", 150, 60000);
const sheetsProxyLimiter = new InMemoryRateLimiter("SheetsProxy", 45, 60000);

// -------------------------------------------------------------
// 2. SSRF PROTECTION — allowlist de hosts
// -------------------------------------------------------------
const ALLOWED_PROXY_HOSTS = new Set([
  "script.google.com",
  "script.googleusercontent.com", // redirects do Apps Script
]);

function isAllowedProxyUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return ALLOWED_PROXY_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 3. HELPERS
// -------------------------------------------------------------
function redactPwd(input: string): string {
  return input.replace(/Pwd=[^;]*/gi, "Pwd=***");
}

function buildAs400ConnString(opts: {
  host: string;
  port?: string | number;
  schema?: string;
  usuario: string;
  senha: string;
}): string {
  const port = opts.port || "8471";
  const schema = opts.schema || "NEWGES";
  return (
    `Driver={IBM i Access ODBC Driver};` +
    `System=${opts.host};Port=${port};` +
    `Uid=${opts.usuario};Pwd=${opts.senha};` +
    `Naming=1;DefaultLibraries=${schema};`
  );
}

// -------------------------------------------------------------
// 4. SERVER INITIALIZATION
// -------------------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const startTime = Date.now();

  // Carrega ODBC uma vez, sem quebrar se indisponível.
  await loadOdbc();

  // Cloud Run: 1 hop de proxy. Nunca `true` — permite spoof de X-Forwarded-For.
  app.set("trust proxy", 1);

  // Segurança de headers (CSP desativado para não quebrar Vite HMR em dev).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS — ajuste os domínios conforme seu deploy.
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://localhost:3000",
        /\.github\.io$/,
        /\.vercel\.app$/,
        /\.run\.app$/,
      ],
      credentials: false, // sem cookies no fluxo atual; use Bearer se precisar
    })
  );

  // Body parser com limites por rota (evita DoS com payload de 10 MB).
  app.use("/api/sheets/proxy", express.json({ limit: "2mb" }));
  app.use("/api/odbc/execute", express.json({ limit: "64kb" }));
  app.use("/api/as400", express.json({ limit: "64kb" }));
  app.use("/api/replenishment", express.json({ limit: "2mb" }));
  app.use(express.json({ limit: "256kb" }));

  app.use(globalLimiter.middleware());

  // Logging estruturado
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqStart = performance.now();
    const clientIp = req.ip || "127.0.0.1";

    res.on("finish", () => {
      const duration = (performance.now() - reqStart).toFixed(1);
      const isSlow = Number(duration) > 500;
      const isError = res.statusCode >= 400;

      if (isError || isSlow || req.path.startsWith("/api/")) {
        const logMsg = `[HTTP] ${req.method} ${req.path} ${res.statusCode} ${duration}ms - IP: ${clientIp}`;
        if (isError) console.error(`❌ ${logMsg}`);
        else if (isSlow) console.warn(`🐢 ${logMsg} (slow)`);
        else console.log(`⚡ ${logMsg}`);
      }
    });

    next();
  });

  // -----------------------------------------------------------
  // HEALTH & READINESS (split para Cloud Run)
  // -----------------------------------------------------------
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  app.get("/api/ready", async (_req, res) => {
    const checks = {
      process: true,
      odbc: odbcModule !== null,
    };
    const allReady = Object.values(checks).every(Boolean);
    res.status(allReady ? 200 : 503).json({
      status: allReady ? "READY" : "NOT_READY",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/metrics", (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      memory: {
        rssMb: (memory.rss / 1024 / 1024).toFixed(2),
        heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMb: (memory.heapTotal / 1024 / 1024).toFixed(2),
      },
      rateLimiters: {
        global: globalLimiter.getStats(),
        sheetsProxy: sheetsProxyLimiter.getStats(),
      },
      odbcLoaded: odbcModule !== null,
      timestamp: new Date().toISOString(),
    });
  });

  // -----------------------------------------------------------
  // GOOGLE APPS SCRIPT PROXY (COM ALLOWLIST ANTI-SSRF)
  // -----------------------------------------------------------
  app.get("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl } = req.query;

      if (!isAllowedProxyUrl(apiUrl)) {
        return res.status(400).json({
          error: "URL de destino não permitida. Apenas script.google.com é aceito.",
        });
      }

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "text/csv, text/plain, application/json, */*" },
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json(await response.json());
      }
      const text = await response.text();
      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.send(text);
      }
    } catch (err: any) {
      console.error("Sheets proxy GET error:", err?.message || err);
      res.status(500).json({ error: `Erro no proxy Google Sheets: ${err?.message || err}` });
    }
  });

  app.post("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl, payload } = req.body;

      if (!isAllowedProxyUrl(apiUrl)) {
        return res.status(400).json({
          error: "URL de destino não permitida. Apenas script.google.com é aceito.",
        });
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload || {}),
      });

      res.json({ status: "success", statusCode: response.status, ok: response.ok });
    } catch (err: any) {
      console.error("Sheets proxy POST error:", err?.message || err);
      res.status(500).json({ error: `Erro ao enviar via proxy: ${err?.message || err}` });
    }
  });

  // -----------------------------------------------------------
  // ODBC WMS QUERY CONNECTOR
  // -----------------------------------------------------------
  app.post("/api/odbc/execute", async (req, res) => {
    try {
      const { queryId, params } = req.body;

      const catalogEntry = SQL_CATALOG.find((q) => q.id === queryId);
      if (!catalogEntry) {
        return res.status(403).json({ error: "Query ID inválido ou não autorizado." });
      }

      const safeSql = resolveSqlTemplate(catalogEntry.sql, params || {});

      const { AS400_HOST, AS400_PORT, AS400_USER, AS400_PASSWORD, AS400_SCHEMA } = process.env;

      // Se ODBC não carregou, responde 503 em vez de mock silencioso.
      if (!odbcModule) {
        return res.status(503).json({
          status: "INDISPONIVEL",
          source: "ODBC_UNAVAILABLE",
          error: "Driver ODBC não carregado. Instale unixodbc-dev e `npm i odbc`.",
          queryId,
          sql: safeSql,
        });
      }

      // Se credenciais não configuradas → 503 explícito, sem cair em mock.
      if (!AS400_HOST || !AS400_USER || !AS400_PASSWORD) {
        return res.status(503).json({
          status: "NAO_CONFIGURADO",
          source: "NO_CREDENTIALS",
          error: "Variáveis AS400_HOST/USER/PASSWORD não configuradas.",
          queryId,
          sql: safeSql,
        });
      }

      const connStr = buildAs400ConnString({
        host: AS400_HOST,
        port: AS400_PORT,
        schema: AS400_SCHEMA,
        usuario: AS400_USER,
        senha: AS400_PASSWORD,
      });

      let connection: any = null;
      try {
        connection = await odbcModule.connect(connStr);
        const result = await connection.query(safeSql);

        return res.json({
          status: "OK",
          source: "ODBC_AS400",
          queryId,
          sql: safeSql,
          totalRows: Array.isArray(result) ? result.length : 0,
          rows: result,
        });
      } catch (err: any) {
        const safeMsg = redactPwd(err?.message || String(err));
        console.error("ODBC query error:", safeMsg);
        return res.status(502).json({
          status: "ERRO",
          source: "ODBC_AS400",
          error: `Falha na execução ODBC: ${safeMsg}`,
          queryId,
          sql: safeSql,
        });
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err: any) {
      res.status(500).json({ error: `Erro na execução da query ODBC: ${err?.message || err}` });
    }
  });

  // -----------------------------------------------------------
  // AS/400 TEST CONNECTION — TESTE REAL (não simulado)
  // -----------------------------------------------------------
  app.post("/api/as400/test-connection", async (req, res) => {
    const { host, port, schema, usuario, senha } = req.body || {};

    if (!host || !usuario || !senha) {
      return res.status(400).json({
        status: "ERRO",
        error: "Parâmetros obrigatórios: host, usuario, senha.",
      });
    }

    if (!odbcModule) {
      return res.status(503).json({
        status: "INDISPONIVEL",
        error: "Driver ODBC não carregado neste ambiente.",
      });
    }

    const connStr = buildAs400ConnString({
      host,
      port,
      schema,
      usuario,
      senha,
    });

    const t0 = performance.now();
    let connection: any = null;

    try {
      connection = await odbcModule.connect(connStr);
      const probe = await connection.query(
        "SELECT 1 AS OK FROM SYSIBM.SYSDUMMY1 FETCH FIRST 1 ROW ONLY"
      );
      const latencyMs = Math.round(performance.now() - t0);

      return res.json({
        status: "ONLINE",
        handshake: "OK",
        host,
        port: port || 8471,
        schema: schema || "NEWGES",
        usuario,
        latencyMs,
        probe,
        testedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const safeMsg = redactPwd(err?.message || String(err));
      console.error("AS400 test-connection error:", safeMsg);
      return res.status(502).json({
        status: "OFFLINE",
        error: safeMsg,
        latencyMs: Math.round(performance.now() - t0),
        testedAt: new Date().toISOString(),
      });
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {
          /* ignore */
        }
      }
    }
  });

  // -----------------------------------------------------------
  // AS/400 EXECUTE QUERY — delega para ODBC com marcador honesto
  // -----------------------------------------------------------
  app.post("/api/as400/execute-query", async (req, res) => {
    try {
      const { host, port, schema, usuario, senha, queryId, sql } = req.body || {};

      console.log(`[AS/400] Execução: ID=${queryId}, Schema=${schema || "NEWGES"}`);

      // Se ODBC + credenciais disponíveis → execução real.
      if (odbcModule && host && usuario && senha && sql) {
        const connStr = buildAs400ConnString({ host, port, schema, usuario, senha });
        let connection: any = null;
        try {
          connection = await odbcModule.connect(connStr);
          const rows = await connection.query(sql);
          return res.json({
            status: "OK",
            source: "ODBC_AS400",
            queryId: queryId || "AS400_QUERY",
            host,
            schema: schema || "NEWGES",
            executedAt: new Date().toISOString(),
            totalRows: Array.isArray(rows) ? rows.length : 0,
            rows,
          });
        } catch (err: any) {
          const safeMsg = redactPwd(err?.message || String(err));
          console.error("AS/400 execute error:", safeMsg);
          return res.status(502).json({
            status: "ERRO",
            source: "ODBC_AS400",
            error: safeMsg,
          });
        } finally {
          if (connection) {
            try {
              await connection.close();
            } catch {
              /* ignore */
            }
          }
        }
      }

      // Fallback explícito: fonte de dados claramente marcada como mock.
      const sampleAs400Stock: any[] = [
        { ARTICLE: "78910001", DESIGNATION: "DETERGENTE CONCENTRADO 500ML", SECTEUR: "87", RUA: "8701", ADRESSE_PICKING: "8701-01-A", QTE_STOCK: 120, QTE_PICKING: 48, QTE_DEMANDA: 72, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78910002", DESIGNATION: "DESINFETANTE MULTIUSO 1L", SECTEUR: "87", RUA: "8702", ADRESSE_PICKING: "8702-02-B", QTE_STOCK: 84, QTE_PICKING: 24, QTE_DEMANDA: 60, STATUS: "PENDENTE" },
        { ARTICLE: "78910003", DESIGNATION: "AMACIANTE TOQUE SUAVE 2L", SECTEUR: "87", RUA: "8703", ADRESSE_PICKING: "8703-01-A", QTE_STOCK: 40, QTE_PICKING: 18, QTE_DEMANDA: 22, STATUS: "CONCLUIDO" },
        { ARTICLE: "78920010", DESIGNATION: "SABAO EM PO LAVAGEM PROFUNDA 1KG", SECTEUR: "88", RUA: "8801", ADRESSE_PICKING: "8801-01-A", QTE_STOCK: 180, QTE_PICKING: 36, QTE_DEMANDA: 144, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78920020", DESIGNATION: "AGUA SANITARIA CLORADA 2L", SECTEUR: "88", RUA: "8802", ADRESSE_PICKING: "8802-01-C", QTE_STOCK: 60, QTE_PICKING: 18, QTE_DEMANDA: 42, STATUS: "PENDENTE" },
        { ARTICLE: "78930050", DESIGNATION: "PAPEL HIGIENICO COMPACTO 16UN", SECTEUR: "89", RUA: "8901", ADRESSE_PICKING: "8901-03-C", QTE_STOCK: 160, QTE_PICKING: 40, QTE_DEMANDA: 120, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78940001", DESIGNATION: "PALLET FECHADO BEBIDA ISOTONICA 500ML", SECTEUR: "90", RUA: "9001", ADRESSE_PICKING: "9001-01-PLT", QTE_STOCK: 720, QTE_PICKING: 720, QTE_DEMANDA: 720, STATUS: "ATENDIDA" },
      ];

      return res.json({
        status: "OK",
        source: "MOCK_FALLBACK", // cliente PODE avisar o usuário que é fake
        queryId: queryId || "AUD001",
        host: host || "AS400_HOST",
        schema: schema || "NEWGES",
        executedAt: new Date().toISOString(),
        totalRows: sampleAs400Stock.length,
        rows: sampleAs400Stock,
      });
    } catch (err: any) {
      res.status(500).json({ error: `Erro na execução AS/400: ${err?.message || err}` });
    }
  });

  // -----------------------------------------------------------
  // OFFLINE SYNC BRIDGE
  // -----------------------------------------------------------
  app.post("/api/replenishment/offline-sync", async (req, res) => {
    try {
      const { items } = req.body || {};
      const count = Array.isArray(items) ? items.length : 0;
      console.log(`[OfflineSync] Recebidos ${count} registros offline.`);

      res.json({
        status: "SUCCESS",
        receivedCount: count,
        syncedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: `Erro no sync: ${err?.message || err}` });
    }
  });

  // -----------------------------------------------------------
  // MIDDLEWARE DE VITE (dev) / ESTÁTICOS (prod)
  // -----------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true,
      })
    );

    app.use(
      express.static(distPath, {
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        },
      })
    );

    // SPA fallback — MAS respeitando /api/* (retorna 404 JSON, não HTML).
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Endpoint não encontrado" });
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // -----------------------------------------------------------
  // LISTEN + GRACEFUL SHUTDOWN
  // -----------------------------------------------------------
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
    console.log(`   ODBC: ${odbcModule ? "carregado" : "indisponível (modo degradado)"}`);
    console.log(`   Proxy allowlist: ${[...ALLOWED_PROXY_HOSTS].join(", ")}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} recebido — encerrando servidor...`);
    globalLimiter.destroy();
    sheetsProxyLimiter.destroy();
    server.close(() => {
      console.log("Servidor encerrado.");
      process.exit(0);
    });
    // Força saída se algum handler travar.
    setTimeout(() => {
      console.error("Shutdown forçado após timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("❌ Falha ao iniciar servidor:", err);
  process.exit(1);
});
