/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';

export interface AppEvents {
  ATIVIDADE_FINALIZADA: Log;
}

export type EventCallback<T> = (data: T) => void;

class EventBusClass {
  private listeners: { [K in keyof AppEvents]?: Set<EventCallback<AppEvents[K]>> } = {};

  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): () => void {
    const listeners = this.listeners[event] ?? new Set<EventCallback<AppEvents[K]>>();
    listeners.add(callback);
    this.listeners[event] = listeners;
    return () => this.off(event, callback);
  }

  off<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>) {
    this.listeners[event]?.delete(callback);
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]) {
    console.log(`[EVENT BUS] Dispatched: ${event}`, data);
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error("Error in event subscriber", e);
        }
      });
    }
  }
}

export const EventBus = new EventBusClass();

// Bind to window.EventBus for compatibility
if (typeof window !== 'undefined') {
  (window as any).EventBus = EventBus;
}
export default EventBus;
