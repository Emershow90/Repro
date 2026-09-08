/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Centralized Report Generator - Unified article report calculation service
 * Consolidates all data from local database to generate daily, weekly, and monthly reports
 */

import { Log, ReproDemand, OperationalEvent, StreetSummary } from '../types';
import { getLogsByDate, getState } from '../dbLocal';
import { getWeekNumber, parseDateString, getDayOfWeekName } from './dateUtils';

export interface DailyReport {
  data: string;
  dia: string;
  tipo: 'diário';
  totalDemanda: number;
  totalRealizado: number;
  totalEnderecos: number;
  totalHoras: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  saldoPendente: number;
  ruasAtendidas: number;
  totalRuas: number;
  detalhePorRua: StreetSummary[];
  timestamp: number;
}

export interface WeeklyReport {
  semana: number;
  ano: number;
  tipo: 'semanal';
  dataInicio: string;
  dataFim: string;
  totalDemanda: number;
  totalRealizado: number;
  totalEnderecos: number;
  totalHoras: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  diarioPorDia: DailyReport[];
  timestamp: number;
}

export interface MonthlyReport {
  mes: number;
  ano: number;
  tipo: 'mensal';
  dataInicio: string;
  dataFim: string;
  totalDemanda: number;
  totalRealizado: number;
  totalEnderecos: number;
  totalHoras: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  semanasPorSemana: WeeklyReport[];
  timestamp: number;
}

const STORAGE_DEMANDS_KEY = 'repro_demands_v5';
const STORAGE_EVENTS_KEY = 'repro_operational_events_v5';

/**
 * Calculate daily report from consolidated local data
 */
export async function calculateDailyReport(
  selectedDate: string,
  logs: Log[],
  streetSummaries: StreetSummary[],
  demands?: Record<string, ReproDemand>
): Promise<DailyReport> {
  const targetDateBR = selectedDate.split('-').reverse().join('/');
  
  let totalDemanda = 0;
  let totalRealizado = 0;
  let totalEnderecos = 0;
  let totalSegundos = 0;
  let ruasAtendidas = 0;

  streetSummaries.forEach(s => {
    if (s.demanda !== null) totalDemanda += s.demanda;
    totalRealizado += s.realizado;
    totalEnderecos += s.enderecos;
    totalSegundos += s.tempoTotalSegundos;
    if (s.status === 'ATENDIDA' || s.status === 'EXCEDENTE') ruasAtendidas++;
  });

  const totalHoras = totalSegundos / 3600;
  const ephGlobal = totalHoras > 0 ? (totalEnderecos / totalHoras).toFixed(1) : '0.0';
  const vphGlobal = totalHoras > 0 ? (totalRealizado / totalHoras).toFixed(1) : '0.0';
  const coberturaGlobal = totalDemanda > 0 ? Number(((totalRealizado / totalDemanda) * 100).toFixed(1)) : 0;
  const saldoPendente = Math.max(0, totalDemanda - totalRealizado);

  return {
    data: targetDateBR,
    dia: getDayOfWeekName(targetDateBR),
    tipo: 'diário',
    totalDemanda,
    totalRealizado,
    totalEnderecos,
    totalHoras,
    ephGlobal,
    vphGlobal,
    coberturaGlobal,
    saldoPendente,
    ruasAtendidas,
    totalRuas: streetSummaries.length,
    detalhePorRua: streetSummaries,
    timestamp: Date.now()
  };
}

/**
 * Calculate weekly report from daily data aggregation
 */
export async function calculateWeeklyReport(
  semana: number,
  ano: number,
  logs: Log[],
  dailyReports: DailyReport[]
): Promise<WeeklyReport> {
  // Filter daily reports for the specified week
  const weeklyDailyReports = dailyReports.filter(d => {
    const parsed = parseDateString(d.data.split('/').reverse().join('-'));
    return parsed && getWeekNumber(d.data) === semana;
  });

  if (weeklyDailyReports.length === 0) {
    return {
      semana,
      ano,
      tipo: 'semanal',
      dataInicio: '',
      dataFim: '',
      totalDemanda: 0,
      totalRealizado: 0,
      totalEnderecos: 0,
      totalHoras: 0,
      ephGlobal: '0.0',
      vphGlobal: '0.0',
      coberturaGlobal: 0,
      diarioPorDia: [],
      timestamp: Date.now()
    };
  }

  let totalDemanda = 0;
  let totalRealizado = 0;
  let totalEnderecos = 0;
  let totalSegundos = 0;

  weeklyDailyReports.forEach(daily => {
    totalDemanda += daily.totalDemanda;
    totalRealizado += daily.totalRealizado;
    totalEnderecos += daily.totalEnderecos;
    totalSegundos += daily.totalHoras * 3600;
  });

  const totalHoras = totalSegundos / 3600;
  const ephGlobal = totalHoras > 0 ? (totalEnderecos / totalHoras).toFixed(1) : '0.0';
  const vphGlobal = totalHoras > 0 ? (totalRealizado / totalHoras).toFixed(1) : '0.0';
  const coberturaGlobal = totalDemanda > 0 ? Number(((totalRealizado / totalDemanda) * 100).toFixed(1)) : 0;

  return {
    semana,
    ano,
    tipo: 'semanal',
    dataInicio: weeklyDailyReports[0]?.data || '',
    dataFim: weeklyDailyReports[weeklyDailyReports.length - 1]?.data || '',
    totalDemanda,
    totalRealizado,
    totalEnderecos,
    totalHoras,
    ephGlobal,
    vphGlobal,
    coberturaGlobal,
    diarioPorDia: weeklyDailyReports,
    timestamp: Date.now()
  };
}

