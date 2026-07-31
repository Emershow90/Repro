/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';
import { saveLog, getLogs } from './dbLocal';
import { auth } from './lib/firebase';
import { saveLogsDirectly, fetchLogsDirectly } from './utils/supabase/client';

/**
 * JSONP Fetch helper for bypassing CORS and Auth redirects on Google Apps Script
 */
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
 * Fetches logs from Google Apps Script Web App (Aba: Controle de horas - Repro)
 */
export async function fetchFromGoogleSheets(apiUrl: string): Promise<Log[]> {
  if (!apiUrl || !apiUrl.startsWith('http')) {
    throw new Error('URL da API do Google Sheets não foi configurada.');
  }

  let data: unknown = null;

  // Tier 1: Try Server-side proxy (/api/sheets/proxy)
  try {
    const proxyUrl = `/api/sheets/proxy?apiUrl=${encodeURIComponent(apiUrl)}`;
    const proxyRes = await fetch(proxyUrl, { method: 'GET' });
    if (proxyRes.ok) {
      data = await proxyRes.json();
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
        data = await response.json();
      }
    } catch {
      // Fallback to JSONP
    }
  }

  // Tier 3: JSONP Fallback to bypass Google Workspace Auth redirects/CORS
  if (!data) {
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
          try {
            data = JSON.parse(text);
            if (data) break;
          } catch {
            // Invalid JSON
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
    const rawData = formatDateStr(r['data'] || norm['data']);

    // Extract week number carefully (avoiding year override from lowercase 'semana')
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
        // Fallback: derive week from date
        const parts = rawData.split('/');
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          if (!isNaN(d.getTime())) {
            const target = new Date(d.valueOf());
            const dayNr = (d.getDay() + 6) % 7;
            target.setDate(target.getDate() - dayNr + 3);
            const firstThursday = target.valueOf();
            target.setMonth(0, 1);
            if (target.getDay() !== 4) {
              target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
            }
            rawSemana = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
          }
        }
      }
    }

    const rawAtividade = String(r['atividade'] || norm['o que foi feito no repro'] || norm['atividade'] || 'Repro').trim();
    const rawColaborador = String(r['colaborador'] || norm['colaborador'] || '').toUpperCase().trim();
    const rawVolumes = parsePtFloat(r['enderecos'] || r['qtdEnderecos'] || norm['qtd endereços'] || norm['qtd enderecos'] || norm['volumes'] || norm['qtd'] || 0);
    const rawHoras = parsePtFloat(r['horas'] || norm['horas usadas'] || norm['horas'] || norm['tempo'] || 0);

    const isIndireta = ['treinamentos', 'reuniões', 'reunioes', 'inventário', 'inventario', 'gestão de estoque', 'gestao de estoque', 'eid', 'missões de setor', 'missoes de setor'].some(term => rawAtividade.toLowerCase().includes(term));

    const rawEph = parsePtFloat(r['eph'] || norm['eph'] || norm['vph'] || 0);
    const vph = rawEph > 0 ? rawEph.toFixed(2) : (rawHoras > 0 ? (rawVolumes / rawHoras).toFixed(2) : '0.00');

    return {
      id: norm['id'] ? Number(norm['id']) : Date.now() + idx,
      data: rawData || new Date().toLocaleDateString('pt-PT'),
      dia: String(norm['dia'] || 'Segunda'),
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
 * Tests connection to Google Apps Script URL
 */
export async function testApiConnection(apiUrl: string): Promise<{ success: boolean; message: string }> {
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return { success: false, message: 'URL de integração vazia ou inválida.' };
  }

  try {
    const logs = await fetchFromGoogleSheets(apiUrl);
    return {
      success: true,
      message: `Conexão estabelecida com sucesso! ${logs.length} registos encontrados na aba 'Controle de horas - Repro'.`
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

  // Attempt 2: Supabase direct save if authenticated
  let supabaseSuccess = false;
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      await saveLogsDirectly([log], currentUser.uid);
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
  onProgress?: (syncedCount: number) => void
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
    const isSuccess = await postLogWithRetry(apiUrl, log);

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
export async function fetchFromCloud(apiUrl: string): Promise<Log[]> {
  // Try Google Sheets first if URL provided
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      const sheetLogs = await fetchFromGoogleSheets(apiUrl);
      if (sheetLogs.length > 0) return sheetLogs;
    } catch (err) {
      console.warn('Google Sheets fetch failed, checking Supabase fallback:', err);
    }
  }

  // Try Supabase fallback if authenticated
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const cloudLogs = await fetchLogsDirectly(currentUser.uid);
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
