/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * IndexedDB Database Layer — Performance Optimized with Indices & Bulk Operations
 *
 * Notas de design:
 *  - DB_VERSION = 2 (não bumpado): a fila operacional usa `state` com transação
 *    única (mitigação do lost update) em vez de store próprio. Migração para
 *    `events_queue` fica para v3.
 *  - `Log.tipo` é opcional em `types.ts` (retrocompatibilidade com logs v2 no
 *    IndexedDB). Toda leitura passa por `normalizeLogTipo`; toda escrita também.
 */

import { Log, AppTimerState, OperationalEvent, normalizeLogTipo } from './types';
import { telemetry } from './utils/telemetry';

const DB_NAME = 'TerminalReproV5';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

// -------------------------------------------------------------
// INICIALIZAÇÃO
// -------------------------------------------------------------

export function initDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        try {
          let logsStore: IDBObjectStore;
          if (!db.objectStoreNames.contains('logs')) {
            logsStore = db.createObjectStore('logs', { keyPath: 'id' });
          } else {
            logsStore = (event.target as IDBOpenDBRequest).transaction!.objectStore('logs');
          }

          const ensureIndex = (
            store: IDBObjectStore,
            name: string,
            keyPath: string | string[],
          ) => {
            if (!store.indexNames.contains(name)) {
              store.createIndex(name, keyPath, { unique: false });
            }
          };

          ensureIndex(logsStore, 'synced', 'synced');
          ensureIndex(logsStore, 'timestamp', 'timestamp');
          ensureIndex(logsStore, 'data', 'data');
          ensureIndex(logsStore, 'setor', 'setor');
          ensureIndex(logsStore, 'colaborador', 'colaborador');
          ensureIndex(logsStore, 'setor_data', ['setor', 'data']);

          if (!db.objectStoreNames.contains('state')) {
            db.createObjectStore('state', { keyPath: 'key' });
          }
        } catch (err) {
          // Sem re-throw, a transação fica em estado inválido e o onsuccess
          // nunca dispara — o app fica pendurado. Rethrow força rollback.
          telemetry.error('IndexedDB', 'Falha na migração de schema', err);
          throw err;
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        telemetry.info('IndexedDB', `Banco ${DB_NAME} v${DB_VERSION} inicializado.`);
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        const err = (event.target as IDBOpenDBRequest).error;
        telemetry.error('IndexedDB', 'Erro ao abrir banco de dados local', err);
        // Permite retry em próxima chamada (private mode, quota, etc.)
        initPromise = null;
        reject(err);
      };

      request.onblocked = () => {
        telemetry.warn(
          'IndexedDB',
          'Upgrade bloqueado por outra aba. Feche as outras abas do REPRO neste dispositivo.',
        );
      };
    } catch (err) {
      telemetry.error('IndexedDB', 'Erro síncrono ao abrir DB', err);
      initPromise = null;
      reject(err);
    }
  });

  return initPromise;
}

export function getLocalDbInstance(): IDBDatabase | null {
  return dbInstance;
}

// -------------------------------------------------------------
// LEITURA
// -------------------------------------------------------------

/**
 * Todos os logs ordenados por `timestamp` DESC.
 * Requer índice `timestamp` (presente desde o v2).
 */
