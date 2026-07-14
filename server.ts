import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { db } from "./src/db/index.ts";
import { records } from "./src/db/schema.ts";
import { eq, and } from "drizzle-orm";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 10mb limit for bulk sync uploads
  app.use(express.json({ limit: "10mb" }));

  // API: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // API: Sync User auth/profile
  app.post("/api/auth/sync-user", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || "";
      const name = req.user!.name || "";
      const dbUser = await getOrCreateUser(uid, email, name);
      res.json({ status: "success", user: dbUser });
    } catch (err: any) {
      console.error("Sync user error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API: Fetch all records for user
  app.get("/api/records", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const dbUser = await getOrCreateUser(uid, req.user!.email || "");
      
      const userRecords = await db.select()
        .from(records)
        .where(eq(records.userId, dbUser.id))
        .orderBy(records.timestamp);
        
      res.json(userRecords);
    } catch (err: any) {
      console.error("Fetch records error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API: Bulk upload and sync records
  app.post("/api/records/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { logs } = req.body;
      if (!logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: "Invalid logs payload" });
      }
      
      const uid = req.user!.uid;
      const dbUser = await getOrCreateUser(uid, req.user!.email || "");

      const syncedLogs = [];
      for (const log of logs) {
        const result = await db.insert(records)
          .values({
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
            tipo: log.tipo,
          })
          .onConflictDoUpdate({
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
              tipo: log.tipo,
            }
          })
          .returning();
        syncedLogs.push(result[0]);
      }
      
      res.json({ status: "success", count: syncedLogs.length, logs: syncedLogs });
    } catch (err: any) {
      console.error("Sync records error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API: Delete specific record
  app.delete("/api/records/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseFloat(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid record ID" });
      }
      
      const uid = req.user!.uid;
      const dbUser = await getOrCreateUser(uid, req.user!.email || "");
      
      const result = await db.delete(records)
        .where(and(eq(records.id, id), eq(records.userId, dbUser.id)))
        .returning();
        
      if (result.length === 0) {
        return res.status(404).json({ error: "Record not found or unauthorized" });
      }
      
      res.json({ status: "success", deletedId: id });
    } catch (err: any) {
      console.error("Delete record error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API: Delete all records (clear DB)
  app.delete("/api/records", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const dbUser = await getOrCreateUser(uid, req.user!.email || "");
      
      await db.delete(records)
        .where(eq(records.userId, dbUser.id));
        
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("Clear records error:", err);
      res.status(500).json({ error: err.message });
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
