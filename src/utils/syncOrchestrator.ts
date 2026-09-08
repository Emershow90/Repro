/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Centralized Synchronization Orchestrator
 * Unifies API calls to Google Sheets and manages Supabase Webhook integration
 * Eliminates redundancy by coordinating all sync operations through a single entry point
 */

import { Log, OperationalEvent } from '../types';
import { postBatchToGoogleSheets, postToGoogleSheets, normalizeSheetUrl } from '../sheetService';
import { 
  getOperationalSyncQueue, 
  clearOperationalSyncQueue, 
  getState, 
  saveState 
} from '../dbLocal';
import { telemetry } from './telemetry';
import { 
  DailyReport, 
  WeeklyReport, 
  MonthlyReport,
  calculateDailyReport,
  calculateWeeklyReport,
  calculateMonthlyReport,
  generateConsolidatedBatchPayload,
  saveReportsLocally
} from './reportGenerator';

export interface SyncMetrics {
  successCount: number;
  failedCount: number;
  queuedCount: number;
  lastSyncTimestamp: string;
  nextSyncScheduled: string;
  syncDurationMs: number;
}

export interface SyncContext {
  apiUrl: string;
  date: string; // YYYY-MM-DD
  logs: Log[];
  streetSummaries: any[];
  demands?: Record<string, any>;
  events?: OperationalEvent[];
  onProgress?: (msg: string) => void;
}

const STORAGE_SYNC_METRICS = 'repro_sync_metrics_v2';
const STORAGE_LAST_BATCH_PAYLOAD = 'repro_last_batch_payload';
const AUTO_SYNC_INTERVAL_MS = 30000; // 30 seconds

let autoSyncTimer: NodeJS.Timeout | null = null;

/**
 * Single Entry Point: Orchestrates all synchronization operations
 * Centralizes Google Sheets API calls and manages queue processing
 */
export async function orchestrateSyncToSheets(
  context: SyncContext
): Promise<SyncMetrics> {
  const startTime = performance.now();
  const syncId = `sync_${Date.now()}`;
  
  telemetry.info('SyncOrchestrator', `[${syncId}] Iniciando sincronização centralizada`, {
    apiUrl: context.apiUrl,
    date: context.date,
    logsCount: context.logs.length
  });

  const metrics: SyncMetrics = {
    successCount: 0,
    failedCount: 0,
    queuedCount: 0,
    lastSyncTimestamp: new Date().toLocaleTimeString('pt-BR'),
    nextSyncScheduled: new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toLocaleTimeString('pt-BR'),
    syncDurationMs: 0
  };

  if (!context.apiUrl || !context.apiUrl.startsWith('http')) {
    telemetry.error('SyncOrchestrator', `[${syncId}] URL do Google Sheets não configurada`);
    metrics.failedCount = 1;
    return metrics;
  }

  try {
    // Step 1: Calculate unified reports from consolidated local data
    context.onProgress?.('📊 Calculando relatórios consolidados...');
    
    const dailyReport = await calculateDailyReport(
      context.date,
      context.logs,
      context.streetSummaries,
      context.demands
    );

    const weekNumber = parseInt(context.date.split('-')[1], 10);
    const yearNumber = parseInt(context.date.split('-')[0], 10);
    
    const weeklyReport = await calculateWeeklyReport(
      weekNumber,
      yearNumber,
      context.logs,
      [dailyReport] // In a full implementation, accumulate historical daily reports
    );

    const monthNumber = parseInt(context.date.split('-')[1], 10);
    const monthlyReport = await calculateMonthlyReport(
      monthNumber,
      yearNumber,
      context.logs,
      [weeklyReport] // In a full implementation, accumulate historical weekly reports
    );

    // Step 2: Get pending operational events queue
    context.onProgress?.('📋 Recuperando fila de eventos pendentes...');
    const queue = await getOperationalSyncQueue();
    metrics.queuedCount = queue.length;

    telemetry.info('SyncOrchestrator', `[${syncId}] Relatórios calculados`, {
      dailyDemanda: dailyReport.totalDemanda,
      dailyRealizado: dailyReport.totalRealizado,
      queuedCount: queue.length
    });

    // Step 3: Generate unified batch payload (eliminates redundancy)
    context.onProgress?.('🔄 Consolidando payload unificado...');
    const unifiedPayload = generateConsolidatedBatchPayload(
      dailyReport,
      weeklyReport,
      monthlyReport,
      queue
    );

    // Save payload for audit trail
    await saveState(STORAGE_LAST_BATCH_PAYLOAD, unifiedPayload);

    // Step 4: Send consolidated batch to Google Sheets
    context.onProgress?.('📤 Enviando dados consolidados para Google Sheets...');
    const batchSuccess = await postBatchToGoogleSheets(context.apiUrl, unifiedPayload);

    if (!batchSuccess) {
      throw new Error('Falha ao enviar lote consolidado para Google Sheets');
    }

    metrics.successCount++;

    // Step 5: Clear processed queue items
    context.onProgress?.('✅ Limpando fila de eventos processados...');
    const processedIds = queue.slice(0, 50).map((e: any) => e.id);
    await clearOperationalSyncQueue(processedIds);

    // Step 6: Save reports locally for offline access
    context.onProgress?.('💾 Salvando relatórios no cache local...');
    await saveReportsLocally(dailyReport, weeklyReport, monthlyReport);

    // Step 7: Update sync metrics
    metrics.syncDurationMs = Math.round(performance.now() - startTime);
    await saveState(STORAGE_SYNC_METRICS, metrics);

    telemetry.info('SyncOrchestrator', `[${syncId}] Sincronização concluída com sucesso`, {
      duration: metrics.syncDurationMs,
      success: 1,
      failed: 0
    });

    context.onProgress?.(`✨ Sincronização concluída em ${metrics.syncDurationMs}ms!`);

    return metrics;

  } catch (err: any) {
    metrics.failedCount++;
    metrics.syncDurationMs = Math.round(performance.now() - startTime);

    telemetry.error('SyncOrchestrator', `[${syncId}] Erro na sincronização`, {
      error: err.message,
      duration: metrics.syncDurationMs
    });

    context.onProgress?.(`❌ Erro na sincronização: ${err.message}`);
    throw err;
  }
}

