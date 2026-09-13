/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Sheets Service — comunicação com Apps Script / planilha publicada.
 *
 * CORREÇÕES APLICADAS (Fase 1):
 *  - Backoff exponencial + jitter em postLogWithRetry (antes: linear)
 *  - Tier 3 no-cors retorna false (antes: mentia sucesso sem confirmação)
 *  - qtdEnderecos usa log.enderecos (antes: sempre log.volumes)
 *  - Novo campo `volumes` no payload singular
 *  - setor default 'NAO_DEFINIDO' (antes: '87' mascarava erro)
 *  - id: newLogId() (antes: Date.now() + idx colidia com newLogId)
 *  - fetchFromCloud não refaz o Sheets quando ambos falham
 */

import { Log, newLogId } from './types';
import { saveLog, getLogs, getUnsyncedLogs, saveLogsBulk } from './dbLocal';
import { saveLogsDirectly, fetchLogsDirectly } from './utils/supabase/client';
import { getWeekNumber, parseDateString, getDayOfWeekName } from './utils/dateUtils';
import { normalizeSectorId } from './utils/logUtils';
import { sheetsCircuitBreaker, globalJobGuard } from './utils/circuitBreaker';
import { telemetry } from './utils/telemetry';

/**
 * Normalizes any Google Sheets URL (e.g. published web page pubhtml, Apps Script URL, or published CSV)
 */
export function normalizeSheetUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();

  // Auto-convert Google Apps Script /dev URLs to production /exec Web App URLs
  if (trimmed.includes('script.google.com') && (trimmed.endsWith('/dev') || trimmed.includes('/dev?'))) {
    trimmed = trimmed.replace(/\/dev(\?.*)?$/, '/exec$1');
  }

  // If it's a published Google Spreadsheet page (pubhtml or pub)
  if (trimmed.includes('docs.google.com/spreadsheets/d/e/') || trimmed.includes('/pubhtml')) {
    let csvUrl = trimmed.replace(/\/pubhtml(\?.*)?$/, '/pub$1');
    if (csvUrl.includes('?')) {
      if (!csvUrl.includes('output=csv')) {
        csvUrl += '&output=csv';
      }
    } else {
      csvUrl += '?output=csv';
    }
    return csvUrl;
  }
  return trimmed;
}

/**
 * Parses CSV text from Google Sheets published CSV into structured objects
 */
function parseCSVData(csvText: string): Record<string, unknown>[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  if (lines.length <= 1) return [];

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim());
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(rowObj);
  }

  return rows;
}

function jsonpFetch(url: string, timeoutMs = 15000): Promise<any> {
  // Allowlist: JSONP só para Apps Script (evita execução arbitrária)
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    return Promise.reject(new Error('JSONP só é permitido para script.google.com'));
  }

  return new Promise((resolve, reject) => {
    const callbackName = 'jsonpCallback_' + Math.round(1000000 * Math.random());
    let cleanupDone = false;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout: Planilha demorou muito para responder'));
    }, timeoutMs);

    (window as any)[callbackName] = function (data: any) {
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    const separator = url.includes('?') ? '&' : '?';
    script.src = url + separator + 'callback=' + callbackName;

    script.onerror = () => {
      cleanup();
      reject(new Error('Falha no JSONP: Verifique acesso e conectividade. O script bloqueou ou não está disponível.'));
    };

    function cleanup() {
      if (cleanupDone) return;
      cleanupDone = true;
      clearTimeout(timeoutId);
      delete (window as any)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    document.head.appendChild(script);
  });
}

/**
 * Posts a log to Google Apps Script Web App (Aba: Controle de horas - Repro)
 */
