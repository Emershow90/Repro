/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { 
  Calendar, 
  Layers, 
  BarChart2, 
  Globe, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Filter, 
  Sun,
  CalendarDays,
  Sparkles
} from 'lucide-react';
import { PeriodType, formatDateToPt } from '../utils/logUtils';
import { SECTOR_OPTIONS } from '../stores/sectorStore';
import { getWeekNumber, parseDateString } from '../utils/dateUtils';

interface TemporalFilterBarProps {
  activeSectorId: string;
  onSectorChange: (sector: string) => void;
  period: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  selectedMonthKey: string;
  onMonthChange: (monthKey: string) => void;
  availableWeeks: number[];
  availableMonths: string[];
  totalLogsCount: number;
  filteredLogsCount: number;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function TemporalFilterBar({
  activeSectorId,
  onSectorChange,
  period,
  onPeriodChange,
  selectedDate,
  onDateChange,
  selectedWeek,
  onWeekChange,
  selectedMonthKey,
  onMonthChange,
  availableWeeks,
  availableMonths,
  totalLogsCount,
  filteredLogsCount
}: TemporalFilterBarProps) {
  
  // Date navigation helpers
  const handlePrevDay = () => {
    const d = parseDateString(selectedDate) || new Date();
    d.setDate(d.getDate() - 1);
    onDateChange(formatDateToPt(d));
  };

  const handleNextDay = () => {
    const d = parseDateString(selectedDate) || new Date();
    d.setDate(d.getDate() + 1);
    onDateChange(formatDateToPt(d));
  };

  const handleSetToday = () => {
    onDateChange(formatDateToPt(new Date()));
  };

  // Week navigation helpers
  const handlePrevWeek = () => {
    const newWeek = Math.max(1, selectedWeek - 1);
    onWeekChange(newWeek);
  };

  const handleNextWeek = () => {
    const newWeek = Math.min(53, selectedWeek + 1);
    onWeekChange(newWeek);
  };

  const handleSetCurrentWeek = () => {
    onWeekChange(getWeekNumber(new Date()));
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [mStr, yStr] = (selectedMonthKey || '01/2026').split('/');
    let m = parseInt(mStr, 10);
    let y = parseInt(yStr, 10);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const newKey = `${String(m).padStart(2, '0')}/${y}`;
    onMonthChange(newKey);
  };

  const handleNextMonth = () => {
    const [mStr, yStr] = (selectedMonthKey || '01/2026').split('/');
    let m = parseInt(mStr, 10);
    let y = parseInt(yStr, 10);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const newKey = `${String(m).padStart(2, '0')}/${y}`;
    onMonthChange(newKey);
  };

  const handleSetCurrentMonth = () => {
    const now = new Date();
    const newKey = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    onMonthChange(newKey);
  };

  // Label formatting for Month
  const formatMonthLabel = (mKey: string) => {
    if (!mKey) return 'Mês Atual';
    const [mStr, yStr] = mKey.split('/');
    const mNum = parseInt(mStr, 10);
    const mName = MONTH_NAMES[mNum - 1] || mStr;
    return `${mName} de ${yStr}`;
  };

  const currentSectorLabel = useMemo(() => {
    const opt = SECTOR_OPTIONS.find(o => o.id === activeSectorId);
    return opt ? opt.label : `Setor ${activeSectorId}`;
  }, [activeSectorId]);

  return (
    <section className="border-panel p-4 md:p-5 rounded-2xl relative overflow-hidden bg-black/40 backdrop-blur-md border border-white/10 space-y-4">
      {/* Top Header line of filter bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Filter size={14} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Controlo Operacional & Filtros</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </h2>
            <p className="text-[0.6rem] text-slate-400 font-mono mt-0.5">
              Setor 87 Solo • Setores 88, 89 e 90 Unificados • Visão Diária, Semanal e Mensal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className="text-[0.62rem] text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-bold">
            <strong className="text-emerald-400">{filteredLogsCount}</strong> de {totalLogsCount} registos
          </span>
        </div>
      </div>

      {/* Grid: 1. Sector Selection & 2. Temporal View Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        
        {/* SETOR SELECTOR (5 cols on lg) */}
        <div className="lg:col-span-6 space-y-1.5">
          <div className="flex justify-between items-center text-[0.6rem] font-mono">
            <span className="uppercase text-slate-400 font-bold tracking-wider flex items-center gap-1.5">
              <Layers size={11} className="text-emerald-400" />
              <span>Foco Setorial</span>
            </span>
            <span className="text-emerald-400 font-bold">{currentSectorLabel}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SECTOR_OPTIONS.map(opt => {
              const isActive = activeSectorId === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onSectorChange(opt.id)}
                  className={`py-2 px-2 text-[0.62rem] font-mono font-bold uppercase rounded-xl border transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 ${
                    isActive
                      ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md shadow-emerald-500/20 scale-[1.02]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-emerald-500/30 hover:text-white hover:bg-white/10'
                  }`}
                  title={opt.description}
                >
                  <span>{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PERIOD SELECTOR (6 cols on lg) */}
        <div className="lg:col-span-6 space-y-1.5">
          <div className="flex justify-between items-center text-[0.6rem] font-mono">
            <span className="uppercase text-slate-400 font-bold tracking-wider flex items-center gap-1.5">
              <Clock size={11} className="text-emerald-400" />
              <span>Visão Temporal</span>
            </span>
            <span className="text-emerald-400 font-bold uppercase">
              {period === 'diario' ? 'Diário' : period === 'semanal' ? 'Semanal' : period === 'mensal' ? 'Mensal' : 'Todos os Períodos'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 font-mono">
            <button
              onClick={() => onPeriodChange('diario')}
              className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                period === 'diario'
                  ? 'bg-emerald-500 text-black font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sun size={11} />
              <span>Diário</span>
            </button>

            <button
              onClick={() => onPeriodChange('semanal')}
              className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                period === 'semanal'
                  ? 'bg-emerald-500 text-black font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart2 size={11} />
              <span>Semanal</span>
            </button>

            <button
              onClick={() => onPeriodChange('mensal')}
              className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                period === 'mensal'
                  ? 'bg-emerald-500 text-black font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarDays size={11} />
              <span>Mensal</span>
            </button>

            <button
              onClick={() => onPeriodChange('todos')}
              className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                period === 'todos'
                  ? 'bg-emerald-500 text-black font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe size={11} />
              <span>Todos</span>
            </button>
          </div>
        </div>

      </div>

      {/* Sub-bar: Dynamic Navigator based on selected period */}
      {period !== 'todos' && (
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 font-mono">
          
          {/* DIÁRIO NAVIGATOR */}
          {period === 'diario' && (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevDay}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Dia Anterior"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-2 bg-black/60 border border-white/10 px-3 py-1.5 rounded-xl">
                  <Calendar size={13} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white tracking-wider">
                    {selectedDate || formatDateToPt(new Date())}
                  </span>
                </div>

                <button
                  onClick={handleNextDay}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Próximo Dia"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={(() => {
                    const d = parseDateString(selectedDate);
                    if (!d) return '';
                    return d.toISOString().slice(0, 10);
                  })()}
                  onChange={(e) => {
                    if (e.target.value) {
                      const parts = e.target.value.split('-');
                      if (parts.length === 3) {
                        onDateChange(`${parts[2]}/${parts[1]}/${parts[0]}`);
                      }
                    }
                  }}
                  className="bg-black/50 border border-white/10 text-white text-[0.68rem] px-2 py-1 rounded-lg focus:outline-none focus:border-emerald-500"
                />

                <button
                  onClick={handleSetToday}
                  className="text-[0.62rem] font-bold uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  Hoje
                </button>
              </div>
            </div>
          )}

          {/* SEMANAL NAVIGATOR */}
          {period === 'semanal' && (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevWeek}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Semana Anterior"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-2 bg-black/60 border border-white/10 px-3 py-1.5 rounded-xl">
                  <BarChart2 size={13} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white tracking-wider">
                    Semana {selectedWeek}
                  </span>
                </div>

                <button
                  onClick={handleNextWeek}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Próxima Semana"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedWeek}
                  onChange={(e) => onWeekChange(parseInt(e.target.value, 10))}
                  className="bg-black/50 border border-white/10 text-white text-[0.68rem] px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                >
                  {availableWeeks.length > 0 ? (
                    availableWeeks.map(wk => (
                      <option key={wk} value={wk} className="bg-slate-900 text-white">
                        Semana {wk}
                      </option>
                    ))
                  ) : (
                    <option value={getWeekNumber(new Date())} className="bg-slate-900 text-white">
                      Semana Atual ({getWeekNumber(new Date())})
                    </option>
                  )}
                </select>

                <button
                  onClick={handleSetCurrentWeek}
                  className="text-[0.62rem] font-bold uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  Semana Atual
                </button>
              </div>
            </div>
          )}

          {/* MENSAL NAVIGATOR */}
          {period === 'mensal' && (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Mês Anterior"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-2 bg-black/60 border border-white/10 px-3 py-1.5 rounded-xl">
                  <CalendarDays size={13} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white tracking-wider">
                    {formatMonthLabel(selectedMonthKey)}
                  </span>
                </div>

                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-all"
                  title="Próximo Mês"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedMonthKey}
                  onChange={(e) => onMonthChange(e.target.value)}
                  className="bg-black/50 border border-white/10 text-white text-[0.68rem] px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                >
                  {availableMonths.length > 0 ? (
                    availableMonths.map(mKey => (
                      <option key={mKey} value={mKey} className="bg-slate-900 text-white">
                        {formatMonthLabel(mKey)}
                      </option>
                    ))
                  ) : (
                    <option value={selectedMonthKey} className="bg-slate-900 text-white">
                      {formatMonthLabel(selectedMonthKey)}
                    </option>
                  )}
                </select>

                <button
                  onClick={handleSetCurrentMonth}
                  className="text-[0.62rem] font-bold uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  Mês Atual
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </section>
  );
}
