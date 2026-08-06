/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';
import { saveLog, getLogs } from './dbLocal';
import { saveLogsDirectly, fetchLogsDirectly } from './utils/supabase/client';
import { getWeekNumber, parseDateString, getDayOfWeekName } from './utils/dateUtils';

/**
 * Normalizes any Google Sheets URL (e.g. published web page pubhtml, Apps Script URL, or published CSV)
 */
export function normalizeSheetUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();
  
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
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonpCallback_' + Math.round(1000000 * Math.random());
    let cleanupDone = false;
    
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout: Planilha demorou muito para responder'));
    }, timeoutMs);

    (window as any)[callbackName] = function(data: any) {
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
export async function postToGoogleSheets(apiUrl: string, log: Log): Promise<boolean> {
  if (!apiUrl || !apiUrl.startsWith('http')) return false;

  const payload = {
    setor: log.setor || '87',
    data: log.data,
    semana: log.semana,
    semanaAno: new Date().getFullYear(),
    atividade: log.atividade,
    colaborador: log.colaborador,
    qtdEnderecos: log.volumes,
    horas: log.horas,
    vph: log.vph,
    tipo: log.tipo || 'direta'
  };

  // Tier 1: Try Server-side proxy first if backend API is available
  try {
    const proxyRes = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUrl, payload })
    });

    if (proxyRes.ok) {
      const result = await proxyRes.json();
      if (result.status === 'success') return true;
    }
  } catch {
    // Ignore server proxy errors and try direct client fetch
  }

  // Tier 2: Direct browser fetch with standard CORS
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
    console.warn('Direct Google Sheets POST error, trying JSONP fallback:', err);
  }

  // Tier 3: JSONP Fallback via GET (Action: insert) to bypass Google Workspace CORS / Auth redirects
  try {
    const insertUrl = apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'action=insert&payload=' + encodeURIComponent(JSON.stringify(payload));
    const result = await jsonpFetch(insertUrl);
    if (result && result.status === 'sucesso') {
      return true;
    }
  } catch (err) {
    console.warn('Google Sheets JSONP Insert error:', err);
  }

  // Tier 4: Direct browser fetch with mode: 'no-cors'
  try {
    await fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return true; // Assume success for opaque response if JSONP failed
  } catch (err) {
    console.warn('Google Sheets no-cors POST error:', err);
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

  // Tier 1: Try Server-side proxy (/api/sheets/proxy)
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
    // Fallback to direct client fetch
  }

  // Tier 2: Direct browser fetch
  if (!data) {
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        redirect: 'follow'
      });

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

  // Tier 3: JSONP Fallback to bypass Google Workspace Auth redirects/CORS (For Web Apps)
  if (!data && !apiUrl.includes('output=csv')) {
    try {
      data = await jsonpFetch(apiUrl);
    } catch (err) {
      console.warn('JSONP fetch failed, trying public proxies:', err);
    }
  }

  // Tier 4: Public CORS proxy fallback for static hosts (e.g., Vercel, GH Pages)
  if (!data) {
    const corsProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`
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

  const dataArray = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && 'dados' in data && Array.isArray((data as Record<string, unknown>).dados))
    ? (data as Record<string, unknown>).dados as unknown[]
    : (data && typeof data === 'object' && 'data' in data && Array.isArray((data as Record<string, unknown>).data))
    ? (data as Record<string, unknown>).data as unknown[]
    : [];

  if (!Array.isArray(dataArray)) {
    if (data && typeof data === 'object' && 'status' in data && (data as Record<string, unknown>).status === 'erro') {
      throw new Error(String((data as Record<string, unknown>).mensagem || 'Erro retornado pela planilha Google'));
    }
    return [];
  }

  // Map raw sheet objects to typed Log objects
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

  const logs: Log[] = dataArray.map((row: unknown, idx: number) => {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const norm: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      norm[k.toLowerCase().trim()] = r[k];
    }

    const rawSetor = String(r['Setor'] || r['setor'] || norm['setor'] || '87').trim();
    const rawData = formatDateStr(r['data'] || norm['data'] || norm['data da atividade']);

    // Extract week number carefully using dateUtils helper
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

    const rawAtividade = String(r['atividade'] || norm['o que foi feito no repro'] || norm['atividade'] || norm['atividade realizada'] || 'Repro').trim();
    const rawColaborador = String(r['colaborador'] || norm['colaborador'] || norm['nome do colaborador'] || '').toUpperCase().trim();
    const rawVolumes = parsePtFloat(r['enderecos'] || r['qtdEnderecos'] || norm['qtd endereços'] || norm['qtd enderecos'] || norm['volumes'] || norm['qtd'] || norm['quantidade de paletes / endereços feitos'] || norm['quantidade de paletes / enderecos feitos'] || 0);
    const rawHoras = parsePtFloat(r['horas'] || norm['horas usadas'] || norm['horas'] || norm['tempo'] || norm['tempo gasto (horas)'] || 0);

    const isIndireta = ['treinamentos', 'reuniões', 'reunioes', 'inventário', 'inventario', 'gestão de estoque', 'gestao de estoque', 'eid', 'missões de setor', 'missoes de setor'].some(term => rawAtividade.toLowerCase().includes(term));

    const rawEph = parsePtFloat(r['eph'] || norm['eph'] || norm['vph'] || 0);
    const vph = rawEph > 0 ? rawEph.toFixed(2) : (rawHoras > 0 ? (rawVolumes / rawHoras).toFixed(2) : '0.00');

    return {
      id: norm['id'] ? Number(norm['id']) : Date.now() + idx,
      data: rawData || new Date().toLocaleDateString('pt-PT'),
      dia: calculatedDia,
      semana: rawSemana || 1,
      atividade: rawAtividade,
      colaborador: rawColaborador || 'DESCONHECIDO',
      volumes: rawVolumes,
      horas: rawHoras,
      vph: vph,
      timestamp: Date.now() - (idx * 1000),
      synced: true,
      tipo: isIndireta ? 'indireta' : 'direta',
      setor: rawSetor
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

  // Check Google Apps Script Web App URL (/macros/s/{scriptId}/exec)
  if (cleanUrl.includes('script.google.com') || cleanUrl.includes('/macros/s/')) {
    const scriptIdMatch = cleanUrl.match(/\/macros\/s\/([A-Za-z0-9_-]{20,})\/(exec|dev)/) || cleanUrl.match(/AKfycb[A-Za-z0-9_-]+/);
    if (!scriptIdMatch) {
      return { isValid: false, message: 'Falta o ID do deployment (/macros/s/AKfycb.../exec) na URL' };
    }
    return { isValid: true, message: 'Google Apps Script Web App ID Válido', idFound: scriptIdMatch[0] };
  }

  // Check Published Google Sheet URL (/spreadsheets/d/{sheetId} or /spreadsheets/d/e/{pubId})
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
 * Fast ping and detailed connection diagnostic test for Google Apps Script / Google Sheets
 */
export async function pingGoogleSheetsEndpoint(apiUrl: string): Promise<{ success: boolean; latencyMs: number; message: string; details?: any }> {
  const startTime = performance.now();
  console.group('%c[Google Sheets Ping Diagnostic]', 'color: #38bdf8; font-weight: bold;');
  console.log('Target API URL:', apiUrl);
  console.log('Timestamp:', new Date().toISOString());

  if (!apiUrl || !apiUrl.startsWith('http')) {
    const errMsg = 'URL de integração vazia ou sem protocolo HTTP/HTTPS.';
    console.error('❌ Connectivity Ping Failed:', errMsg);
    console.groupEnd();
    return { success: false, latencyMs: 0, message: errMsg };
  }

  const normalizedUrl = normalizeSheetUrl(apiUrl);
  console.log('Normalized URL:', normalizedUrl);

  try {
    const proxyUrl = `/api/sheets/proxy?apiUrl=${encodeURIComponent(normalizedUrl)}`;
    console.log('Attempting connection ping via proxy:', proxyUrl);

    const response = await fetch(proxyUrl, { method: 'GET' });
    const latencyMs = Math.round(performance.now() - startTime);

    console.log(`HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`Latency: ${latencyMs}ms`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);

    if (response.ok) {
      const text = await response.text();
      console.log('Response Snippet (first 300 chars):', text.substring(0, 300));
      const successMsg = `Ping com sucesso em ${latencyMs}ms (HTTP ${response.status}).`;
      console.log('✅ Connection Test Successful:', successMsg);
      console.groupEnd();
      return { success: true, latencyMs, message: successMsg, details: text.substring(0, 500) };
    } else {
      const errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      console.error('❌ Connection Ping HTTP Error:', errorMsg);
      console.groupEnd();
      return { success: false, latencyMs, message: errorMsg };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorDetails = {
      message: err.message || 'Erro de rede ou CORS',
      stack: err.stack,
      apiUrl,
      latencyMs
    };
    console.error('❌ Ping Exception Caught:', errorDetails.message);
    console.dir(errorDetails);
    console.groupEnd();

    return { 
      success: false, 
      latencyMs, 
      message: `Falha na conexão (${latencyMs}ms): ${err.message || 'Erro de rede'}` 
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
      message: `Conexão estabelecida com sucesso (${ping.latencyMs}ms)! ${logs.length} registos encontrados na planilha Google.`
    };
  } catch (err: any) {
    console.error('Test API connection error:', err);
    return {
      success: false,
      message: `Falha na conexão: ${err.message || 'Verifique a URL e as permissões de acesso do Google Apps Script.'}`
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

  // Attempt 1: Google Sheets Web App
  if (apiUrl && apiUrl.startsWith('http')) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      const ok = await postToGoogleSheets(apiUrl, log);
      if (ok) {
        gsheetsSuccess = true;
        break;
      }
      attempt++;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  // Attempt 2: Supabase direct save if userUid is provided
  let supabaseSuccess = false;
  if (userUid) {
    try {
      await saveLogsDirectly([log], userUid);
      supabaseSuccess = true;
    } catch (err) {
      console.warn('Supabase postLog retry warning:', err);
    }
  }

  return gsheetsSuccess || supabaseSuccess;
}

/**
 * Synchronizes the offline queue (unsynced logs) to Google Sheets and Cloud
 */
export async function syncOfflineQueue(
  apiUrl: string,
  onProgress?: (syncedCount: number) => void,
  userUid?: string
): Promise<{ successCount: number; failedCount: number }> {
  const allLogs = await getLogs();
  const unsyncedLogs = allLogs.filter(l => !l.synced);

  if (unsyncedLogs.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (let i = unsyncedLogs.length - 1; i >= 0; i--) {
    const log = unsyncedLogs[i];
    const isSuccess = await postLogWithRetry(apiUrl, log, userUid);

    if (isSuccess) {
      log.synced = true;
      await saveLog(log);
      successCount++;
      if (onProgress) {
        onProgress(successCount);
      }
    } else {
      failedCount++;
    }
  }

  return { successCount, failedCount };
}

/**
 * Recovers logs from Google Sheets Web App or Supabase cloud
 */
export async function fetchFromCloud(apiUrl: string, userUid?: string): Promise<Log[]> {
  // Try Google Sheets first if URL provided
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      const sheetLogs = await fetchFromGoogleSheets(apiUrl);
      if (sheetLogs.length > 0) return sheetLogs;
    } catch (err) {
      console.warn('Google Sheets fetch failed, checking Supabase fallback:', err);
    }
  }

  // Try Supabase fallback if userUid provided
  if (userUid) {
    try {
      const cloudLogs = await fetchLogsDirectly(userUid);
      return cloudLogs;
    } catch (err: any) {
      console.error('Failed to fetch logs from Supabase:', err);
    }
  }

  if (apiUrl && apiUrl.startsWith('http')) {
    // If Google Sheets fetch was attempted and thrown
    return await fetchFromGoogleSheets(apiUrl);
  }

  throw new Error('Não foi possível obter dados da nuvem ou do Google Sheets. Verifique a URL do Google Apps Script.');
}
