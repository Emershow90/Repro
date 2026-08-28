import { useMemo, useState } from 'react';
import { Log } from '../types';
import { getWeekNumber } from '../utils/dateUtils';
import { deduplicateLogs, filterLogsByPeriod, getMonthYearKey, isLogMatchingSector, PeriodType, formatDateToPt } from '../utils/logUtils';

export function useLogFilters(logs: Log[], activeSectorId: string) {
  const [period, setPeriod] = useState<PeriodType>('todos');
  const [selectedDate, setSelectedDate] = useState(() => formatDateToPt(new Date()));
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekNumber(new Date()));
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getMonthYearKey(formatDateToPt(new Date())));

  const cleanLogs = useMemo(() => deduplicateLogs(logs), [logs]);
  const availableWeeks = useMemo(() => [...new Set(cleanLogs.map(log => Number(log.semana)))].sort((a, b) => b - a), [cleanLogs]);
  const availableMonths = useMemo(
    () => [...new Set(cleanLogs.map(log => getMonthYearKey(log.data)).filter(Boolean))].sort(),
    [cleanLogs],
  );
  const sectorLogs = useMemo(
    () => cleanLogs.filter(log => isLogMatchingSector(log.setor, activeSectorId, log.atividade)),
    [cleanLogs, activeSectorId],
  );
  const filtered = useMemo(
    () => filterLogsByPeriod(sectorLogs, period, selectedDate, selectedWeek, selectedMonthKey),
    [sectorLogs, period, selectedDate, selectedWeek, selectedMonthKey],
  );

  return {
    filtered, cleanLogs, availableWeeks, availableMonths,
    period, setPeriod, selectedDate, setSelectedDate, selectedWeek, setSelectedWeek, selectedMonthKey, setSelectedMonthKey,
    stats: { total: cleanLogs.length, filtered: filtered.length },
  };
}
