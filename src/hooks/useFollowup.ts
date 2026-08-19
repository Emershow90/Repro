/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { Log } from '../types';
import {
  computeActivitiesSummary,
  computeOperatorsSummary,
  computeWeeklyConsolidation,
  computeMonthlyConsolidation,
  calculateVphNet,
  calculateVphBruto,
  parseDateString
} from '../services/followupService';
import { isLogMatchingSector, deduplicateLogs } from '../utils/logUtils';

export function useFollowup(rawLogs: Log[], selectedWeekNum: number, activeSectorId: string = 'todos') {
  // Deduplicate logs first to avoid repetition
  const cleanLogs = useMemo(() => {
    return deduplicateLogs(rawLogs);
  }, [rawLogs]);

  // Filter logs by active sector (supporting 87 solo, 88_89_90 unified, or specific)
  const sectorLogs = useMemo(() => {
    return cleanLogs.filter(l => isLogMatchingSector(l.setor, activeSectorId, l.atividade));
  }, [cleanLogs, activeSectorId]);

  // Week logs
  const weekLogs = useMemo(() => {
    return sectorLogs.filter(l => l.semana === selectedWeekNum);
  }, [sectorLogs, selectedWeekNum]);

  // General KPIs for the selected week
  const kpis = useMemo(() => {
    const horasDiretas = weekLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const horasIndiretas = weekLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const totalVolumes = weekLogs.reduce((acc, l) => acc + l.volumes, 0);
    const totalHoras = horasDiretas + horasIndiretas;
    const vphNet = calculateVphNet(totalVolumes, horasDiretas);
    const vphBruto = calculateVphBruto(totalVolumes, totalHoras);

    return {
      horasDiretas,
      horasIndiretas,
      totalVolumes,
      totalHoras,
      vphNet,
      vphBruto,
      logCount: weekLogs.length
    };
  }, [weekLogs]);

  // Computed summaries
  const activitiesSummary = useMemo(() => computeActivitiesSummary(weekLogs), [weekLogs]);
  const operatorsSummary = useMemo(() => computeOperatorsSummary(weekLogs), [weekLogs]);
  const weeklyConsolidation = useMemo(() => computeWeeklyConsolidation(sectorLogs), [sectorLogs]);
  const monthlyConsolidation = useMemo(() => computeMonthlyConsolidation(sectorLogs), [sectorLogs]);

  // Week period text
  const weekPeriodStr = useMemo(() => {
    const dates = weekLogs.map(l => parseDateString(l.data)).filter((d): d is Date => d !== null);
    if (dates.length === 0) return 'Período Indefinido';
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    return `${minD.toLocaleDateString('pt-PT')} a ${maxD.toLocaleDateString('pt-PT')}`;
  }, [weekLogs]);

  return {
    cleanLogs,
    sectorLogs,
    weekLogs,
    kpis,
    activitiesSummary,
    operatorsSummary,
    weeklyConsolidation,
    monthlyConsolidation,
    weekPeriodStr
  };
}
