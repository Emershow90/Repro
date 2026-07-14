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

export function saveState(key: string, data: AppTimerState): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      reject(new Error("Database not initialized"));
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

export function getState(key: string): Promise<AppTimerState | null> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve(null);
      return;
    }
    const transaction = dbInstance.transaction('state', 'readonly');
    const store = transaction.objectStore('state');
    const request = store.get(key);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.data as AppTimerState);
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