export async function postToGoogleSheets(apiUrlInput: string, log: Log): Promise<boolean> {
  if (!apiUrlInput || !apiUrlInput.startsWith('http')) return false;
  const apiUrl = normalizeSheetUrl(apiUrlInput);

  const payload = {
    setor: log.setor || 'NAO_DEFINIDO',
    data: log.data,
    semana: log.semana,
    semanaAno: new Date().getFullYear(),
    atividade: log.atividade,
    colaborador: log.colaborador,
    // Usa `enderecos` quando disponível; senão, cai para `volumes` (legado)
    qtdEnderecos: log.enderecos ?? log.volumes,
    // Campo explícito para o Code.gs v2 mapear na coluna correta
    volumes: log.volumes,
    horas: log.horas,
    vph: log.vph,
    tipo: log.tipo || 'direta',
    horaInicio: log.horaInicio || '',
    horaFim: log.horaFim || '',
  };

  // Tier 1: Server-side proxy (/api/sheets/proxy) — único tier que confirma status real
  try {
    const proxyRes = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUrl, payload }),
    });

    if (proxyRes.ok) {
      const contentType = proxyRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = await proxyRes.json();
        if (result && result.status === 'success') {
          return true;
        }
      }
    }
  } catch {
    // Silencioso — cai para Tier 2
  }

  // Tier 2: Direct browser fetch com CORS
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (response.ok || response.type === 'opaque') {
      return true;
    }
  } catch (err) {
    console.warn('Direct Google Sheets CORS POST error, trying no-cors fallback:', err);
  }

  // Tier 3: no-cors — só confirma que a request SAIU, não que foi processada.
  // Retorna false para o retry continuar; confirmação vem via fetchFromCloud (dedup no App.tsx).
  try {
    await fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    telemetry.warn('sheetService', 'POST no-cors enviado — confirmação pendente via pull');
    return false;
  } catch (err) {
    console.warn('Google Sheets no-cors POST error:', err);
    return false;
  }
}

/**
 * Posts arbitrary payload (e.g. batch consolidation) to Google Apps Script Web App
 */
export async function postBatchToGoogleSheets(apiUrlInput: string, payload: unknown): Promise<boolean> {
  if (!apiUrlInput || !apiUrlInput.startsWith('http')) return false;
  const apiUrl = normalizeSheetUrl(apiUrlInput);

  // Tier 1: Server-side proxy
  try {
    const proxyRes = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUrl, payload }),
    });

    if (proxyRes.ok) {
      const contentType = proxyRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = await proxyRes.json();
        if (result && result.status === 'success') {
          return true;
        }
      }
    }
  } catch {
    // Fallback
  }

  // Tier 2: Direct CORS
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (response.ok || response.type === 'opaque') {
      return true;
    }
  } catch (err) {
    console.warn('Direct Google Sheets CORS POST batch error, trying no-cors fallback:', err);
  }

  // Tier 3: no-cors — mesma política do singular (não mente sucesso)
  try {
    await fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    telemetry.warn('sheetService', 'POST batch no-cors enviado — confirmação pendente via pull');
    return false;
  } catch (err) {
    console.warn('Google Sheets no-cors POST batch error:', err);
    return false;
  }
}

/**
 * Fetches logs from Google Apps Script Web App or Published Google Sheet CSV
 */
