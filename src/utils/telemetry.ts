/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Structured Logger & Telemetry Monitor
 * Captures diagnostics, network latencies, database timings, and errors.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'PERF';

export interface TelemetryEntry {
  id: string;
  timestamp: number;
  isoTime: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  durationMs?: number;
}

class TelemetryService {
  private buffer: TelemetryEntry[] = [];
  private maxBufferSize: number = 200;
  private listeners: ((entry: TelemetryEntry) => void)[] = [];

  constructor() {
    // Intercept uncaught window errors to telemetry
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('WindowError', event.message, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.error('UnhandledRejection', event.reason?.message || String(event.reason), {
          stack: event.reason?.stack
        });
      });
    }
  }

  private log(level: LogLevel, context: string, message: string, data?: any, durationMs?: number) {
    const entry: TelemetryEntry = {
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      level,
      context,
      message,
      data,
      durationMs
    };

    this.buffer.unshift(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    // Console output without %c argument leaks
    const prefix = `[${entry.isoTime.substring(11, 19)}] [${level}] [${context}]`;
    const logMessage = `${prefix} ${message}`;
    
    switch (level) {
      case 'DEBUG':
        console.debug(logMessage, data || '');
        break;
      case 'INFO':
        console.info(logMessage, data || '');
        break;
      case 'WARN':
        console.warn(logMessage, data || '');
        break;
      case 'ERROR':
        console.error(logMessage, data || '');
        break;
      case 'PERF':
        console.log(`${prefix} ⏱️ ${durationMs !== undefined ? durationMs.toFixed(1) : '0'}ms - ${message}`, data || '');
        break;
    }

    this.notify(entry);
  }

  public debug(context: string, message: string, data?: any) {
    this.log('DEBUG', context, message, data);
  }

  public info(context: string, message: string, data?: any) {
    this.log('INFO', context, message, data);
  }

  public warn(context: string, message: string, data?: any) {
    this.log('WARN', context, message, data);
  }

  public error(context: string, message: string, data?: any) {
    this.log('ERROR', context, message, data);
  }

  public async time<T>(context: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.log('PERF', context, label, undefined, duration);
      return result;
    } catch (err: any) {
      const duration = performance.now() - start;
      this.log('ERROR', context, `${label} falhou após ${duration.toFixed(1)}ms: ${err.message}`, { error: err });
      throw err;
    }
  }

  public getRecentLogs(limit = 100): TelemetryEntry[] {
    return this.buffer.slice(0, limit);
  }

  public getSummary() {
    const counts = {
      total: this.buffer.length,
      errors: this.buffer.filter(e => e.level === 'ERROR').length,
      warnings: this.buffer.filter(e => e.level === 'WARN').length,
      perf: this.buffer.filter(e => e.level === 'PERF').length,
    };
    return counts;
  }

  public subscribe(listener: (entry: TelemetryEntry) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(entry: TelemetryEntry) {
    this.listeners.forEach(fn => {
      try {
        fn(entry);
      } catch (err) {
        // ignore subscriber errors
      }
    });
  }

  public exportAsJSON(): string {
    return JSON.stringify(this.buffer, null, 2);
  }
}

export const telemetry = new TelemetryService();
