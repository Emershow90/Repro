/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { Log } from '../types';

// Zod Schema for strict validation of Log entries
export const LogSchema = z.object({
  id: z.number(),
  data: z.string(),
  dia: z.string(),
  semana: z.number(),
  atividade: z.string().min(1, 'Atividade é obrigatória'),
  colaborador: z.string().min(1, 'Colaborador é obrigatório'),
  volumes: z.number().nonnegative(),
  horas: z.number().positive(),
  vph: z.string(),
  timestamp: z.number(),
  synced: z.boolean(),
  tipo: z.enum(['direta', 'indireta']),
  setor: z.string().optional()
});

export interface ActivitySummary {
  activity: string;
  volumes: number;
  horas: number;
  vph: string;
  isInd: boolean;
}

export interface OperatorSummary {
  name: string;
  volumes: number;
  hDir: number;
  hInd: number;
  hTot: number;
  vphNet: string;
}

export interface WeeklyConsolidation {
  week: number;
  volumes: number;
  hours: number;
  vph: string;
  range: string;
}

export interface MonthlyConsolidation {
  monthYear: string;
  volumes: number;
  hours: number;
  vph: string;
}

export const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
] as const;

/**
 * Parses date string in DD/MM/YYYY or ISO format to Date
 */
export function parseDateString(str: string | null | undefined): Date | null {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;
  return null;
}

/**
 * Calculates Net VPH (Volumes divided by Direct Hours)
 */
export function calculateVphNet(totalVolumes: number, horasDiretas: number): string {
  if (horasDiretas <= 0) return '0.00';
  return (totalVolumes / horasDiretas).toFixed(2);
}

/**
 * Calculates Gross VPH (Volumes divided by Total Hours)
 */
export function calculateVphBruto(totalVolumes: number, totalHoras: number): string {
  if (totalHoras <= 0) return '0.00';
  return (totalVolumes / totalHoras).toFixed(2);
}

/**
 * Computes Activity Summary breakdown for a set of logs
 */
export function computeActivitiesSummary(weekLogs: Log[]): ActivitySummary[] {
  const uniqueActivities = Array.from(new Set(weekLogs.map(l => l.atividade)));
  
  return uniqueActivities.map(act => {
    const actLogs = weekLogs.filter(l => l.atividade === act);
    const volumes = actLogs.reduce((acc, l) => acc + l.volumes, 0);
    const horas = actLogs.reduce((acc, l) => acc + l.horas, 0);
    const isInd = actLogs[0]?.tipo === 'indireta';
    const vph = calculateVphNet(volumes, horas);
    return { activity: act, volumes, horas, vph, isInd };
  }).sort((a, b) => b.volumes - a.volumes);
}

/**
 * Computes Operator Performance Summary for a set of logs
 */
export function computeOperatorsSummary(weekLogs: Log[]): OperatorSummary[] {
  const uniqueColabs = Array.from(new Set(weekLogs.map(l => l.colaborador)));

  return uniqueColabs.map(colab => {
    const colabLogs = weekLogs.filter(l => l.colaborador === colab);
    const volumes = colabLogs.reduce((acc, l) => acc + l.volumes, 0);
    const hDir = colabLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const hInd = colabLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const hTot = hDir + hInd;
    const vphNet = calculateVphNet(volumes, hDir);
    return { name: colab, volumes, hDir, hInd, hTot, vphNet };
  }).sort((a, b) => b.volumes - a.volumes);
}

/**
 * Computes Weekly Consolidation for all logs
 */
export function computeWeeklyConsolidation(logs: Log[]): WeeklyConsolidation[] {
  const uniqueWeeks = Array.from(new Set(logs.map(l => l.semana))).sort((a, b) => b - a);

  return uniqueWeeks.map(wk => {
    const wLogs = logs.filter(l => l.semana === wk);
    const wVolumes = wLogs.reduce((acc, l) => acc + l.volumes, 0);
    const wHoursDir = wLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const wHoursInd = wLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const wHoursTot = wHoursDir + wHoursInd;
    const wVph = calculateVphNet(wVolumes, wHoursDir);

    const dates = wLogs.map(l => parseDateString(l.data)).filter((d): d is Date => d !== null);
    let rangeStr = 'Sem data';
    if (dates.length > 0) {
      const minD = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
      rangeStr = `${minD.toLocaleDateString('pt-PT')} a ${maxD.toLocaleDateString('pt-PT')}`;
    }

    return { week: wk, volumes: wVolumes, hours: wHoursTot, vph: wVph, range: rangeStr };
  });
}

/**
 * Computes Monthly Consolidation for all logs
 */
export function computeMonthlyConsolidation(logs: Log[]): MonthlyConsolidation[] {
  const uniqueYearMonths = Array.from(new Set(logs.map(l => {
    const d = parseDateString(l.data);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))).filter(Boolean).sort().reverse();

  return uniqueYearMonths.map(ym => {
    const [year, month] = ym.split('-');
    const mIdx = parseInt(month, 10) - 1;
    const mName = MONTH_NAMES_PT[mIdx] || `Mês ${month}`;

    const mLogs = logs.filter(l => {
      const d = parseDateString(l.data);
      return d ? d.getMonth() === mIdx && d.getFullYear() === parseInt(year, 10) : false;
    });

    const mVolumes = mLogs.reduce((acc, l) => acc + l.volumes, 0);
    const mHoursDir = mLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const mHoursInd = mLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const mHoursTot = mHoursDir + mHoursInd;
    const mVph = calculateVphNet(mVolumes, mHoursDir);

    return { monthYear: `${mName} ${year}`, volumes: mVolumes, hours: mHoursTot, vph: mVph };
  });
}