export async function fetchFromGoogleSheets(apiUrlInput: string): Promise<Log[]> {
  if (!apiUrlInput || !apiUrlInput.startsWith('http')) {
    throw new Error('URL da API do Google Sheets não foi configurada.');
  }

  const apiUrl = normalizeSheetUrl(apiUrlInput);
  let data: unknown = null;

  // Tier 1: Server-side proxy
  try {
    const proxyUrl = `/api/sheets/proxy?apiUrl=${encodeURIComponent(apiUrl)}`;
    const proxyRes = await fetch(proxyUrl, { method: 'GET' });
    if (proxyRes.ok) {
      const contentType = proxyRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await proxyRes.json();
      } else {
        const text = await proxyRes.text();
        if (text.includes(',') && (text.includes('\n') || text.includes('Carimbo') || text.includes('Setor') || text.includes('Colaborador'))) {
          data = parseCSVData(text);
        } else {
          try {
            data = JSON.parse(text);
          } catch {
            // Text is not JSON
          }
        }
      }
    }
  } catch {
    // Fallback
  }

  // Tier 2: Direct browser fetch
  if (!data) {
    try {
      const response = await fetch(apiUrl, { method: 'GET', redirect: 'follow' });

      if (response.ok) {
        const text = await response.text();
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          try {
            data = JSON.parse(text);
          } catch {
            // Not valid JSON
          }
        } else if (text.includes(',') && (text.includes('\n') || text.includes('Carimbo') || text.includes('Setor') || text.includes('Colaborador'))) {
          data = parseCSVData(text);
        }
      }
    } catch {
      // Fallback to JSONP
    }
  }

  // Tier 3: JSONP (só para Apps Script, validado em jsonpFetch)
  if (!data && !apiUrl.includes('output=csv')) {
    try {
      data = await jsonpFetch(apiUrl);
    } catch (err) {
      console.warn('JSONP fetch failed, trying public proxies:', err);
    }
  }

  // Tier 4: Public CORS proxies (último recurso)
  if (!data) {
    const corsProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
    ];

    for (const proxyUrl of corsProxies) {
      try {
        const res = await fetch(proxyUrl, { method: 'GET' });
        if (res.ok) {
          const text = await res.text();
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
              data = JSON.parse(text);
              if (data) break;
            } catch {
              // Invalid JSON
            }
          } else if (text.includes(',') && (text.includes('\n') || text.includes('Carimbo') || text.includes('Setor') || text.includes('Colaborador'))) {
            data = parseCSVData(text);
            if (data && Array.isArray(data) && data.length > 0) break;
          }
        }
      } catch {
        // Next proxy
      }
    }
  }

  if (!data) {
    throw new Error(
      'Não foi possível conectar à planilha Google. Verifique se o link está correto e se o Google Apps Script foi implantado com acesso "Qualquer pessoa" (Anyone).'
    );
  }

  let dataArray: unknown[] = [];

  if (Array.isArray(data)) {
    dataArray = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if ('dados' in obj && Array.isArray(obj.dados)) {
      dataArray = obj.dados as unknown[];
    } else if ('data' in obj && Array.isArray(obj.data)) {
      dataArray = obj.data as unknown[];
    } else {
      const sheetKeys = ['Controle de horas - Repro', 'Gestão', 'Formulário', 'RESUMO_REPRO'];
      for (const key of sheetKeys) {
        if (key in obj && Array.isArray(obj[key])) {
          dataArray = obj[key] as unknown[];
          break;
        }
      }
      if (dataArray.length === 0) {
        for (const k of Object.keys(obj)) {
          if (Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0) {
            dataArray = obj[k] as unknown[];
            break;
          }
        }
      }
    }
  }

  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    if (data && typeof data === 'object' && 'status' in data && (data as Record<string, unknown>).status === 'erro') {
      throw new Error(String((data as Record<string, unknown>).mensagem || (data as Record<string, unknown>).erro || 'Erro retornado pela planilha Google'));
    }
    if (!Array.isArray(dataArray)) return [];
  }

  // Mapeia objetos crus da planilha para Log tipado
  const parsePtFloat = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(String(v).replace(',', '.')) || 0;
  };

  const formatDateStr = (raw: unknown): string => {
    if (!raw) return new Date().toLocaleDateString('pt-PT');
    const str = String(raw).trim();
    if (str.includes('T')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    return str;
  };

  const logs: Log[] = dataArray.map((row: unknown) => {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const norm: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      norm[k.toLowerCase().trim()] = r[k];
    }

    let foundSector = String(
      r['Setor'] || r['SETOR'] || r['setor'] || r['Setores'] || r['SETORES'] || r['Sector'] || r['sector'] ||
      norm['setor'] || norm['setores'] || norm['sector'] || norm['linha'] || norm['área'] || norm['area'] || ''
    ).trim();

    const rawAtividade = String(r['atividade'] || norm['o que foi feito no repro'] || norm['atividade'] || norm['atividade realizada'] || 'Repro').trim();

    if (!foundSector) {
      const combinedText = `${rawAtividade} ${norm['observações'] || ''} ${norm['detalhes'] || ''} ${norm['comentários'] || ''}`.toLowerCase();
      if (combinedText.includes('88_89_90') || combinedText.includes('88-90') || combinedText.includes('88, 89') || combinedText.includes('88 e 89')) {
        foundSector = '88_89_90';
      } else if (combinedText.includes('88') || combinedText.includes('s88') || combinedText.includes('setor 88')) {
        foundSector = '88';
      } else if (combinedText.includes('89') || combinedText.includes('s89') || combinedText.includes('setor 89')) {
        foundSector = '89';
      } else if (combinedText.includes('90') || combinedText.includes('s90') || combinedText.includes('setor 90')) {
        foundSector = '90';
      } else {
        foundSector = '87';
      }
    }

    const rawSetor = normalizeSectorId(foundSector);
    const rawData = formatDateStr(r['data'] || norm['data'] || norm['data da atividade']);

    let rawSemana = 0;
    if (typeof r['Semana'] === 'number' && r['Semana'] > 0 && r['Semana'] <= 53) {
      rawSemana = r['Semana'];
    } else if (typeof r['semana'] === 'number' && r['semana'] > 0 && r['semana'] <= 53) {
      rawSemana = r['semana'];
    } else {
      const semFromNorm = parseInt(String(norm['semana'] || '0'), 10);
      if (semFromNorm > 0 && semFromNorm <= 53) {
        rawSemana = semFromNorm;
      } else if (rawData) {
        rawSemana = getWeekNumber(rawData);
      }
    }

    const calculatedDia = rawData ? getDayOfWeekName(rawData) : String(norm['dia'] || 'Segunda');

    const rawColaborador = String(r['colaborador'] || norm['colaborador'] || norm['nome do colaborador'] || '').toUpperCase().trim();
    const rawVolumes = parsePtFloat(r['enderecos'] || r['qtdEnderecos'] || norm['qtd endereços'] || norm['qtd enderecos'] || norm['volumes'] || norm['qtd'] || norm['quantidade de paletes / endereços feitos'] || norm['quantidade de paletes / enderecos feitos'] || 0);
    const rawHoras = parsePtFloat(r['horas'] || norm['horas usadas'] || norm['horas'] || norm['tempo'] || norm['tempo gasto (horas)'] || 0);

    const isIndireta = ['treinamentos', 'reuniões', 'reunioes', 'inventário', 'inventario', 'gestão de estoque', 'gestao de estoque', 'eid', 'missões de setor', 'missoes de setor'].some(term => rawAtividade.toLowerCase().includes(term));

    const rawEph = parsePtFloat(r['eph'] || norm['eph'] || norm['vph'] || 0);
    const vph = rawEph > 0 ? rawEph.toFixed(2) : (rawHoras > 0 ? (rawVolumes / rawHoras).toFixed(2) : '0.00');

    return {
      // newLogId() garante ID monotônico que não colide com IDs gerados localmente
      id: norm['id'] ? Number(norm['id']) : newLogId(),
      data: rawData || new Date().toLocaleDateString('pt-PT'),
      dia: calculatedDia,
      semana: rawSemana || 1,
      atividade: rawAtividade,
      colaborador: rawColaborador || 'DESCONHECIDO',
      volumes: rawVolumes,
      horas: rawHoras,
      vph: vph,
      timestamp: Date.now(),
      synced: true,
      tipo: isIndireta ? 'indireta' : 'direta',
      setor: rawSetor,
    };
  });

  return logs;
}

