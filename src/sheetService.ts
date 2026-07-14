/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';
import { saveLog, getLogs } from './dbLocal';
import { EventBus } from './eventBus';

// Post with exponential backoff retry mechanism to ensure data consistency
export async function postLogWithRetry(
  url: string,
  log: Log,
  maxAttempts = 5
): Promise<boolean> {
  let attempt = 0;
  
  // Format the payload with purified keys and legac keys for compatibility
  const payload = {
    id: log.id,
    data: log.data,
    dia: log.dia,
    semana: log.dia, // Mapped for backward compatibility but script uses semana
    semanaAno: log.semana,
    atividade: log.atividade,
    colaborador: log.colaborador,
    setor: log.setor,
    volume: log.volumes,
    enderecos: log.volumes, // fallback
    qtdEnderecos: log.volumes,
    horas: log.horas,
    vph: log.vph,
    eph: log.vph, // fallback
    timestamp: log.timestamp
  };

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        return true;
      }
    } catch (err) {
      console.warn(`Sync attempt ${attempt + 1} failed for log ID ${log.id}:`, err);
    }
    
    attempt++;
    if (attempt < maxAttempts) {
      // Exponential backoff with a bit of random jitter
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 400, 12000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

export async function syncOfflineQueue(
  apiUrl: string,
  onProgress?: (syncedCount: number) => void
): Promise<{ successCount: number; failedCount: number }> {
  if (!apiUrl) {
    return { successCount: 0, failedCount: 0 };
  }

  const allLogs = await getLogs();
  const unsyncedLogs = allLogs.filter(l => !l.synced);
  
  if (unsyncedLogs.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  // Sync starting from the oldest logs
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
      // Stop synchronization of the queue if we have a hard network failure
      break;
    }
  }

  return { successCount, failedCount };
}

export async function fetchFromCloud(apiUrl: string): Promise<Log[]> {
  const response = await fetch(apiUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error("Failed to contact Google Sheets API");
  }
  const cloudData = await response.json();
  if (!Array.isArray(cloudData)) {
    throw new Error("Invalid response format from cloud sheets");
  }

  const parsedLogs: Log[] = [];
  
  for (const item of cloudData) {
    const idNum = Number(item.id || Date.now());
    
    // Parse activity type
    const isIndirect = String(item.atividade || '').startsWith('IND:') || item.tipo === 'indireta';
    
    // Tolerant volume keys parsing
    let parsedVolume = 0;
    if (item.volume !== undefined) {
      parsedVolume = Number(item.volume);
    } else if (item.volume === undefined && item.volume_processado !== undefined) {
      parsedVolume = Number(item.volume_processado);
    } else if (item.enderecos !== undefined) {
      parsedVolume = Number(item.enderecos);
    } else if (item.ends !== undefined) {
      parsedVolume = Number(item.ends);
    }

    // Tolerant vph parsing
    let parsedVph = "0.00";
    if (item.vph !== undefined) {
      parsedVph = String(item.vph);
    } else if (item.eph !== undefined) {
      parsedVph = String(item.eph);
    }

    parsedLogs.push({
      id: idNum,
      data: String(item.data || ''),
      dia: String(item.dia || ''),
      semana: Number(item.semana || 1),
      atividade: String(item.atividade || ''),
      colaborador: String(item.colaborador || ''),
      volumes: parsedVolume,
      horas: Number(item.horas || 0),
      vph: parsedVph,
      timestamp: idNum,
      synced: true,
      tipo: isIndirect ? 'indireta' : 'direta'
    });
  }

  return parsedLogs;
}