/**
 * Initialize automatic background synchronization
 * Runs every 30 seconds or when user focuses the window
 */
export function initializeAutoSync(context: Omit<SyncContext, 'date'>): void {
  if (autoSyncTimer) clearInterval(autoSyncTimer);

  // Sync on window focus
  const handleWindowFocus = async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    try {
      await orchestrateSyncToSheets({
        ...context,
        date: dateStr
      });
    } catch (err) {
      console.warn('Auto-sync on focus failed:', err);
    }
  };

  window.addEventListener('focus', handleWindowFocus);

  // Periodic sync every 30 seconds
  autoSyncTimer = setInterval(async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    try {
      await orchestrateSyncToSheets({
        ...context,
        date: dateStr
      });
    } catch (err) {
      console.warn('Periodic auto-sync failed:', err);
    }
  }, AUTO_SYNC_INTERVAL_MS);

  telemetry.info('SyncOrchestrator', 'Auto-sync initialized', {
    intervalMs: AUTO_SYNC_INTERVAL_MS
  });
}

/**
 * Stop automatic synchronization
 */
export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    telemetry.info('SyncOrchestrator', 'Auto-sync stopped');
  }
}

/**
 * Retrieve last synchronization metrics
 */
export async function getLastSyncMetrics(): Promise<SyncMetrics | null> {
  try {
    return await getState<SyncMetrics>(STORAGE_SYNC_METRICS);
  } catch {
    return null;
  }
}

/**
 * Retrieve last unified payload sent (for audit/debugging)
 */
export async function getLastBatchPayload(): Promise<any | null> {
  try {
    return await getState<any>(STORAGE_LAST_BATCH_PAYLOAD);
  } catch {
    return null;
  }
}

/**
 * Supabase Webhook Handler - Process incoming webhook payloads
 * Called by Supabase when data is inserted into monitored tables
 * Ensures data envelope is properly unwrapped
 */
export async function handleSupabaseWebhookPayload(
  webhookPayload: any,
  apiUrl: string
): Promise<boolean> {
  try {
    telemetry.info('SyncOrchestrator', 'Webhook payload received from Supabase', {
      type: webhookPayload?.type,
      hasRecord: !!webhookPayload?.record
    });

    // Supabase wraps data in "record" envelope
    const data = webhookPayload?.record || webhookPayload || {};

    // Normalize and send to Google Sheets
    // The Google Apps Script doPost() will handle unwrapping
    const normalizedPayload = {
      tipo: 'WEBHOOK_SUPABASE_INSERT',
      timestamp: Date.now(),
      data: data
    };

    return await postBatchToGoogleSheets(apiUrl, normalizedPayload);

  } catch (err: any) {
    telemetry.error('SyncOrchestrator', 'Webhook processing failed', {
      error: err.message
    });
    return false;
  }
}

/**
 * Manual sync trigger with retry logic and circuit breaker
 */
export async function triggerManualSync(
  context: SyncContext,
  maxRetries: number = 3
): Promise<SyncMetrics> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      context.onProgress?.(`Tentativa ${attempt}/${maxRetries}...`);
      return await orchestrateSyncToSheets(context);
    } catch (err: any) {
      lastError = err;
      telemetry.warn('SyncOrchestrator', `Manual sync attempt ${attempt} failed`, {
        error: err.message
      });

      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
        context.onProgress?.(`Aguardando ${delayMs}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted
  const metrics: SyncMetrics = {
    successCount: 0,
    failedCount: maxRetries,
    queuedCount: 0,
    lastSyncTimestamp: new Date().toLocaleTimeString('pt-BR'),
    nextSyncScheduled: new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toLocaleTimeString('pt-BR'),
    syncDurationMs: 0
  };

  throw lastError || new Error('Falha ao sincronizar após múltiplas tentativas');
}

/**
 * Reset synchronization state (emergency recovery)
 */
export async function resetSyncState(): Promise<void> {
  try {
    stopAutoSync();
    await saveState(STORAGE_SYNC_METRICS, null);
    await saveState(STORAGE_LAST_BATCH_PAYLOAD, null);
    telemetry.warn('SyncOrchestrator', 'Sync state reset');
  } catch (err) {
    telemetry.error('SyncOrchestrator', 'Failed to reset sync state', err);
  }
}