/**
 * Validates Google Sheets URL format (Web App ID or Published Sheet ID)
 */
export function validateGoogleSheetUrl(url: string): { isValid: boolean; message: string; idFound?: string } {
  if (!url || !url.trim()) {
    return { isValid: false, message: 'Nenhuma URL informada.' };
  }
  const cleanUrl = url.trim();

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return { isValid: false, message: 'URL deve começar com http:// ou https://' };
  }

  if (cleanUrl.includes('script.google.com') || cleanUrl.includes('/macros/s/')) {
    const scriptIdMatch = cleanUrl.match(/\/macros\/s\/([A-Za-z0-9_-]{20,})\/(exec|dev)/) || cleanUrl.match(/AKfycb[A-Za-z0-9_-]+/);
    if (!scriptIdMatch) {
      return { isValid: false, message: 'Falta o ID do deployment (/macros/s/AKfycb.../exec) na URL' };
    }
    return { isValid: true, message: 'Google Apps Script Web App ID Válido', idFound: scriptIdMatch[0] };
  }

  if (cleanUrl.includes('docs.google.com/spreadsheets')) {
    const pubIdMatch = cleanUrl.match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/) || cleanUrl.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
    if (!pubIdMatch) {
      return { isValid: false, message: 'ID da Planilha não encontrado na URL do Google Sheets' };
    }
    return { isValid: true, message: 'Planilha Google ID Válido', idFound: pubIdMatch[1] };
  }

  return { isValid: false, message: 'URL não reconhecida como Google Sheets ou Google Apps Script' };
}