export async function getLogs(): Promise<Log[]> {
  const db = dbInstance || (await initDb());
  return telemetry.time('IndexedDB', 'getLogs', () => {
    return new Promise<Log[]>((resolve, reject) => {
      try {
        const transaction = db.transaction('logs', 'readonly');
        const store = transaction.objectStore('logs');

        if (!store.indexNames.contains('timestamp')) {
          return reject(
            new Error('Índice "timestamp" ausente. Bump DB_VERSION para forçar upgrade.'),
          );
        }

        const index = store.index('timestamp');
        const req = index.openCursor(null, 'prev');
        const results: Log[] = [];

        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            results.push(normalizeLogTipo(cursor.value as Log));
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Logs não sincronizados. Usa índice `synced` quando disponível
 * (leitura mínima em vez de full-scan).
 */
export async function getUnsyncedLogs(): Promise<Log[]> {
  const db = dbInstance || (await initDb());
  return new Promise<Log[]>((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');

      if (store.indexNames.contains('synced')) {
        const index = store.index('synced');
        const request = index.getAll(IDBKeyRange.only(false));
        request.onsuccess = () => {
          const raw = (request.result as Log[]) || [];
          resolve(raw.map(normalizeLogTipo));
        };
        request.onerror = () => reject(request.error);
        return;
      }

      // Fallback: DB v1 sem índice — lê tudo e filtra em memória.
      const request = store.getAll();
      request.onsuccess = () => {
        const raw = (request.result as Log[]) || [];
        resolve(raw.filter((l) => !l.synced).map(normalizeLogTipo));
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Logs por data (DD/MM/YYYY conforme gravado). Usa índice `data`.
 */
export async function getLogsByDate(data: string): Promise<Log[]> {
  if (!data || typeof data !== 'string') return [];
  const db = dbInstance || (await initDb());
  return new Promise<Log[]>((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');

      if (store.indexNames.contains('data')) {
        const index = store.index('data');
        const request = index.getAll(IDBKeyRange.only(data));
        request.onsuccess = () => {
          const raw = (request.result as Log[]) || [];
          resolve(raw.map(normalizeLogTipo));
        };
        request.onerror = () => reject(request.error);
        return;
      }

      // Fallback: DB v1 sem índice
      const request = store.getAll();
      request.onsuccess = () => {
        const raw = (request.result as Log[]) || [];
        resolve(raw.filter((l) => l.data === data).map(normalizeLogTipo));
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

// -------------------------------------------------------------
// ESCRITA
// -------------------------------------------------------------

export async function saveLog(log: Log): Promise<boolean> {
  const db = dbInstance || (await initDb());
  return new Promise<boolean>((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readwrite');
      const store = transaction.objectStore('logs');
      // Normaliza antes de gravar — mantém DB consistente
      store.put(normalizeLogTipo(log));
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Batch Save (Anti-N+1): uma única transação atômica para N logs.
 */
export async function saveLogsBulk(logs: Log[]): Promise<boolean> {
  if (logs.length === 0) return true;
  const db = dbInstance || (await initDb());
  return telemetry.time('IndexedDB', `saveLogsBulk (${logs.length} itens)`, () => {
    return new Promise<boolean>((resolve, reject) => {
      try {
        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');

        for (let i = 0; i < logs.length; i++) {
          store.put(normalizeLogTipo(logs[i]));
        }

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function deleteLog(id: number): Promise<boolean> {
  const db = dbInstance || (await initDb());
  return new Promise<boolean>((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readwrite');
      const store = transaction.objectStore('logs');
      store.delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

// -------------------------------------------------------------
// STATE (key/value)
// -------------------------------------------------------------

export async function saveState<T>(key: string, data: T): Promise<boolean> {
  const db = dbInstance || (await initDb());
  return new Promise<boolean>((resolve, reject) => {
    try {
      const transaction = db.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      store.put({ key, data });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getState<T = unknown>(key: string): Promise<T | null> {
  const db = dbInstance || (await initDb());
  return new Promise<T | null>((resolve, reject) => {
    try {
      const transaction = db.transaction('state', 'readonly');
      const store = transaction.objectStore('state');
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? (request.result.data as T) : null);
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearLogsAndState(): Promise<boolean> {
  const db = dbInstance || (await initDb());
  return new Promise<boolean>((resolve, reject) => {
    try {
      const transaction = db.transaction(['logs', 'state'], 'readwrite');
      transaction.objectStore('logs').clear();
      transaction.objectStore('state').clear();

      transaction.oncomplete = () => {
        telemetry.warn('IndexedDB', 'Banco de dados local limpo com sucesso.');
        resolve(true);
      };
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

// -------------------------------------------------------------
// FILA OPERACIONAL (mitigação do lost update — ver nota no topo)
// -------------------------------------------------------------

const OPERATIONAL_QUEUE_KEY = 'operational_sync_queue';

/**
 * Enfileira um evento operacional.
 *
 * Usa transação única `readwrite` no store `state`. Sem ela, duas chamadas
 * concorrentes (read-modify-write) podem perder um dos eventos.
 */
export async function enqueueOperationalEvent(event: OperationalEvent): Promise<void> {
  const db = dbInstance || (await initDb());
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const getReq = store.get(OPERATIONAL_QUEUE_KEY);

      getReq.onsuccess = () => {
        const existing = (getReq.result?.data as OperationalEvent[] | undefined) ?? [];
        if (!existing.some((item) => item.id === event.id)) {
          existing.push(event);
          store.put({ key: OPERATIONAL_QUEUE_KEY, data: existing });
        }
      };
      getReq.onerror = () => reject(getReq.error);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getOperationalSyncQueue(): Promise<OperationalEvent[]> {
  try {
    const queue = await getState<OperationalEvent[]>(OPERATIONAL_QUEUE_KEY);
    return queue ?? [];
  } catch {
    return [];
  }
}

/**
 * Remove da fila os eventos com os IDs informados.
 * Usa transação única para consistência.
 */
export async function clearOperationalSyncQueue(processedIds: string[]): Promise<void> {
  if (processedIds.length === 0) return;
  const db = dbInstance || (await initDb());
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const getReq = store.get(OPERATIONAL_QUEUE_KEY);

      getReq.onsuccess = () => {
        const existing = (getReq.result?.data as OperationalEvent[] | undefined) ?? [];
        const idSet = new Set(processedIds);
        const remaining = existing.filter((e) => !idSet.has(e.id));
        store.put({ key: OPERATIONAL_QUEUE_KEY, data: remaining });
      };
      getReq.onerror = () => reject(getReq.error);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}
