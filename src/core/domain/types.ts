/**
 * Tipos de Domínio: A fonte da verdade para o nosso Core.
 * Dados aqui são imutáveis e definem a operação.
 */

export interface OperationEvent {
  id: string;
  type: 'REABASTECIMENTO' | 'LOG_OPERACIONAL' | 'AJUSTE';
  sector: string;
  street: string;
  timestamp: number;
  payload: Record<string, any>;
}

export interface SyncStatus {
  lastSync: number | null;
  pendingEvents: number;
  isSyncing: boolean;
}
