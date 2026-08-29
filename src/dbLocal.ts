/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * IndexedDB Database Layer - Performance Optimized with Indices & Bulk Operations (Anti-N+1)
 */

import { Log, AppTimerState } from './types';
import { telemetry } from './utils/telemetry';

const DB_NAME = "TerminalReproV5";
const DB_VERSION = 2; // Incremented to add indexes & optimize queries

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

export function initDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      let logsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains('logs')) {
        logsStore = db.createObjectStore('logs', { keyPath: 'id' });
      } else {
        logsStore = (event.target as IDBOpenDBRequest).transaction!.objectStore('logs');
      }

      // Ensure all single and compound indexes exist
      if (!logsStore.indexNames.contains('synced')) {
        logsStore.createIndex('synced', 'synced', { unique: false });
      }
      if (!logsStore.indexNames.contains('timestamp')) {
        logsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!logsStore.indexNames.contains('data')) {
        logsStore.createIndex('data', 'data', { unique: false });
      }
      if (!logsStore.indexNames.contains('setor')) {
        logsStore.createIndex('setor', 'setor', { unique: false });
      }
      if (!logsStore.indexNames.contains('colaborador')) {
        logsStore.createIndex('colaborador', 'colaborador', { unique: false });
      }
      if (!logsStore.indexNames.contains('setor_data')) {
        logsStore.createIndex('setor_data', ['setor', 'data'], { unique: false });
      }

      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      telemetry.info('IndexedDB', `Banco ${DB_NAME} v${DB_VERSION} inicializado com índices.`);
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      telemetry.error('IndexedDB', 'Erro ao abrir banco de dados local', err);
      reject(err);
    };
  });

  return initPromise;
}

export function getLocalDbInstance(): IDBDatabase | null {
  return dbInstance;
}

/**
 * Retorna todos os logs ordenados por timestamp descrescente
 */
export async function getLogs(): Promise<Log[]> {
  const db = dbInstance || await initDb();
  return telemetry.time('IndexedDB', 'getLogs', () => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');
      
      // Use index on timestamp when available for pre-sorted retrieval
      if (store.indexNames.contains('timestamp')) {
        const index = store.index('timestamp');
        const req = index.openCursor(null, 'prev');
        const results: Log[] = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      } else {
        const request = store.getAll();
        request.onsuccess = () => {
          const result = request.result as Log[];
          resolve(result.sort((a, b) => b.timestamp - a.timestamp));
        };
        request.onerror = () => reject(request.error);
      }
    });
  });
}

/**
 * Busca apenas registros NÃO sincronizados de forma segura e rápida
 */
export async function getUnsyncedLogs(): Promise<Log[]> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');
      const request = store.getAll();
      request.onsuccess = () => {
        const result = (request.result as Log[]) || [];
        resolve(result.filter(l => !l.synced));
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Busca logs filtrados por data utilizando índice seguro ou fallback
 */
export async function getLogsByDate(data: string): Promise<Log[]> {
  if (!data || typeof data !== 'string') return [];
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');
      if (store.indexNames.contains('data')) {
        try {
          const index = store.index('data');
          const request = index.getAll(IDBKeyRange.only(data));
          request.onsuccess = () => resolve((request.result as Log[]) || []);
          request.onerror = () => {
            store.getAll().onsuccess = (e: any) => {
              const all = (e.target.result as Log[]) || [];
              resolve(all.filter(l => l.data === data));
            };
          };
          return;
        } catch {
          // Fallback if index fails
        }
      }
      store.getAll().onsuccess = (e: any) => {
        const all = (e.target.result as Log[]) || [];
        resolve(all.filter(l => l.data === data));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Salva um log individualmente
 */
export async function saveLog(log: Log): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('logs', 'readwrite');
    const store = transaction.objectStore('logs');
    store.put(log);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Batch/Bulk Save (Anti-N+1): Salva múltiplos logs em UMA ÚNICA transação atômica
 */
export async function saveLogsBulk(logs: Log[]): Promise<boolean> {
  if (logs.length === 0) return true;
  const db = dbInstance || await initDb();
  return telemetry.time('IndexedDB', `saveLogsBulk (${logs.length} itens)`, () => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('logs', 'readwrite');
      const store = transaction.objectStore('logs');
      
      for (let i = 0; i < logs.length; i++) {
        store.put(logs[i]);
      }

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export async function deleteLog(id: number): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('logs', 'readwrite');
    const store = transaction.objectStore('logs');
    store.delete(id);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveState<T = any>(key: string, data: T): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    store.put({ key, data });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getState<T = any>(key: string): Promise<T | null> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
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
  });
}

export async function clearLogsAndState(): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs', 'state'], 'readwrite');
    const logsStore = transaction.objectStore('logs');
    const stateStore = transaction.objectStore('state');

    logsStore.clear();
    stateStore.clear();

    transaction.oncomplete = () => {
      telemetry.warn('IndexedDB', 'Banco de dados local limpo com sucesso.');
      resolve(true);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

// Fila de Eventos Operacionais para Sincronização em Segundo Plano (Zero bloqueio no PDT)
export async function enqueueOperationalEvent(event: any): Promise<void> {
  try {
    const queue = (await getState<any[]>('operational_sync_queue')) || [];
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
