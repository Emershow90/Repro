/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// -------------------------------------------------------------
// Tipos de Log e Timer
// -------------------------------------------------------------

export interface Log {
  id: number;
  data: string;
  dia: string;
  semana: number;
  atividade: string;
  colaborador: string;
  volumes: number;
  horas: number;
  vph: string;
  timestamp: number;
  synced: boolean;
  /**
   * Opcional por retrocompatibilidade: logs v2 no IndexedDB não têm este campo.
   * Use `normalizeLogTipo()` ao ler do banco para garantir preenchimento.
   */
  tipo?: 'direta' | 'indireta';
  setor?: string;
  horaInicio?: string;
  horaFim?: string;
  rua?: string;
  enderecos?: number;
  mediaPorEndereco?: number;
  eph?: string;
}

export interface StopwatchState {
  ativo: boolean;
  inicio: number;
  segundos: number;
  atividade: string;
  botaoId: string;
  tipo: 'direta' | 'indireta';
}

export interface AppTimerState {
  cronometro: StopwatchState;
  rascunhoColab: string;
  rascunhoVol: string;
}

// -------------------------------------------------------------
// Demanda e Sessão
// -------------------------------------------------------------

export interface ReproDemand {
  id: string;
  data: string; // YYYY-MM-DD
  setor: string;
  rua: string;
  demandaCalculada: number;
  unidade: 'CAIXAS' | 'VOLUMES';
}