/**
 * Fast ping and detailed connection diagnostic test
 */
export async function pingGoogleSheetsEndpoint(apiUrl: string): Promise<{ success: boolean; latencyMs: number; message: string; details?: any }> {
  const startTime = performance.now();
  const isDev = import.meta.env.DEV;

  if (isDev) {
    console.group('%c[Google Sheets Ping Diagnostic]', 'color: #38bdf8; font-weight: bold;');
    console.log('Target API URL:', apiUrl);
    console.log('Timestamp:', new Date().toISOString());
  }

  if (!apiUrl || !apiUrl.startsWith('http')) {
    const errMsg = 'URL de integração vazia ou sem protocolo HTTP/HTTPS.';
    if (isDev) {
      console.error('❌ Connectivity Ping Failed:', errMsg);
      console.groupEnd();
    }
    return { success: false, latencyMs: 0, message: errMsg };
  }

  const normalizedUrl = normalizeSheetUrl(apiUrl);
  if (isDev) console.log('Normalized URL:', normalizedUrl);

  try {
    const proxyUrl = `/api/sheets/proxy?apiUrl=${encodeURIComponent(normalizedUrl)}`;
    if (isDev) console.log('Attempting connection ping via proxy:', proxyUrl);

    const response = await fetch(proxyUrl, { method: 'GET' });
    const latencyMs = Math.round(performance.now() - startTime);

    if (isDev) {
      console.log(`HTTP Status: ${response.status} ${response.statusText}`);
      console.log(`Latency: ${latencyMs}ms`);
      console.log(`Content-Type: ${response.headers.get('content-type')}`);
    }

    if (response.ok) {
      const text = await response.text();
      if (isDev) {
        console.log('Response Snippet (first 300 chars):', text.substring(0, 300));
      }
      const successMsg = `Ping com sucesso em ${latencyMs}ms (HTTP ${response.status}).`;
      if (isDev) {
        console.log('✅ Connection Test Successful:', successMsg);
        console.groupEnd();
      }
      return { success: true, latencyMs, message: successMsg, details: text.substring(0, 500) };
    } else {
      const errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      if (isDev) {
        console.error('❌ Connection Ping HTTP Error:', errorMsg);
        console.groupEnd();
      }
      return { success: false, latencyMs, message: errorMsg };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    if (isDev) {
      console.error('❌ Ping Exception Caught:', err.message || 'Erro de rede ou CORS');
      console.groupEnd();
    }
    return {
      success: false,
      latencyMs,
      message: `Falha na conexão (${latencyMs}ms): ${err.message || 'Erro de rede'}`,
    };
  }
}

/**
 * Tests connection to Google Apps Script URL
 */
export async function testApiConnection(apiUrl: string): Promise<{ success: boolean; message: string }> {
  const ping = await pingGoogleSheetsEndpoint(apiUrl);
  if (!ping.success) {
    return { success: false, message: ping.message };
  }

  try {
    const logs = await fetchFromGoogleSheets(apiUrl);
    return {
      success: true,
      message: `Conexão estabelecida com sucesso (${ping.latencyMs}ms)! ${logs.length} registos encontrados na planilha Google.`,
    };
  } catch (err: any) {
    console.error('Test API connection error:', err);
    return {
      success: false,
      message: `Falha na conexão: ${err.message || 'Verifique a URL e as permissões de acesso do Google Apps Script.'}`,
    };
  }
}

/**
 * Saves a log directly with automatic retry to Google Sheets and/or Supabase
 */
export async function postLogWithRetry(
  apiUrl: string,
  log: Log,
  userUid?: string,
  maxAttempts = 3
): Promise<boolean> {
  let gsheetsSuccess = false;

  // Attempt 1: Google Sheets Web App com backoff exponencial + jitter
  if (apiUrl && apiUrl.startsWith('http')) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ok = await postToGoogleSheets(apiUrl, log);
      if (ok) {
        gsheetsSuccess = true;
        break;
      }
      if (attempt < maxAttempts - 1) {
        const baseDelay = 1000 * Math.pow(2, attempt); // 1000, 2000, 4000
        const jitter = Math.floor(Math.random() * 500); // 0-500ms
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }
  }

  // Attempt 2: Supabase direct save
  let supabaseSuccess = false;
  if (userUid) {
    try {
      await saveLogsDirectly([log], userUid);
      supabaseSuccess = true;
    } catch (err) {
      telemetry.warn('sheetService', 'Supabase postLog falhou', err);
    }
  }

  return gsheetsSuccess || supabaseSuccess;
}

