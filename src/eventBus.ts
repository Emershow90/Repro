/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from './types';

export type EventCallback = (data: Log) => void;

class EventBusClass {
  private listeners: { [event: string]: EventCallback[] } = {};

  on(event: string, callback: EventCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event: string, data: Log) {
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
