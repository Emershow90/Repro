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

export function useFollowup(logs: Log[], selectedWeekNum: number, activeSectorId: string = 'todos') {
  // Filter logs by active sector if specified
  const sectorLogs = useMemo(() => {
    if (activeSectorId === 'todos') return logs;
    return logs.filter(l => l.setor === activeSectorId);
  }, [logs, activeSectorId]);

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
    weekLogs,
    kpis,
    activitiesSummary,
    operatorsSummary,
    weeklyConsolidation,
    monthlyConsolidation,
    weekPeriodStr
  };
}
