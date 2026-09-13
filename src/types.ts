// -------------------------------------------------------------
// Helpers de ID (Log.id)
// -------------------------------------------------------------

let __lastLogId = 0;

/**
 * Gera um ID único e monotônico em milissegundos.
 *
 * Use SEMPRE `newLogId()` em vez de `Date.now()` ao criar `Log`.
 * Garante unicidade mesmo quando dois `saveLog` ocorrem no mesmo ms.
 */
export function newLogId(): number {
  const now = Date.now();
  __lastLogId = now > __lastLogId ? now : __lastLogId + 1;
  return __lastLogId;
}

/** Só para testes. NÃO usar em produção. */
export function __resetLogIdForTests(v = 0): void {
  __lastLogId = v;
}

// -------------------------------------------------------------
// Helpers de normalização
// -------------------------------------------------------------

/**
 * Garante que `log.tipo` está preenchido, inferindo de `atividade`
 * quando ausente (logs v2 legados).
 */
export function normalizeLogTipo(log: Log): Log {
  if (log.tipo) return log;
  const isIndireta = String(log.atividade).toUpperCase().startsWith('IND:');
  return { ...log, tipo: isIndireta ? 'indireta' : 'direta' };
}

// -------------------------------------------------------------
// Tipos de infraestrutura
// -------------------------------------------------------------

export type NetworkStatus = 'online' | 'offline' | 'unknown';

export type ToastColor = 
  | 'var(--color-success)' 
  | 'var(--color-danger)' 
  | 'var(--color-warning)' 
  | 'var(--color-info)';

export interface Toast {
  id: number;
  message: string;
  color: ToastColor;
}
