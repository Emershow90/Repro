/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Log } from './types';

export type EventCallback<T = unknown> = (data: T) => void;

class EventBusClass {
  // Set evita duplicata silenciosa; Map é O(1) para on/off
  private listeners = new Map<string, Set<EventCallback>>();

  /**
   * Registra um listener. Retorna função de cleanup.
   *
   * Uso moderno:
   *   const off = EventBus.on('X', handler);
   *   ...
   *   off();
   *
   * Uso alternativo:
   *   EventBus.on('X', handler);
   *   ...
   *   EventBus.off('X', handler);
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback as EventCallback);

    // Unsubscribe idempotente
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Remove um listener específico. Idempotente.
   */
  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback as EventCallback);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Remove todos os listeners de um evento (ou todos, se omitido).
   * Útil em testes.
   */
  clear(event?: string): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }

  emit<T = unknown>(event: string, data: T): void {
    if (import.meta.env.DEV) {
      console.log(`[EVENT BUS] ${event}`, data);
    }

    const set = this.listeners.get(event);
    if (!set) return;

    // Snapshot: permite unsubscribe durante o emit sem pular listeners
    for (const cb of Array.from(set)) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EVENT BUS] Erro em listener de "${event}":`, err);
      }
    }
  }

  /** Quantos listeners estão registrados em um evento (debug/testes). */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

export const EventBus = new EventBusClass();
export default EventBus;
