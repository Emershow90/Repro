/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Circuit Breaker, Concurrency Lock & Loop Guard
 * Prevents infinite loops, runaway background jobs, and excessive external API billing.
 */

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of consecutive failures before opening circuit (default: 3)
  cooldownPeriodMs?: number; // Time to wait before attempting half-open state (default: 30000ms)
  timeoutMs?: number; // Max timeout for individual call (default: 15000ms)
}

export class CircuitBreaker {
  private name: string;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private failureThreshold: number;
  private cooldownPeriodMs: number;
  private timeoutMs: number;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownPeriodMs = options.cooldownPeriodMs || 30000;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  public getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownPeriodMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      const remainingSec = Math.ceil((this.cooldownPeriodMs - (Date.now() - this.lastFailureTime)) / 1000);
      throw new Error(
        `[CircuitBreaker:${this.name}] Circuito ABERTO devido a falhas consecutivas. Bloqueando chamadas para evitar sobrecarga/custos. Tente novamente em ${remainingSec}s.`
      );
    }

    try {
      // Wrap with timeout to avoid hanging indefinitely
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`[CircuitBreaker:${this.name}] Timeout após ${this.timeoutMs}ms`)), this.timeoutMs)
        )
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    } else {
      this.state = 'CLOSED';
    }
  }

  private onFailure(error: any) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(
        `⚠️ [CircuitBreaker:${this.name}] Limiar de ${this.failureThreshold} falhas atingido. Circuito ABERTO por ${this.cooldownPeriodMs / 1000}s. Último erro:`,
        error?.message || error
      );
    }
  }

  public reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Singleton instances for common services
 */
export const sheetsCircuitBreaker = new CircuitBreaker('GoogleSheetsSync', {
  failureThreshold: 3,
  cooldownPeriodMs: 25000,
  timeoutMs: 12000
});

export const supabaseCircuitBreaker = new CircuitBreaker('SupabaseSync', {
  failureThreshold: 4,
  cooldownPeriodMs: 20000,
  timeoutMs: 10000
});

/**
 * Concurrency Mutex / Job Guard:
 * Prevents multiple background jobs from running concurrently and hammering APIs.
 */
export class JobGuard {
  private activeJobs = new Set<string>();
  private executionCounts = new Map<string, { count: number; windowStart: number }>();
  private maxExecutionsPerMinute: number;

  constructor(maxExecutionsPerMinute: number = 30) {
    this.maxExecutionsPerMinute = maxExecutionsPerMinute;
  }

  public isRunning(jobName: string): boolean {
    return this.activeJobs.has(jobName);
  }

  public async runExclusive<T>(jobName: string, fn: () => Promise<T>): Promise<T | null> {
    // 1. Concurrency Check
    if (this.activeJobs.has(jobName)) {
      console.warn(`[JobGuard] Job '${jobName}' já está em execução. Chamada duplicada descartada.`);
      return null;
    }

    // 2. Loop & Rate limit check (anti-infinite loop watchdog)
    const now = Date.now();
    const stats = this.executionCounts.get(jobName) || { count: 0, windowStart: now };
    if (now - stats.windowStart > 60000) {
      stats.count = 0;
      stats.windowStart = now;
    }

    stats.count++;
    this.executionCounts.set(jobName, stats);

    if (stats.count > this.maxExecutionsPerMinute) {
      console.warn(
        `🚨 [JobGuard:RATE_LIMIT] Job '${jobName}' atingiu o limite de ${this.maxExecutionsPerMinute} execuções no minuto. Descartando execução para proteção de recursos.`
      );
      return null;
    }

    // 3. Execute with lock
    this.activeJobs.add(jobName);
    try {
      return await fn();
    } finally {
      this.activeJobs.delete(jobName);
    }
  }
}

export const globalJobGuard = new JobGuard(30);
