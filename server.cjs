var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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

// src/lib/firebase-admin.ts
var import_app = require("firebase-admin/app");
var import_auth = require("firebase-admin/auth");

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0708272134",
  appId: "1:602188484294:web:152df4dbdb06a2f7a911c7",
  apiKey: "AIzaSyAkciOnsQ5KqkOIfMB7ejI2Ovtw-80P1Dk",
  authDomain: "gen-lang-client-0708272134.firebaseapp.com",
  storageBucket: "gen-lang-client-0708272134.firebasestorage.app",
  messagingSenderId: "602188484294",
  measurementId: ""
};

// src/lib/firebase-admin.ts
if (!(0, import_app.getApps)().length) {
  (0, import_app.initializeApp)({
    projectId: firebase_applet_config_default.projectId
  });
}
var adminAuth = (0, import_auth.getAuth)();

// src/middleware/auth.ts
var requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// src/db/index.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = __toESM(require("pg"), 1);

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  records: () => records,
  recordsRelations: () => recordsRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_orm = require("drizzle-orm");
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.integer)("id").primaryKey().generatedAlwaysAsIdentity(),
  uid: (0, import_pg_core.text)("uid").notNull().unique(),
  // Firebase Auth UID
  email: (0, import_pg_core.text)("email").notNull(),
  name: (0, import_pg_core.text)("name"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var records = (0, import_pg_core.pgTable)("records", {
  id: (0, import_pg_core.doublePrecision)("id").primaryKey(),
  // Using double precision to store JavaScript Date.now() + Math.random() safely
  userId: (0, import_pg_core.integer)("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  data: (0, import_pg_core.text)("data").notNull(),
  dia: (0, import_pg_core.text)("dia").notNull(),
  semana: (0, import_pg_core.integer)("semana").notNull(),
  atividade: (0, import_pg_core.text)("atividade").notNull(),
  colaborador: (0, import_pg_core.text)("colaborador").notNull(),
  setor: (0, import_pg_core.text)("setor"),
  volumes: (0, import_pg_core.integer)("volumes").notNull(),
  horas: (0, import_pg_core.doublePrecision)("horas").notNull(),
  vph: (0, import_pg_core.text)("vph").notNull(),
  timestamp: (0, import_pg_core.doublePrecision)("timestamp").notNull(),
  synced: (0, import_pg_core.boolean)("synced").default(true).notNull(),
  tipo: (0, import_pg_core.text)("tipo").notNull(),
  // 'direta' | 'indireta'
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var usersRelations = (0, import_drizzle_orm.relations)(users, ({ many }) => ({
  records: many(records)
}));
var recordsRelations = (0, import_drizzle_orm.relations)(records, ({ one }) => ({
  user: one(users, {
    fields: [records.userId],
    references: [users.id]
  })
}));

// src/db/index.ts
var { Pool } = import_pg.default;
var createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15e3
  });
};
var pool = createPool();
pool.on("error", (err) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});
var db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });

// src/db/users.ts
async function getOrCreateUser(uid, email, name) {
  try {
    const result = await db.insert(users).values({
      uid,
      email,
      name: name || null
    }).onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        name: name || null
      }
    }).returning();
    return result[0];
  } catch (error) {
    console.error("Database user query failed:", error);
    throw new Error("Database query failed. Please try again later.", { cause: error });
  }
}

// server.ts
var import_drizzle_orm2 = require("drizzle-orm");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "10mb" }));
  app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/auth/sync-user", requireAuth, async (req, res) => {
    try {
      const uid = req.user.uid;
      const email = req.user.email || "";
      const name = req.user.name || "";
      const dbUser = await getOrCreateUser(uid, email, name);
      res.json({ status: "success", user: dbUser });
    } catch (err) {
      console.error("Sync user error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/records", requireAuth, async (req, res) => {
    try {
      const uid = req.user.uid;
      const dbUser = await getOrCreateUser(uid, req.user.email || "");
      const userRecords = await db.select().from(records).where((0, import_drizzle_orm2.eq)(records.userId, dbUser.id)).orderBy(records.timestamp);
      res.json(userRecords);
    } catch (err) {
      console.error("Fetch records error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/records/sync", requireAuth, async (req, res) => {
    try {
      const { logs } = req.body;
      if (!logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: "Invalid logs payload" });
      }
      const uid = req.user.uid;
      const dbUser = await getOrCreateUser(uid, req.user.email || "");
      const syncedLogs = [];
      for (const log of logs) {
        const result = await db.insert(records).values({
          id: log.id,
          userId: dbUser.id,
          data: log.data,
          dia: log.dia,
          semana: log.semana,
          atividade: log.atividade,
          colaborador: log.colaborador,
          setor: log.setor || null,
          volumes: log.volumes,
          horas: log.horas,
          vph: log.vph,
          timestamp: log.timestamp,
          synced: true,
          tipo: log.tipo
        }).onConflictDoUpdate({
          target: records.id,
          set: {
            data: log.data,
            dia: log.dia,
            semana: log.semana,
            atividade: log.atividade,
            colaborador: log.colaborador,
            setor: log.setor || null,
            volumes: log.volumes,
            horas: log.horas,
            vph: log.vph,
            timestamp: log.timestamp,
            synced: true,
            tipo: log.tipo
          }
        }).returning();
        syncedLogs.push(result[0]);
      }
      res.json({ status: "success", count: syncedLogs.length, logs: syncedLogs });
    } catch (err) {
      console.error("Sync records error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/records/:id", requireAuth, async (req, res) => {
    try {
      const id = parseFloat(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid record ID" });
      }
      const uid = req.user.uid;
      const dbUser = await getOrCreateUser(uid, req.user.email || "");
      const result = await db.delete(records).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(records.id, id), (0, import_drizzle_orm2.eq)(records.userId, dbUser.id))).returning();
      if (result.length === 0) {
        return res.status(404).json({ error: "Record not found or unauthorized" });
      }
      res.json({ status: "success", deletedId: id });
    } catch (err) {
      console.error("Delete record error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/records", requireAuth, async (req, res) => {
    try {
      const uid = req.user.uid;
      const dbUser = await getOrCreateUser(uid, req.user.email || "");
      await db.delete(records).where((0, import_drizzle_orm2.eq)(records.userId, dbUser.id));
      res.json({ status: "success" });
    } catch (err) {
      console.error("Clear records error:", err);
      res.status(500).json({ error: err.message });
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
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
