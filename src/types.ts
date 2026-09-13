/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  tipo: 'direta' | 'indireta';
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

export interface ReproDemand {
  id: string;
  data: string; // YYYY-MM-DD
  setor: string;
  rua: string;
  demandaCalculada: number; // Quantidade calculada pelo REPRO
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
  cronometro: {
    ativo: boolean;
    iniciadoEm?: number;
    tempoAcumuladoMs: number;
  };
  atualizadoEm: number;
}

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

export interface AppTimerState {
  cronometro: StopwatchState;
  rascunhoColab: string;
  rascunhoVol: string;
}

// Chaves de Armazenamento Local Compartilhadas
export const STORAGE_ACTIVE_SESSION_KEY = 'repro_active_session_organism_v5';
export const STORAGE_EVENTS_KEY = 'repro_operational_events_v5';
export const STORAGE_OFFLINE_QUEUE_KEY = 'repro_offline_replenishment_queue_v1';

// -------------------------------------------------------------
// POc REABASTECIMENTO OFFLINE GUIADO & AUDITORIA AS/400
// -------------------------------------------------------------

export type ReplenishmentStep = 'ENDERECO' | 'CONTENANT' | 'ARTIGO' | 'QUANTIDADE' | 'CONFIRMACAO';

export interface CatalogArticlePackaging {
  artigo: string;
  descricao: string;
  embalagemPadrao: string; // ex: 'CX-12', 'CX-24', 'FD-6', 'PLT-60'
  qtdPadrao: number; // unidades por caixa / contenant
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
  tipoDivergencia?: 'QUANTIDADE_ACIMA' | 'QUANTIDADE_ABAIXO' | 'PALLET_DESMEMBRADO' | 'ARTIGO_NAO_CATALOGADO' | 'NENHUMA';
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


