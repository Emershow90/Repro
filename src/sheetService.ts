/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';
import { saveLog, getLogs } from './dbLocal';
import { auth } from './lib/firebase';
import { saveLogsDirectly, fetchLogsDirectly } from './utils/supabase/client';

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

  // Try Server-side proxy first to bypass browser CORS constraints
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
    // Ignore server proxy errors and try direct browser fetch
  }

  // Fallback: Direct client browser fetch
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    return response.ok || response.type === 'opaque';
  } catch (err) {
    console.warn('Google Sheets direct POST error:', err);
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

  // Try Server-side proxy first to prevent browser CORS blocks on Google Apps Script redirects
  try {
    const proxyUrl = `/api/sheets/proxy?apiUrl=${encodeURIComponent(apiUrl)}`;
    const proxyRes = await fetch(proxyUrl, { method: 'GET' });
    if (proxyRes.ok) {
      data = await proxyRes.json();
    }
  } catch {
    // Fallback to direct fetch
  }

  // Fallback if proxy failed
  if (!data) {
    const response = await fetch(apiUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ao conectar à planilha: ${response.status} ${response.statusText}`);
    }

    data = await response.json();
  }

  if (!data) return [];

  const dataArray = Array.isArray(data) ? data : (typeof data === 'object' && data !== null && 'data' in data && Array.isArray((data as Record<string, unknown>).data)) ? (data as Record<string, unknown>).data as unknown[] : [];

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

  const logs: Log[] = dataArray.map((row: unknown, idx: number) => {
    const norm: Record<string, unknown> = {};
    if (row && typeof row === 'object') {
      for (const k of Object.keys(row as Record<string, unknown>)) {
        norm[k.toLowerCase().trim()] = (row as Record<string, unknown>)[k];
      }
    }

    const rawSetor = String(norm['setor'] || '87').trim();
    const rawData = String(norm['data'] || '').trim();
    const rawSemana = parseInt(String(norm['semana'] || '0'), 10);
    const rawAtividade = String(norm['o que foi feito no repro'] || norm['atividade'] || 'Repro').trim();
    const rawColaborador = String(norm['colaborador'] || '').toUpperCase().trim();
    const rawVolumes = parsePtFloat(norm['qtd endereços'] || norm['qtd enderecos'] || norm['volumes'] || norm['qtd'] || 0);
    const rawHoras = parsePtFloat(norm['horas usadas'] || norm['horas'] || norm['tempo'] || 0);

    const isIndireta = ['treinamentos', 'reuniões', 'reunioes', 'inventário', 'inventario', 'gestão de estoque', 'gestao de estoque', 'eid', 'missões de setor', 'missoes de setor'].some(term => rawAtividade.toLowerCase().includes(term));

    const vph = rawHoras > 0 ? (rawVolumes / rawHoras).toFixed(2) : '0.00';

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
