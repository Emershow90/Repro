/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';
import { saveLog, getLogs } from './dbLocal';
import { auth } from './lib/firebase';
import { saveLogsDirectly, fetchLogsDirectly } from './utils/supabase/client';

/**
 * Saves a log directly to Supabase with automatic retry
 */
export async function postLogWithRetry(
  apiUrl: string,
  log: Log,
  maxAttempts = 5
): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn("No authenticated user found for Supabase post log operation.");
    return false;
  }

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      await saveLogsDirectly([log], currentUser.uid);
      return true;
    } catch (err) {
      console.warn(`Sync attempt ${attempt + 1} failed to Supabase for log ID ${log.id}:`, err);
    }
    
    attempt++;
    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 400, 12000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

/**
 * Synchronizes the offline queue (unsynced logs) to the Supabase logs table
 */
export async function syncOfflineQueue(
  apiUrl: string,
  onProgress?: (syncedCount: number) => void
): Promise<{ successCount: number; failedCount: number }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn("User must be authenticated to sync offline queue to Supabase.");
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
      break;
    }
  }

  return { successCount, failedCount };
}

/**
 * Recovers logs from the Supabase logs table for the authenticated user
 */
export async function fetchFromCloud(apiUrl: string): Promise<Log[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User must be authenticated to fetch logs from Supabase cloud.");
  }

  try {
    const cloudLogs = await fetchLogsDirectly(currentUser.uid);
    return cloudLogs;
  } catch (err: any) {
    console.error("Failed to fetch logs from Supabase:", err);
    throw new Error(`Failed to contact Supabase API: ${err.message || err}`);
  }
}
