/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { parseDateString } from './dateUtils';

export type PeriodType = 'diario' | 'semanal' | 'mensal' | 'todos';

/**
 * Normalizes any raw sector string or number into standard sector codes:
 * - '87', 'setor 87', 's87' -> '87'
 * - '88', 'setor 88', 's88' -> '88'
 * - '89', 'setor 89', 's89' -> '89'
 * - '90', 'setor 90', 's90' -> '90'
 * - '88_89_90', '88-90', '88, 89 e 90', 'unificados' -> '88_89_90'
 * - 'todos', 'all', '' -> 'todos'
 */
export function normalizeSectorId(raw: any): string {
  if (!raw && raw !== 0) return '87';
  const str = String(raw).trim().toLowerCase();

  if (str === 'todos' || str === 'all' || str === '') return 'todos';

  if (
    str.includes('88_89_90') ||
    str.includes('88-90') ||
    str.includes('88, 89') ||
    str.includes('88,89') ||
    str.includes('88 e 89') ||
    str.includes('88 a 90') ||
    str.includes('unificado')
  ) {
    return '88_89_90';
  }

  if (str.includes('88')) return '88';
  if (str.includes('89')) return '89';
  if (str.includes('90')) return '90';
  if (str.includes('87')) return '87';

  return str;
}

/**
 * Infers or extracts the proper sector code from a log object,
 * checking the explicit `setor` field first, then inspecting `atividade` if needed.
 */
export function inferSectorFromLog(log: { setor?: string; atividade?: string }): string {
  if (log.setor) {
    const norm = normalizeSectorId(log.setor);
    if (norm && norm !== 'todos') return norm;
  }
  if (log.atividade) {
    const ativ = log.atividade.toLowerCase();
    if (ativ.includes('88_89_90') || ativ.includes('88-90') || ativ.includes('88, 89')) return '88_89_90';
    if (ativ.includes('88') || ativ.includes('s88') || ativ.includes('setor 88')) return '88';
    if (ativ.includes('89') || ativ.includes('s89') || ativ.includes('setor 89')) return '89';
    if (ativ.includes('90') || ativ.includes('s90') || ativ.includes('setor 90')) return '90';
    if (ativ.includes('87') || ativ.includes('s87') || ativ.includes('setor 87')) return '87';
  }
  return '87';
}

/**
 * Deduplicates an array of logs to prevent repeated data.
 * Considers both ID and deep signature (data + colaborador + atividade + horas + volumes + setor).
 */
export function deduplicateLogs(logs: Log[]): Log[] {
  if (!logs || logs.length === 0) return [];

  const seenIds = new Set<number>();
  const seenSignatures = new Map<string, Log>();

  // Process logs in timestamp descending order
  const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);

  for (const log of sorted) {
    if (!log) continue;

    // Normalization
    const dataNorm = (log.data || '').trim();
    const colabNorm = (log.colaborador || '').toUpperCase().trim();
    const ativNorm = (log.atividade || '').trim().toUpperCase();
    const setorNorm = inferSectorFromLog(log);
    const volNorm = log.volumes || 0;
    const hrsNorm = Number(log.horas || 0).toFixed(2);
    const tipoNorm = log.tipo || 'direta';
    const hIniNorm = (log.horaInicio || '').trim();
    const hFimNorm = (log.horaFim || '').trim();
    const ruaNorm = (log.rua || '').trim().toUpperCase();

    // Composite signature for deduplication
    const signature = `${dataNorm}|${colabNorm}|${ativNorm}|${setorNorm}|${volNorm}|${hrsNorm}|${tipoNorm}|${hIniNorm}|${hFimNorm}|${ruaNorm}`;

    if (log.id && seenIds.has(log.id)) {
      continue; // Skip duplicate ID
    }

    if (seenSignatures.has(signature)) {
      const existing = seenSignatures.get(signature)!;
      // If the current one is synced and existing isn't, prefer synced
      if (log.synced && !existing.synced) {
        seenSignatures.set(signature, log);
      }
      continue;
    }

    if (log.id) {
      seenIds.add(log.id);
    }
    seenSignatures.set(signature, log);
  }

  return Array.from(seenSignatures.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Checks if a log matches the selected sector filter.
 * Supports:
 * - 'todos': All sectors (87, 88, 89, 90)
 * - '87': Setor 87 Solo
 * - '88_89_90' / '88-90' / 'unificados': Setores 88, 89 e 90 Unificados (matches 88, 89, 90, or composite 88_89_90)
 * - '88', '89', '90': Individual sectors
 */
export function isLogMatchingSector(
  logSector: string | undefined, 
  filterSectorId: string, 
  logAtividade?: string
): boolean {
  if (!filterSectorId || filterSectorId === 'todos') {
    return true;
  }

  const normFilter = normalizeSectorId(filterSectorId);
  if (normFilter === 'todos') {
    return true;
  }

  const normLog = inferSectorFromLog({ setor: logSector, atividade: logAtividade });

  if (normFilter === '87') {
    return normLog === '87';
  }

  if (normFilter === '88_89_90') {
    // Unifies sectors 88, 89, 90 and composite tag
    return normLog === '88' || normLog === '89' || normLog === '90' || normLog === '88_89_90';
  }

  if (normFilter === '88') {
    return normLog === '88' || normLog === '88_89_90';
  }
  if (normFilter === '89') {
    return normLog === '89' || normLog === '88_89_90';
  }
  if (normFilter === '90') {
    return normLog === '90' || normLog === '88_89_90';
  }

  return normLog === normFilter;
}

/**
 * Extracts MM/YYYY key from date string (supports DD/MM/YYYY or YYYY-MM-DD)
 */
export function getMonthYearKey(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDateString(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${y}`;
}

/**
 * Formats a Date object to DD/MM/YYYY
 */
export function formatDateToPt(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Filters logs by time period: Diário, Semanal, Mensal or Todos.
 */
export function filterLogsByPeriod(
  logs: Log[],
  period: PeriodType,
  targetDateStr?: string,
  targetWeek?: number,
  targetMonthKey?: string
): Log[] {
  if (!logs || logs.length === 0) return [];
  if (period === 'todos') return logs;

  if (period === 'diario') {
    if (!targetDateStr) return logs;
    return logs.filter(l => {
      if (!l.data) return false;
      return l.data.trim() === targetDateStr.trim();
    });
  }

  if (period === 'semanal') {
    if (targetWeek === undefined || targetWeek === null) return logs;
    return logs.filter(l => l.semana === targetWeek);
  }

  if (period === 'mensal') {
    if (!targetMonthKey) return logs;
    return logs.filter(l => {
      const myKey = getMonthYearKey(l.data);
      return myKey === targetMonthKey;
    });
  }

  return logs;
}
