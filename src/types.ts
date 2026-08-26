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


