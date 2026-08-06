import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 10mb limit for bulk sync uploads
  app.use(express.json({ limit: "10mb" }));

  // API: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // API: Google Apps Script CORS Proxy (GET and POST)
  app.get("/api/sheets/proxy", async (req, res) => {
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

  app.post("/api/sheets/proxy", async (req, res) => {
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
