import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

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

  constructor(name: string, maxRequests: number, windowMs: number = 60000) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Automatic GC every 5 minutes to prevent memory leaks
    setInterval(() => this.cleanup(), 300000);
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress || "127.0.0.1";
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

      // Security standard RateLimit headers
      res.setHeader("X-RateLimit-Limit", this.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTime);

      if (record.count > this.maxRequests) {
        res.setHeader("Retry-After", resetTime);
        console.warn(`⚠️ [RateLimit:${this.name}] IP ${ip} ultrapassou limite (${record.count}/${this.maxRequests} req/min).`);
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
    };
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

// Global Limiter: 150 req/min per IP
const globalLimiter = new InMemoryRateLimiter("Global", 150, 60000);

// Strict Proxy/Sync Limiter: 45 req/min per IP (Protects Google Apps Script and DB quotas)
const sheetsProxyLimiter = new InMemoryRateLimiter("SheetsProxy", 45, 60000);

// -------------------------------------------------------------
// 2. SERVER INITIALIZATION & ARCHITECTURE
// -------------------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = 3000;
  const startTime = Date.now();

  // Trust proxy for accurate Cloud Run / Nginx / Vercel client IP extraction
  app.set("trust proxy", true);

  // Body parser with 10mb limit for bulk sync uploads
  app.use(express.json({ limit: "10mb" }));

  // Global Rate Limiter applied to all routes
  app.use(globalLimiter.middleware());

  // Structured Request Logging Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqStart = performance.now();
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

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

  // API: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  // API: Diagnostics & Server Metrics
  app.get("/api/metrics", (req, res) => {
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
      timestamp: new Date().toISOString(),
    });
  });

  // API: Google Apps Script CORS Proxy (GET and POST) with Strict Rate Limiting
  app.get("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl } = req.query;
      if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.startsWith("http")) {
        return res.status(400).json({ error: "URL da API do Google Sheets inválida ou ausente." });
      }

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Accept": "text/csv, text/plain, application/json, */*" },
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        return res.json(data);
      } else {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          return res.json(json);
        } catch {
          return res.send(text);
        }
      }
    } catch (err: any) {
      console.error("Sheets proxy GET error:", err);
      res.status(500).json({ error: `Erro na comunicação do servidor com Google Sheets: ${err.message}` });
    }
  });

  app.post("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl, payload } = req.body;
      if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.startsWith("http")) {
        return res.status(400).json({ error: "URL da API do Google Sheets inválida ou ausente." });
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload || {}),
      });

      res.json({ status: "success", statusCode: response.status, ok: response.ok });
    } catch (err: any) {
      console.error("Sheets proxy POST error:", err);
      res.status(500).json({ error: `Erro ao enviar dados para Google Sheets via servidor: ${err.message}` });
    }
  });

  // API: Visual Studio AI & ODBC WMS Query Connector Bridge
  app.post("/api/odbc/query", async (req, res) => {
    try {
      const { queryId, sql, summaries } = req.body;
      const todayStr = new Date().toISOString().split('T')[0];

      // Simulated DB2/NEWGES WMS Dataset builder for Visual Studio AI
      let rows: any[] = [];
      if (Array.isArray(summaries) && summaries.length > 0) {
        rows = summaries.map((s: any, idx: number) => ({
          ARTICLE: `ART-${(1001 + idx)}`,
          DESIGNATION: `ARTIGO REABASTECIMENTO ${s.rua}`,
          SECTEUR: s.setor || '87',
          UNIVERS: `UNI-${s.setor || '87'}`,
          CLASSE: 'PADRAO',
          ADRESSE_PICKING: `PICK-${s.rua}-01`,
          QTE_PICKING: s.realizado || 0,
          QTE_STOCK: s.demanda ? (s.demanda + 50) : 100,
          QTE_A_REABASTECER: s.pendente || 0,
          STATUS: s.status || 'EM_ANDAMENTO',
          EPH: s.eph || '0.0',
          VPH: s.vph || '0.0',
          DATE_EXEC: todayStr
        }));
      } else {
        rows = [
          { ARTICLE: 'ART-1001', DESIGNATION: 'PRODUTO RUA 8701', SECTEUR: '87', ADRESSE_PICKING: 'PICK-8701-01', QTE_PICKING: 45, QTE_STOCK: 120, QTE_A_REABASTECER: 75, STATUS: 'EM_ANDAMENTO' },
          { ARTICLE: 'ART-1002', DESIGNATION: 'PRODUTO RUA 8702', SECTEUR: '87', ADRESSE_PICKING: 'PICK-8702-01', QTE_PICKING: 80, QTE_STOCK: 100, QTE_A_REABASTECER: 20, STATUS: 'ATENDIDA' },
          { ARTICLE: 'ART-1003', DESIGNATION: 'PRODUTO RUA 8801', SECTEUR: '88', ADRESSE_PICKING: 'PICK-8801-01', QTE_PICKING: 10, QTE_STOCK: 90, QTE_A_REABASTECER: 80, STATUS: 'EM_ANDAMENTO' }
        ];
      }

      res.json({
        status: "OK",
        queryId: queryId || 'CUSTOM_ODBC',
        sql: sql || 'SELECT * FROM NEWGES.MRNRREP',
        totalRows: rows.length,
        rows
      });
    } catch (err: any) {
      res.status(500).json({ error: `Erro na execução da query ODBC: ${err.message}` });
    }
  });

  // Vite development middleware vs Static Production files serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    // Static Assets Caching (Prevents repeated expensive bandwidth downloads)
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

    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