/**
 * Calculate monthly report from weekly data aggregation
 */
export async function calculateMonthlyReport(
  mes: number,
  ano: number,
  logs: Log[],
  weeklyReports: WeeklyReport[]
): Promise<MonthlyReport> {
  // Filter weekly reports for the specified month
  const monthlyWeeklyReports = weeklyReports.filter(w => {
    if (!w.dataInicio) return false;
    const parts = w.dataInicio.split('/');
    if (parts.length !== 3) return false;
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return month === mes && year === ano;
  });

  if (monthlyWeeklyReports.length === 0) {
    return {
      mes,
      ano,
      tipo: 'mensal',
      dataInicio: '',
      dataFim: '',
      totalDemanda: 0,
      totalRealizado: 0,
      totalEnderecos: 0,
      totalHoras: 0,
      ephGlobal: '0.0',
      vphGlobal: '0.0',
      coberturaGlobal: 0,
      semanasPorSemana: [],
      timestamp: Date.now()
    };
  }

  let totalDemanda = 0;
  let totalRealizado = 0;
  let totalEnderecos = 0;
  let totalSegundos = 0;

  monthlyWeeklyReports.forEach(weekly => {
    totalDemanda += weekly.totalDemanda;
    totalRealizado += weekly.totalRealizado;
    totalEnderecos += weekly.totalEnderecos;
    totalSegundos += weekly.totalHoras * 3600;
  });

  const totalHoras = totalSegundos / 3600;
  const ephGlobal = totalHoras > 0 ? (totalEnderecos / totalHoras).toFixed(1) : '0.0';
  const vphGlobal = totalHoras > 0 ? (totalRealizado / totalHoras).toFixed(1) : '0.0';
  const coberturaGlobal = totalDemanda > 0 ? Number(((totalRealizado / totalDemanda) * 100).toFixed(1)) : 0;

  return {
    mes,
    ano,
    tipo: 'mensal',
    dataInicio: monthlyWeeklyReports[0]?.dataInicio || '',
    dataFim: monthlyWeeklyReports[monthlyWeeklyReports.length - 1]?.dataFim || '',
    totalDemanda,
    totalRealizado,
    totalEnderecos,
    totalHoras,
    ephGlobal,
    vphGlobal,
    coberturaGlobal,
    semanasPorSemana: monthlyWeeklyReports,
    timestamp: Date.now()
  };
}

/**
 * Generate consolidated batch payload for Google Sheets
 * Unifies all reports and eliminates redundancy
 */
export function generateConsolidatedBatchPayload(
  dailyReport: DailyReport,
  weeklyReport: WeeklyReport,
  monthlyReport: MonthlyReport,
  queue: any[]
) {
  return {
    tipo: 'SYNC_BATCH_CONSOLIDATED_REPRO',
    timestamp: Date.now(),
    
    // Unified reports
    relatorio_diario: dailyReport,
    relatorio_semanal: weeklyReport,
    relatorio_mensal: monthlyReport,
    
    // Pending operations queue (max 50 items)
    eventos_pendentes: queue.slice(0, 50),
    
    // Metadata
    total_eventos_pendentes: queue.length,
    versao_schema: '2.0'
  };
}

/**
 * Save reports to local storage for offline access
 */
export async function saveReportsLocally(
  dailyReport: DailyReport,
  weeklyReport: WeeklyReport,
  monthlyReport: MonthlyReport
): Promise<void> {
  try {
    await Promise.all([
      saveState('last_daily_report', dailyReport),
      saveState('last_weekly_report', weeklyReport),
      saveState('last_monthly_report', monthlyReport)
    ]);
  } catch (err) {
    console.warn('Erro ao salvar relatórios localmente:', err);
  }
}

/**
 * Retrieve cached reports from local storage
 */
export async function loadCachedReports(): Promise<{
  daily: DailyReport | null;
  weekly: WeeklyReport | null;
  monthly: MonthlyReport | null;
}> {
  try {
    const [daily, weekly, monthly] = await Promise.all([
      getState<DailyReport>('last_daily_report'),
      getState<WeeklyReport>('last_weekly_report'),
      getState<MonthlyReport>('last_monthly_report')
    ]);
    return { daily, weekly, monthly };
  } catch {
    return { daily: null, weekly: null, monthly: null };
  }
}
