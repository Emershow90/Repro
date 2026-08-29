import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

function parseRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const apiUrl = reqUrl.searchParams.get('apiUrl');
      if (!apiUrl || !apiUrl.startsWith('http')) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'URL da API do Google Sheets inválida ou ausente.' }));
        return;
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { Accept: 'text/csv, text/plain, application/json, */*' },
      });

      const contentType = response.headers.get('content-type') || '';
      res.setHeader('Content-Type', contentType || 'application/json');
      res.statusCode = 200;

      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.end(JSON.stringify(data));
      } else {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(json));
        } catch {
          res.end(text);
        }
      }
    } catch (err: any) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      res.end(JSON.stringify({ error: `Erro na comunicação com Google Sheets: ${err?.message || err}` }));
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { apiUrl, payload } = body || {};

      if (!apiUrl || typeof apiUrl !== 'string' || !apiUrl.startsWith('http')) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'URL da API do Google Sheets inválida ou ausente.' }));
        return;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload || {}),
      });

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', statusCode: response.status, ok: response.ok }));
    } catch (err: any) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      res.end(JSON.stringify({ error: `Erro ao enviar dados para Google Sheets: ${err?.message || err}` }));
    }
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Método não permitido.' }));
}