/**
 * Synchronizes the offline queue to Google Sheets and Cloud.
 * Uses Concurrency Lock (JobGuard), CircuitBreaker, Indexed query & Batch Bulk Write (Anti-N+1)
 */
export async function syncOfflineQueue(
  apiUrl: string,
  onProgress?: (syncedCount: number) => void,
  userUid?: string
): Promise<{ successCount: number; failedCount: number }> {
  const result = await globalJobGuard.runExclusive('syncOfflineQueue', async () => {
    const unsyncedLogs = await getUnsyncedLogs();

    if (unsyncedLogs.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    if (sheetsCircuitBreaker.getState() === 'OPEN') {
      telemetry.warn('SyncQueue', 'Circuito de sincronização temporariamente ABERTO para proteger cotas e custos.');
      return { successCount: 0, failedCount: unsyncedLogs.length };
    }

    let successCount = 0;
    let failedCount = 0;
    const successfullySyncedLogs: Log[] = [];

    for (let i = unsyncedLogs.length - 1; i >= 0; i--) {
      if (sheetsCircuitBreaker.getState() === 'OPEN') {
        failedCount += i + 1;
        break;
      }

      const log = unsyncedLogs[i];
      const isSuccess = await postLogWithRetry(apiUrl, log, userUid);

      if (isSuccess) {
        // Cria novo objeto em vez de mutar (evita bug de referência compartilhada)
        const syncedLog: Log = { ...log, synced: true };
        successfullySyncedLogs.push(syncedLog);
        successCount++;
        if (onProgress) onProgress(successCount);
      } else {
        failedCount++;
      }
    }

    if (successfullySyncedLogs.length > 0) {
      await saveLogsBulk(successfullySyncedLogs);
      telemetry.info('SyncQueue', `${successfullySyncedLogs.length} registros salvos no banco local via Bulk Transaction.`);
    }

    return { successCount, failedCount };
  });

  return result || { successCount: 0, failedCount: 0 };
}

/**
 * Recovers logs from Google Sheets Web App or Supabase cloud
 */
export async function fetchFromCloud(apiUrl: string, userUid?: string): Promise<Log[]> {
  const errors: string[] = [];

  // Tentativa 1: Google Sheets (fonte primária).
  // Retorna mesmo se vazio — planilha vazia é resposta válida, não erro.
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      return await fetchFromGoogleSheets(apiUrl);
    } catch (err: any) {
      errors.push(`Sheets: ${err?.message || err}`);
      telemetry.warn('sheetService', 'Sheets fetch falhou', err);
    }
  }

  // Tentativa 2: Supabase (só se Sheets falhou de fato)
  if (userUid) {
    try {
      return (await fetchLogsDirectly(userUid)) ?? [];
    } catch (err: any) {
      errors.push(`Supabase: ${err?.message || err}`);
      telemetry.warn('sheetService', 'Supabase fetch falhou', err);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Falha ao obter dados da nuvem:\n${errors.join('\n')}`);
  }
  throw new Error('Nenhuma fonte de dados configurada (URL de Sheets ou usuário Supabase).');
}
