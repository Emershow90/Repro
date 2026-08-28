import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogs, saveLog } from '../dbLocal';
import { Log } from '../types';
import { fetchFromCloud, postLogWithRetry, syncOfflineQueue } from '../sheetService';
import { useHistoryStore } from '../stores/historyStore';

type Toast = (message: string, color?: string) => void;

/** Centralizes cloud communication, offline queue state and cancellation on unmount. */
export function useSyncEngine(apiUrl: string, userUid?: string, addToast?: Toast) {
  const { logs, isSyncing, isImporting, networkStatus, setLogs, setNetworkStatus, setLastSyncTime, setIsSyncing, setIsImporting } = useHistoryStore();
  const controllerRef = useRef<AbortController | null>(null);
  const [queueSize, setQueueSize] = useState(0);

  const refresh = useCallback(async () => {
    const current = await getLogs();
    setLogs(current);
    setQueueSize(current.filter(log => !log.synced).length);
    return current;
  }, [setLogs]);

  const sync = useCallback(async (notify = false) => {
    if (isSyncing || !apiUrl) return;
    if (!navigator.onLine) {
      setNetworkStatus('offline');
      if (notify) addToast?.('Sem conexão. A fila permanece guardada localmente.', 'var(--color-warning)');
      return;
    }
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setNetworkStatus('online');
    setIsSyncing(true);
    try {
      const result = await syncOfflineQueue(apiUrl, undefined, userUid, controllerRef.current.signal);
      await refresh();
      if (result.successCount) {
        setLastSyncTime(new Date().toLocaleTimeString('pt-PT'));
        addToast?.(`${result.successCount} registo(s) sincronizado(s).`, 'var(--color-success)');
      } else if (notify && result.failedCount === 0) addToast?.('Fila de sincronização vazia.', 'var(--color-success)');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [addToast, apiUrl, isSyncing, refresh, setIsSyncing, setLastSyncTime, setNetworkStatus, userUid]);

  const importFromCloud = useCallback(async () => {
    if (isImporting || !apiUrl) return;
    setIsImporting(true);
    try {
      const cloudLogs = await fetchFromCloud(apiUrl, userUid);
      const localIds = new Set((await getLogs()).map(log => String(log.id)));
      await Promise.all(cloudLogs.filter(log => !localIds.has(String(log.id))).map(saveLog));
      await refresh();
    } finally {
      setIsImporting(false);
    }
  }, [apiUrl, isImporting, refresh, setIsImporting, userUid]);

  const save = useCallback(async (log: Log) => {
    await saveLog(log);
    setLogs(previous => [log, ...previous]);
    setQueueSize(size => size + 1);
    if (apiUrl && navigator.onLine) void sync(false);
  }, [apiUrl, setLogs, sync]);

  useEffect(() => {
    const online = () => { setNetworkStatus('online'); void sync(false); };
    const offline = () => setNetworkStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    setNetworkStatus(navigator.onLine ? 'online' : 'offline');
    void refresh();
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); controllerRef.current?.abort(); };
  }, [refresh, setNetworkStatus, sync]);

  return { logs, sync, import: importFromCloud, save, isSyncing, isImporting, queueSize, networkStatus, refresh };
}
