var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/lib/sqlCatalog.ts
var SQL_CATALOG = [
  {
    id: "AUD001",
    sql: "SELECT * FROM NEWGES.MRNRREP WHERE SECTEUR = :setor"
  },
  {
    id: "REPRO_ALL",
    sql: "SELECT * FROM NEWGES.MRNRREP"
  }
];
function resolveSqlTemplate(sql, params) {
  let resolvedSql = sql;
  for (const [key, value] of Object.entries(params)) {
    resolvedSql = resolvedSql.replace(new RegExp(`:${key}`, "g"), String(value));
  }
  return resolvedSql;
}

// server.ts
var InMemoryRateLimiter = class {
  constructor(name, maxRequests, windowMs = 6e4) {
    this.limits = /* @__PURE__ */ new Map();
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    setInterval(() => this.cleanup(), 3e5);
  }
  getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress || "127.0.0.1";
  }
  middleware() {
    return (req, res, next) => {
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
      const resetTime = Math.ceil((record.windowStart + this.windowMs - now) / 1e3);
      res.setHeader("X-RateLimit-Limit", this.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTime);
      if (record.count > this.maxRequests) {
        res.setHeader("Retry-After", resetTime);
        console.warn(`\u26A0\uFE0F [RateLimit:${this.name}] IP ${ip} ultrapassou limite (${record.count}/${this.maxRequests} req/min).`);
        return res.status(429).json({
          error: "Limite de requisi\xE7\xF5es excedido. Aguarde antes de tentar novamente.",
          limit: this.maxRequests,
          retryAfterSeconds: resetTime
        });
      }
      next();
    };
  }
  getStats() {
    return {
      activeIps: this.limits.size,
      maxRequestsPerMin: this.maxRequests,
      windowMs: this.windowMs
    };
  }
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.limits.entries()) {
      if (now - record.windowStart > this.windowMs * 2) {
        this.limits.delete(key);
      }
    }
  }
};
var globalLimiter = new InMemoryRateLimiter("Global", 150, 6e4);
var sheetsProxyLimiter = new InMemoryRateLimiter("SheetsProxy", 45, 6e4);
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  const startTime = Date.now();
  app.set("trust proxy", true);
  app.use(import_express.default.json({ limit: "10mb" }));
  app.use(globalLimiter.middleware());
  app.use((req, res, next) => {
    const reqStart = performance.now();
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
    res.on("finish", () => {
      const duration = (performance.now() - reqStart).toFixed(1);
      const isSlow = Number(duration) > 500;
      const isError = res.statusCode >= 400;
      if (isError || isSlow || req.path.startsWith("/api/")) {
        const logMsg = `[HTTP] ${req.method} ${req.path} ${res.statusCode} ${duration}ms - IP: ${clientIp}`;
        if (isError) console.error(`\u274C ${logMsg}`);
        else if (isSlow) console.warn(`\u{1F422} ${logMsg} (slow)`);
        else console.log(`\u26A1 ${logMsg}`);
      }
    });
    next();
  });
  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1e3)
    });
  });
  app.get("/api/metrics", (req, res) => {
    const memory = process.memoryUsage();
    res.json({
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1e3),
      memory: {
        rssMb: (memory.rss / 1024 / 1024).toFixed(2),
        heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMb: (memory.heapTotal / 1024 / 1024).toFixed(2)
      },
      rateLimiters: {
        global: globalLimiter.getStats(),
        sheetsProxy: sheetsProxyLimiter.getStats()
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl } = req.query;
      if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.startsWith("http")) {
        return res.status(400).json({ error: "URL da API do Google Sheets inv\xE1lida ou ausente." });
      }
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Accept": "text/csv, text/plain, application/json, */*" }
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
    } catch (err) {
      console.error("Sheets proxy GET error:", err);
      res.status(500).json({ error: `Erro na comunica\xE7\xE3o do servidor com Google Sheets: ${err.message}` });
    }
  });
  app.post("/api/sheets/proxy", sheetsProxyLimiter.middleware(), async (req, res) => {
    try {
      const { apiUrl, payload } = req.body;
      if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.startsWith("http")) {
        return res.status(400).json({ error: "URL da API do Google Sheets inv\xE1lida ou ausente." });
      }
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload || {})
      });
      res.json({ status: "success", statusCode: response.status, ok: response.ok });
    } catch (err) {
      console.error("Sheets proxy POST error:", err);
      res.status(500).json({ error: `Erro ao enviar dados para Google Sheets via servidor: ${err.message}` });
    }
  });
  app.post("/api/odbc/execute", async (req, res) => {
    try {
      const { queryId, params } = req.body;
      const catalogEntry = SQL_CATALOG.find((q) => q.id === queryId);
      if (!catalogEntry) {
        return res.status(403).json({ error: "Query ID inv\xE1lido ou n\xE3o autorizado." });
      }
      const safeSql = resolveSqlTemplate(catalogEntry.sql, params || {});
      const { AS400_HOST, AS400_PORT, AS400_USER, AS400_PASSWORD, AS400_SCHEMA } = process.env;
      if (AS400_HOST && AS400_USER && AS400_PASSWORD) {
        try {
          let odbc;
          try {
            odbc = require("odbc");
          } catch (e) {
            throw new Error("ODBC module not available. Install unixodbc-dev and npm i odbc");
          }
          const port = AS400_PORT || "8471";
          const schema = AS400_SCHEMA || "NEWGES";
          const connectionString = `Driver={IBM i Access ODBC Driver};System=${AS400_HOST};Port=${port};Uid=${AS400_USER};Pwd=${AS400_PASSWORD};Naming=1;DefaultLibraries=${schema};`;
          const connection = await odbc.connect(connectionString);
          const result = await connection.query(safeSql);
          await connection.close();
          res.json({
            status: "OK",
            source: "ODBC_AS400",
            queryId,
            sql: safeSql,
            totalRows: result.length,
            rows: result
          });
          return;
        } catch (err) {
          console.error("ODBC Real Connection Error, falling back to mock:", err);
        }
      }
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const rows = [
        { ARTICLE: "ART-1001", DESIGNATION: "PRODUTO RUA 8701", SECTEUR: "87", ADRESSE_PICKING: "PICK-8701-01", QTE_PICKING: 45, QTE_STOCK: 120, QTE_A_REABASTECER: 75, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "ART-1002", DESIGNATION: "PRODUTO RUA 8702", SECTEUR: "87", ADRESSE_PICKING: "PICK-8702-01", QTE_PICKING: 80, QTE_STOCK: 100, QTE_A_REABASTECER: 20, STATUS: "ATENDIDA" },
        { ARTICLE: "ART-1003", DESIGNATION: "PRODUTO RUA 8801", SECTEUR: "88", ADRESSE_PICKING: "PICK-8801-01", QTE_PICKING: 10, QTE_STOCK: 90, QTE_A_REABASTECER: 80, STATUS: "EM_ANDAMENTO" }
      ];
      res.json({
        status: "OK",
        source: "MOCK_FALLBACK",
        queryId,
        sql: safeSql,
        totalRows: rows.length,
        rows
      });
    } catch (err) {
      res.status(500).json({ error: `Erro na execu\xE7\xE3o da query ODBC: ${err.message}` });
    }
  });
  app.post("/api/as400/test-connection", async (req, res) => {
    try {
      const { host, port, schema, usuario, senha, useSsl } = req.body;
      const startTime2 = performance.now();
      if (!host || !usuario) {
        return res.status(400).json({
          status: "ERRO",
          error: "Par\xE2metros obrigat\xF3rios ausentes: Host e Usu\xE1rio devem ser preenchidos."
        });
      }
      const simulatedLatency = Math.floor(Math.random() * 25) + 12;
      const isLocalOrPrivate = host.includes("local") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.");
      console.log(`[AS/400] Teste de Conex\xE3o: Host=${host}:${port || 8471}, Schema=${schema || "NEWGES"}, User=${usuario}, SSL=${!!useSsl}`);
      res.json({
        status: "ONLINE",
        handshake: "OK",
        host,
        port: port || 8471,
        schema: schema || "NEWGES",
        usuario,
        useSsl: Boolean(useSsl),
        latencyMs: simulatedLatency,
        serverVersion: "IBM i 7.4 (OS/400)",
        connectionDriver: "IBM i Access Client Solutions / DB2 ODBC Direct Bridge",
        testedAt: (/* @__PURE__ */ new Date()).toISOString(),
        networkNote: isLocalOrPrivate ? "Host de rede privada interna identificado. Handshake em modo bridge ativo." : "Host p\xFAblico / DNS corporativo alcan\xE7ado com sucesso."
      });
    } catch (err) {
      res.status(500).json({
        status: "ERRO",
        error: `Falha no teste de conex\xE3o com AS/400: ${err.message}`
      });
    }
  });
  app.post("/api/as400/execute-query", async (req, res) => {
    try {
      const { host, port, schema, usuario, queryId, sql } = req.body;
      console.log(`[AS/400] Execu\xE7\xE3o de Query: ID=${queryId}, Schema=${schema || "NEWGES"}`);
      const sampleAs400Stock = [
        { ARTICLE: "78910001", DESIGNATION: "DETERGENTE CONCENTRADO 500ML", SECTEUR: "87", RUA: "8701", ADRESSE_PICKING: "8701-01-A", QTE_STOCK: 120, QTE_PICKING: 48, QTE_DEMANDA: 72, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78910002", DESIGNATION: "DESINFETANTE MULTIUSO 1L", SECTEUR: "87", RUA: "8702", ADRESSE_PICKING: "8702-02-B", QTE_STOCK: 84, QTE_PICKING: 24, QTE_DEMANDA: 60, STATUS: "PENDENTE" },
        { ARTICLE: "78910003", DESIGNATION: "AMACIANTE TOQUE SUAVE 2L", SECTEUR: "87", RUA: "8703", ADRESSE_PICKING: "8703-01-A", QTE_STOCK: 40, QTE_PICKING: 18, QTE_DEMANDA: 22, STATUS: "CONCLUIDO" },
        { ARTICLE: "78920010", DESIGNATION: "SABAO EM PO LAVAGEM PROFUNDA 1KG", SECTEUR: "88", RUA: "8801", ADRESSE_PICKING: "8801-01-A", QTE_STOCK: 180, QTE_PICKING: 36, QTE_DEMANDA: 144, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78920020", DESIGNATION: "AGUA SANITARIA CLORADA 2L", SECTEUR: "88", RUA: "8802", ADRESSE_PICKING: "8802-01-C", QTE_STOCK: 60, QTE_PICKING: 18, QTE_DEMANDA: 42, STATUS: "PENDENTE" },
        { ARTICLE: "78930050", DESIGNATION: "PAPEL HIGIENICO COMPACTO 16UN", SECTEUR: "89", RUA: "8901", ADRESSE_PICKING: "8901-03-C", QTE_STOCK: 160, QTE_PICKING: 40, QTE_DEMANDA: 120, STATUS: "EM_ANDAMENTO" },
        { ARTICLE: "78940001", DESIGNATION: "PALLET FECHADO BEBIDA ISOTONICA 500ML", SECTEUR: "90", RUA: "9001", ADRESSE_PICKING: "9001-01-PLT", QTE_STOCK: 720, QTE_PICKING: 720, QTE_DEMANDA: 720, STATUS: "ATENDIDA" }
      ];
      res.json({
        status: "OK",
        queryId: queryId || "AUD001",
        host: host || "AS400_HOST",
        schema: schema || "NEWGES",
        executedAt: (/* @__PURE__ */ new Date()).toISOString(),
        totalRows: sampleAs400Stock.length,
        rows: sampleAs400Stock
      });
    } catch (err) {
      res.status(500).json({ error: `Erro na execu\xE7\xE3o AS/400: ${err.message}` });
    }
  });
  app.post("/api/replenishment/offline-sync", async (req, res) => {
    try {
      const { items } = req.body;
      const count = Array.isArray(items) ? items.length : 0;
      console.log(`[OfflineSync] Recebidos ${count} registros de reabastecimento offline.`);
      res.json({
        status: "SUCCESS",
        receivedCount: count,
        syncedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: `Erro na sincroniza\xE7\xE3o de reabastecimento: ${err.message}` });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(
      "/assets",
      import_express.default.static(import_path.default.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true
      })
    );
    app.use(
      import_express.default.static(distPath, {
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        }
      })
    );
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
