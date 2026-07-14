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