export interface ActiveSession {
  id: string;
  data: string; // YYYY-MM-DD
  setor: string;
  rua: string;
  demandaRepro: number | null;
  unidade: 'CAIXAS' | 'VOLUMES' | null;
  realizado: number;
  enderecos: number;
  volumes: number;
  unidadeRealizado: 'CAIXAS' | 'VOLUMES';
  defaultVolPerAddress: number;
  /**
   * Union discriminada: quando `ativo === true`, `iniciadoEm` é obrigatório.
   * Evita o bug de `Date.now() - undefined → NaN`.
   */
  cronometro: {
    ativo: boolean;
    iniciadoEm?: number;
    tempoAcumuladoMs: number;
  };

// -------------------------------------------------------------
// Eventos Operacionais
// -------------------------------------------------------------

export interface OperationalEvent {
  id: string;
  timestamp: number;
  tipo:
    | 'ENDERECO_CONCLUIDO'
    | 'DESFAZER'
    | 'AJUSTE_VOLUME'
    | 'REDUCAO_VOLUME'
    | 'PAUSA'
    | 'RETOMADA'
    | 'FINALIZACAO';
  sessionId: string;
  setor: string;
  rua: string;
  enderecosDelta: number;
  volumesDelta: number;
  lapDurationSeconds?: number;
  justification?: string;
  previousState?: {
    enderecos: number;
    volumes: number;
    realizado: number;
  };
}

export interface StreetReplenishmentSession {
  rua: string;
  setor: string;
  operationDate: string;
  addressCount: number;
  volumeCount: number;
  defaultVolPerAddress: number;
  stopwatchActive: boolean;
  stopwatchSeconds: number;
  stopwatchStartTs: number | null;
  historyEvents: Array<{
    type: 'add_address' | 'add_volume' | 'reduce_volume';
    addressesDelta: number;
    volumesDelta: number;
    timestamp: number;
    lapDuration?: number;
    justification?: string;
  }>;
}

export interface SyncEventPayload {
  eventId: string;
  timestamp: number;
  tipo: string;
  sessionId: string;
  setor: string;
  rua: string;
  colaborador?: string;
  data: string;
  enderecosDelta: number;
  volumesDelta: number;
  lapDurationSeconds?: number;
  justification?: string;
  demandaCalculada?: number;
  unidade?: 'CAIXAS' | 'VOLUMES';
  totalRealizadoAteAgora?: number;
}

export interface StreetSummary {
  rua: string;
  setor: string;
  demanda: number | null;
  unidade: 'CAIXAS' | 'VOLUMES' | null;
  realizado: number;
  pendente: number | null;
  coberturaPercent: number | null;
  excedente: number;
  enderecos: number;
  tempoTotalSegundos: number;
  eph: string;
  vph: string;
  status: 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'ATENDIDA' | 'EXCEDENTE';
}

// -------------------------------------------------------------
// Chaves de Armazenamento Local (versão centralizada)
// -------------------------------------------------------------

const STORAGE_SCHEMA_VERSION = 'v5';

export const STORAGE_ACTIVE_SESSION_KEY = `repro_active_session_organism_${STORAGE_SCHEMA_VERSION}`;
export const STORAGE_EVENTS_KEY = `repro_operational_events_${STORAGE_SCHEMA_VERSION}`;
export const STORAGE_OFFLINE_QUEUE_KEY = `repro_offline_replenishment_queue_${STORAGE_SCHEMA_VERSION}`;

// Chaves de localStorage (usadas diretamente pelo App.tsx)
export const LS_KEYS = {
  USER: 'repro_local_user',
  GUEST_MODE: 'repro_guest_mode',
  SHEETS_URL: 'repro_sheets_api_url',
  ACTIVE_OPERATOR: 'repro_active_operator',
  THEME: 'repro_theme',
  SCREENSAVER_ENABLED: 'repro_screensaver_enabled',
  SCREENSAVER_TIMEOUT: 'repro_screensaver_timeout',
  TIMER_STATE_DUAL: 'timerStateDual',
  LEGACY_BUFFER: 'terminal_repro_v2',
} as const;

// -------------------------------------------------------------
// POc Reabastecimento Offline Guiado & Auditoria AS/400
// -------------------------------------------------------------

export type ReplenishmentStep = 'ENDERECO' | 'CONTENANT' | 'ARTIGO' | 'QUANTIDADE' | 'CONFIRMACAO';

export interface CatalogArticlePackaging {
  artigo: string;
  descricao: string;
  embalagemPadrao: string;
  qtdPadrao: number;
  qtdMinima: number;
  qtdMaxima: number;
  isPallet: boolean;
  caixasPorPallet?: number;
  setorSugerido?: string;
  ruaSugerida?: string;
}

export interface OfflineReplenishmentRecord {
  id: string;
  timestamp: number;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm:ss
  operador: string;
  setor: string;
  endereco: string;
  contenant: string;
  artigo: string;
  quantidade: number;
  quantidadeEsperada?: number;
  divergencia: boolean;
  tipoDivergencia?:
    | 'QUANTIDADE_ACIMA'
    | 'QUANTIDADE_ABAIXO'
    | 'PALLET_DESMEMBRADO'
    | 'ARTIGO_NAO_CATALOGADO'
    | 'NENHUMA';
  desmembramento?: {
    isPallet: boolean;
    palletOriginalQtd: number;
    caixasAbertas: number;
    unidadesPorCaixa: number;
    quantidadeCalculada: number;
    divergenciaPallet: number;
    checklistConcluido: boolean;
  };
  observacao?: string;
  synced: boolean;
  syncedAt?: number;
}

export interface As400ConnectionConfig {
  host: string;
  port: number;
  schema: string;
  usuario: string;
  senha?: string;
  useSsl?: boolean;
  timeoutMs?: number;
  lastTested?: number;
  lastStatus?: 'ONLINE' | 'OFFLINE' | 'ERRO';
  lastLatencyMs?: number;
  lastError?: string;
  autoSyncIntervalMinutes?: number;
}

export interface As400AuditComparisonRow {
  id: string;
  artigo: string;
  designacao: string;
  setor: string;
  rua: string;
  endereco: string;
  contenant?: string;
  qtdAs400Stock: number;
  qtdAs400Picking: number;
  qtdAs400Demanda: number;
  qtdFisicaContada: number;
  divergencia: number;
  statusAuditoria: 'OK_CONFERE' | 'DIVERGENCIA_SOBRA' | 'DIVERGENCIA_FALTA' | 'NAO_CONFERIDO';
  ultimaLeituraTs?: number;
  operador?: string;
}

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
