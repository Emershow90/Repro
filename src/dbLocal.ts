/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log, AppTimerState } from './types';

const DB_NAME = "TerminalReproV5";
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('logs')) {
        const store = db.createObjectStore('logs', { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export function getLocalDbInstance(): IDBDatabase | null {
  return dbInstance;
}

export function getLogs(): Promise<Log[]> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      reject(new Error("Database not initialized"));
      return;
    }
    const transaction = dbInstance.transaction('logs', 'readonly');
    const store = transaction.objectStore('logs');
    const request = store.getAll();

    request.onsuccess = () => {
      const result = request.result as Log[];
      // Sort descending by timestamp
      resolve(result.sort((a, b) => b.timestamp - a.timestamp));
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export function saveLog(log: Log): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      reject(new Error("Database not initialized"));
      return;
    }
    const transaction = dbInstance.transaction('logs', 'readwrite');
    const store = transaction.objectStore('logs');
    store.put(log);

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export function deleteLog(id: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      reject(new Error("Database not initialized"));
      return;
    }
    const transaction = dbInstance.transaction('logs', 'readwrite');
    const store = transaction.objectStore('logs');
    store.delete(id);

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export function saveState<T = any>(key: string, data: T): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      // Se ainda não inicializou, tenta inicializar ou salva em memória segura
      initDb().then((db) => {
        const transaction = db.transaction('state', 'readwrite');
        const store = transaction.objectStore('state');
        store.put({ key, data });
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      }).catch(err => reject(err));
      return;
    }
    const transaction = dbInstance.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    store.put({ key, data });

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export function getState<T = any>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      initDb().then((db) => {
        const transaction = db.transaction('state', 'readonly');
        const store = transaction.objectStore('state');
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.data as T);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      }).catch(() => resolve(null));
      return;
    }
    const transaction = dbInstance.transaction('state', 'readonly');
    const store = transaction.objectStore('state');
    const request = store.get(key);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.data as T);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export function clearLogsAndState(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      reject(new Error("Database not initialized"));
      return;
    }
    const transaction = dbInstance.transaction(['logs', 'state'], 'readwrite');
    const logsStore = transaction.objectStore('logs');
    const stateStore = transaction.objectStore('state');

    logsStore.clear();
    stateStore.clear();

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

// Fila de Eventos Operacionais para Sincronização em Segundo Plano (Zero bloqueio no PDT)
export async function enqueueOperationalEvent(event: any): Promise<void> {
  try {
    const queue = (await getState<any[]>('operational_sync_queue')) || [];
    // Evita duplicatas na fila
    if (!queue.some(item => item.id === event.id)) {
      queue.push(event);
      await saveState('operational_sync_queue', queue);
    }
  } catch (err) {
    console.warn('Falha ao enfileirar evento operacional offline:', err);
  }
}

export async function getOperationalSyncQueue(): Promise<any[]> {
  try {
    return (await getState<any[]>('operational_sync_queue')) || [];
  } catch {
    return [];
  }
}

export async function clearOperationalSyncQueue(processedIds: string[]): Promise<void> {
  try {
    const queue = (await getState<any[]>('operational_sync_queue')) || [];
    const remaining = queue.filter(item => !processedIds.includes(item.id));
    await saveState('operational_sync_queue', remaining);
  } catch (err) {
    console.warn('Erro ao limpar fila de eventos sincronizados:', err);
  }
}

