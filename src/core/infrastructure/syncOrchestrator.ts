/**
 * Infrastructure Layer: SyncOrchestrator
 * Gerencia a fila de eventos, persistência local e sincronização com o backend.
 */
import { openDatabase } from './db';
import { OperationEvent } from '../domain/types';

export class SyncOrchestrator {
  private db: IDBDatabase | null = null;

  async init() {
    this.db = await openDatabase();
  }

  async addEvent(event: OperationEvent) {
    if (!this.db) await this.init();
    
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');
      store.add(event);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async syncPendingEvents(syncApiUrl: string) {
    if (!this.db) await this.init();

    // 1. Fetch all pending events
    const events = await this.getAllEvents();
    if (events.length === 0) return;

    // 2. Attempt Sync
    try {
      const response = await fetch(`${syncApiUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      });

      if (!response.ok) throw new Error('Sync failed');

      // 3. If success, clear local queue
      await this.clearDatabase();
    } catch (error) {
      console.error('Sync failed, will retry later:', error);
      throw error; // Propagate for retry logic
    }
  }

  private getAllEvents(): Promise<OperationEvent[]> {
    return new Promise((resolve) => {
      const transaction = this.db!.transaction('events', 'readonly');
      const store = transaction.objectStore('events');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  private clearDatabase() {
    return new Promise<void>((resolve) => {
      const transaction = this.db!.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');
      store.clear();
      transaction.oncomplete = () => resolve();
    });
  }
}
