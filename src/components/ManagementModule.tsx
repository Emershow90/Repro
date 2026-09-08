/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Refactored Management Module
 * Centralized sync orchestration, unified reporting, and improved UI/UX
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Log, 
  ReproDemand, 
  ActiveSession, 
  OperationalEvent, 
  StreetSummary,
  SyncEventPayload 
} from '../types';
import { 
  FileSpreadsheet, 
  Layers, 
  TrendingUp, 
  Clock, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Download, 
  Filter, 
  Search, 
  Activity, 
  ShieldCheck, 
  RotateCw,
  ExternalLink,
  ChevronRight,
  Database,
  MapPin,
  Flame,
  Award,
  CheckCheck,
  Moon,
  Wifi,
  WifiOff,
  Laptop,
  Smartphone,
  Radio,
  Globe,
  Tv,
  Code,
  Copy,
  Check,
  Zap,
  BarChart3
} from 'lucide-react';
import { 
  formatDateToBR, 
  parseDateString, 
  getDayOfWeekName, 
  getWeekNumber 
} from '../utils/dateUtils';
import { 
  SECTOR_87_STREETS, 
  SECTOR_88_STREETS, 
  SECTOR_89_STREETS, 
  SECTOR_90_STREETS, 
  ALL_CONFIGURED_STREETS,
  inferSectorFromStreet 
} from '../data/streetData';
import { getState, saveState, getOperationalSyncQueue, clearOperationalSyncQueue } from '../dbLocal';
import { 
  orchestrateSyncToSheets, 
  initializeAutoSync, 
  stopAutoSync,
  getLastSyncMetrics,
  triggerManualSync,
  SyncMetrics 
} from '../utils/syncOrchestrator';
import DiagnosticsTelemetryView from './DiagnosticsTelemetryView';
import OdbcQueryBridge from './OdbcQueryBridge';
import SupabaseConfigModule from './SupabaseConfigModule';
import HelpSupportModal from './HelpSupportModal';
import ProductivityFollowup from './ProductivityFollowup';
import { calculateProductivityMetrics } from '../productivityHelper';
import { useUIStore } from '../stores/uiStore';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';

interface ManagementModuleProps {
  logs: Log[];
  activeSectorId: string;
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
  onAddToast: (msg: string, color?: string) => void;
  lastSyncTimestamp?: string;
  isSyncing?: boolean;
  onTriggerSync?: () => Promise<void>;
  networkStatus?: 'online' | 'offline';
}

const STORAGE_DEMANDS_KEY = 'repro_demands_v5';
const STORAGE_ACTIVE_SESSION_KEY = 'repro_active_session_organism_v5';
const STORAGE_EVENTS_KEY = 'repro_operational_events_v5';

export default function ManagementModule({
  logs,
  activeSectorId,
  apiUrl,
  onApiUrlChange,
  onAddToast,
  lastSyncTimestamp: externalLastSync,
  isSyncing: externalIsSyncing,
  onTriggerSync,
  networkStatus = 'online'
}: ManagementModuleProps) {
  // Filtros
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [selectedSector, setSelectedSector] = useState<string>('TODOS');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeSubView, setActiveSubView] = useState<'resumo' | 'eventos' | 'odbc' | 'repro' | 'sheets' | 'externo' | 'diagnostico' | 'supabase' | 'followup' | 'relatorios'>('resumo');

  const {
    screensaverEnabled,
    screensaverTimeout,
    updateScreensaverEnabled,
    updateScreensaverTimeout
  } = useUIStore();

  // Estados locais recuperados do IndexedDB
  const [demands, setDemands] = useState<Record<string, ReproDemand>>({});
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [eventsList, setEventsList] = useState<OperationalEvent[]>([]);
  const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);

  // Sincronização - Refatorada com orquestrador centralizado
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [internalLastSync, setInternalLastSync] = useState<string | null>(null);
  const [syncMetrics, setSyncMetrics] = useState<SyncMetrics | null>(null);
  const [syncProgressMsg, setSyncProgressMsg] = useState<string>('');
  const lastSyncTimestamp = externalLastSync || internalLastSync;
  const isCurrentlySyncing = Boolean(externalIsSyncing || isSyncingSheets);

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpModalTab, setHelpModalTab] = useState<'manual' | 'sheets' | 'tv' | 'sql'>('sheets');

  // Carregar dados locais do IndexedDB
  const loadLocalData = useCallback(async () => {
    try {
      const [savedDemands, savedSession, savedEvents, queue, metrics] = await Promise.all([
        getState<Record<string, ReproDemand>>(STORAGE_DEMANDS_KEY),
        getState<ActiveSession>(STORAGE_ACTIVE_SESSION_KEY),
        getState<OperationalEvent[]>(STORAGE_EVENTS_KEY),
        getOperationalSyncQueue(),
        getLastSyncMetrics()
      ]);

      if (savedDemands) setDemands(savedDemands);
      if (savedSession) setActiveSession(savedSession);
      if (savedEvents) setEventsList(savedEvents);
      if (queue) setSyncQueueItems(queue);
      if (metrics) setSyncMetrics(metrics);
    } catch (err) {
      console.warn('Erro ao carregar dados do IndexedDB no Painel de Gestão', err);
    }
  }, []);

  // Supabase Realtime Hook integration
  const { payloads, isConnected } = useSupabaseRealtime('operational_events');

  useEffect(() => {
    if (payloads.length > 0) {
      const latest = payloads[payloads.length - 1];
      onAddToast(`📡 Evento em tempo real recebido!`, 'var(--color-info)');
      loadLocalData();
    }
  }, [payloads, onAddToast, loadLocalData]);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    onAddToast('Copiado para a área de transferência!', 'var(--color-success)');
    setTimeout(() => setCopiedType(null), 3000);
  };

  useEffect(() => {
    loadLocalData();
    const interval = setInterval(loadLocalData, 3000);
    return () => clearInterval(interval);
  }, [loadLocalData]);

  // Initialize centralized auto-sync when component mounts
  useEffect(() => {
    if (apiUrl && networkStatus === 'online') {
      initializeAutoSync({
        apiUrl,
        logs,
        streetSummaries: streetSummaries || [],
        demands,
        events: eventsList
      });

      return () => stopAutoSync();
    }
  }, [apiUrl, networkStatus, logs, demands, eventsList]);

  // Lista de ruas do setor filtrado
  const filteredStreets = useMemo(() => {
    let list = ALL_CONFIGURED_STREETS;
    if (selectedSector === '87') list = SECTOR_87_STREETS;
    else if (selectedSector === '88') list = SECTOR_88_STREETS;
    else if (selectedSector === '89') list = SECTOR_89_STREETS;
    else if (selectedSector === '90') list = SECTOR_90_STREETS;

    if (searchFilter.trim()) {
      const q = searchFilter.trim().toUpperCase();
      list = list.filter(r => r.includes(q));
    }
    return list;
  }, [selectedSector, searchFilter]);

  // Realizado consolidado do dia selecionado a partir dos Logs
  const targetDateBR = useMemo(() => {
    const p = parseDateString(selectedDate) || new Date();
    return formatDateToBR(p);
  }, [selectedDate]);

  // Resumo analítico calculado por rua
  const streetSummaries: StreetSummary[] = useMemo(() => {
    return filteredStreets.map(rua => {
      const setor = inferSectorFromStreet(rua);
      const demandKey = `${selectedDate}_${setor}_${rua}`;
      const demandObj = demands[demandKey];

      const demanda = demandObj && demandObj.demandaCalculada > 0 ? demandObj.demandaCalculada : null;
      const unidade = demandObj ? demandObj.unidade : null;

      const streetLogs = logs.filter(l => {
        const act = (l.atividade || '').toUpperCase();
        const r = (l.rua || act.replace(/REABASTECIMENTO\s*-\s*/i, '')).trim().toUpperCase();
        return l.data === targetDateBR && r === rua;
      });

      const totalVolumesLogs = streetLogs.reduce((acc, l) => acc + (Number(l.volumes) || 0), 0);
      const totalEnderecosLogs = streetLogs.reduce((acc, l) => acc + (Number(l.enderecos) || 0), 0);
      const totalHorasLogs = streetLogs.reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

      const isLiveNow = activeSession && activeSession.rua === rua && activeSession.data === selectedDate;
      const liveVolumes = isLiveNow ? (activeSession.volumes || 0) : 0;
      const liveEnderecos = isLiveNow ? (activeSession.enderecos || 0) : 0;
      const liveSecs = isLiveNow ? (activeSession.cronometro?.tempoAcumuladoMs || 0) / 1000 : 0;

      const realizado = totalVolumesLogs + liveVolumes;
      const enderecos = totalEnderecosLogs + liveEnderecos;
      const tempoTotalSegundos = (totalHorasLogs * 3600) + liveSecs;
      const totalHorasCalculadas = tempoTotalSegundos / 3600;

      const pendente = (demanda !== null) ? Math.max(0, demanda - realizado) : null;
      const excedente = (demanda !== null) ? Math.max(0, realizado - demanda) : 0;
      const coberturaPercent = (demanda !== null && demanda > 0)
        ? Number(((realizado / demanda) * 100).toFixed(1))
        : null;

      const eph = totalHorasCalculadas > 0 ? (enderecos / totalHorasCalculadas).toFixed(1) : '0.0';
      const vph = totalHorasCalculadas > 0 ? (realizado / totalHorasCalculadas).toFixed(1) : '0.0';

      let status: StreetSummary['status'] = 'NAO_INICIADA';
      if (isLiveNow) {
        status = 'EM_ANDAMENTO';
      } else if (demanda !== null && realizado >= demanda) {
        status = excedente > 0 ? 'EXCEDENTE' : 'ATENDIDA';
      } else if (realizado > 0) {
        status = 'EM_ANDAMENTO';
      }

      return {
        rua,
        setor,
        demanda,
        unidade,
        realizado,
        pendente,
        coberturaPercent,
        excedente,
        enderecos,
        tempoTotalSegundos,
        eph,
        vph,
        status
      };
    });
  }, [filteredStreets, selectedDate, demands, logs, targetDateBR, activeSession]);

  // Totais Gerais do Dashboard
  const totals = useMemo(() => {
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
    const saldoPendenteGlobal = Math.max(0, totalDemanda - totalRealizado);

    return {
      totalDemanda,
      totalRealizado,
      totalEnderecos,
      ephGlobal,
      vphGlobal,
      coberturaGlobal,
      saldoPendenteGlobal,
      ruasAtendidas,
      totalRuas: streetSummaries.length
    };
  }, [streetSummaries]);

  // Sincronização com o Google Sheets - REFATORADA com orquestrador centralizado
  const handleSyncToSheets = async () => {
    if (!apiUrl || !apiUrl.startsWith('http')) {
      onAddToast('Configure a URL da API do Google Sheets nas opções.', 'var(--color-danger)');
      return;
    }

    setIsSyncingSheets(true);
    setSyncProgressMsg('');

    try {
      const metrics = await triggerManualSync(
        {
          apiUrl,
          date: selectedDate,
          logs,
          streetSummaries,
          demands,
          events: eventsList,
          onProgress: (msg: string) => {
            setSyncProgressMsg(msg);
            console.log(msg);
          }
        },
        3 // maxRetries
      );

      setSyncMetrics(metrics);
      setInternalLastSync(metrics.lastSyncTimestamp);
      onAddToast(`✨ Sincronização concluída! ${metrics.syncDurationMs}ms`, 'var(--color-success)');
      
    } catch (err: any) {
      console.error('Erro na sincronização centralizada:', err);
      onAddToast(`Erro ao sincronizar: ${err.message}`, 'var(--color-danger)');
    } finally {
      setIsSyncingSheets(false);
      setSyncProgressMsg('');
    }
  };

  return (
    <div className="w-full space-y-5 font-mono text-slate-200">
      
      {/* 1. BARRA SUPERIOR - REFATORADA COM INDICADORES DE SINCRONIZAÇÃO */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-wider">
              Painel de Gestão & Consolidação REPRO
            </h1>
            <p className="text-[0.68rem] text-slate-400">
              Sincronização centralizada: Sheets + Supabase + Relatórios Unificados
            </p>
          </div>
        </div>

        {/* Filtros de Data e Setor */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Data */}
          <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-white/15">
            <Clock size={13} className="text-emerald-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
            />
          </div>

          {/* Setores */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-white/15">
            {['TODOS', '87', '88', '89', '90'].map(sec => (
              <button
                key={sec}
                type="button"
                onClick={() => setSelectedSector(sec)}
                className={`px-2.5 py-1 text-[0.65rem] font-black rounded-lg transition-all cursor-pointer ${
                  selectedSector === sec
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          {/* Indicador de Sincronização */}
          {syncMetrics && (
            <div className="text-[0.65rem] font-bold text-slate-400 px-2 py-1 rounded-lg bg-slate-900/50 border border-white/10">
              <span className="text-emerald-400">✓ {syncMetrics.lastSyncTimestamp}</span>
            </div>
          )}

          {/* Botão Sincronizar com Planilha - REFATORADO */}
          <button
            type="button"
            onClick={handleSyncToSheets}
            disabled={isSyncingSheets}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 disabled:opacity-50 text-black text-xs font-black uppercase rounded-xl border border-emerald-300 shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={isSyncingSheets ? 'animate-spin' : ''} />
            <span>{isSyncingSheets ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
          </button>
        </div>
      </div>

      {/* Mensagem de Progresso de Sincronização */}
      {syncProgressMsg && (
        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-300 text-xs animate-pulse">
          {syncProgressMsg}
        </div>
      )}

      {/* 2. CARDS DE INDICADORES GLOBAIS - PADRONIZADOS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Demanda Total */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-1">
          <span className="text-[0.62rem] text-slate-400 uppercase font-bold block">Demanda REPRO</span>
          <div className="text-xl font-black text-white">{totals.totalDemanda} <span className="text-xs text-slate-400 font-normal">vol/cx</span></div>
          <span className="text-[0.58rem] text-slate-500 block">Total planejado para o dia</span>
        </div>

        {/* Realizado Total */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-cyan-500/30 shadow-sm space-y-1">
          <span className="text-[0.62rem] text-cyan-400 uppercase font-bold block">Realizado Físico</span>
          <div className="text-xl font-black text-cyan-300">{totals.totalRealizado} <span className="text-xs text-cyan-500 font-normal">vol/cx</span></div>
          <span className="text-[0.58rem] text-slate-500 block">{totals.totalEnderecos} endereços atendidos</span>
        </div>

        {/* Saldo Pendente */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 shadow-sm space-y-1">
          <span className="text-[0.62rem] text-amber-400 uppercase font-bold block">Saldo Pendente</span>
          <div className="text-xl font-black text-amber-300">{totals.saldoPendenteGlobal} <span className="text-xs text-amber-500 font-normal">vol/cx</span></div>
          <span className="text-[0.58rem] text-slate-500 block">Restante para cobrir o plano</span>
        </div>

        {/* Cobertura Global */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 shadow-sm space-y-1">
          <span className="text-[0.62rem] text-emerald-400 uppercase font-bold block">Cobertura Geral</span>
          <div className="text-xl font-black text-emerald-300">{totals.coberturaGlobal}%</div>
          <span className="text-[0.58rem] text-slate-500 block">{totals.ruasAtendidas} de {totals.totalRuas} ruas atendidas</span>
        </div>

        {/* Ritmo Médio (EPH / VPH) */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-purple-500/30 shadow-sm space-y-1 col-span-2 md:col-span-1">
          <span className="text-[0.62rem] text-purple-400 uppercase font-bold block">Produtividade Média</span>
          <div className="text-lg font-black text-purple-300">
            {totals.ephGlobal} <span className="text-xs font-normal text-slate-400">EPH</span> • {totals.vphGlobal} <span className="text-xs font-normal text-slate-400">VPH</span>
          </div>
          <span className="text-[0.58rem] text-slate-500 block">Ritmo consolidado de campo</span>
        </div>
      </div>

      {/* 3. NAVEGAÇÃO DE SUB-VISÕES - COM NOVA ABA DE RELATÓRIOS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubView('resumo')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'resumo'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Activity size={14} />
          <span>Resumo por Rua</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('relatorios')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'relatorios'
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BarChart3 size={14} />
          <span>Relatórios Consolidados</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('eventos')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'eventos'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RotateCw size={14} />
          <span>Trilha de Eventos ({syncQueueItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('odbc')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'odbc'
              ? 'bg-purple-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Database size={14} />
          <span>ODBC & Auditoria</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('sheets')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'sheets'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet size={14} />
          <span>Sheets Config</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('diagnostico')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeSubView === 'diagnostico'
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Zap size={14} />
          <span>Diagnóstico</span>
        </button>
      </div>

      {/* 4. RESUMO POR RUA */}
      {activeSubView === 'resumo' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-white/10 max-w-sm">
            <Search size={14} className="text-slate-400 ml-1" />
            <input
              type="text"
              placeholder="Buscar rua (ex: B4VD)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full uppercase font-mono font-bold"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950 shadow-md">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[0.62rem] border-b border-white/10">
                <tr>
                  <th className="py-3 px-3">Setor</th>
                  <th className="py-3 px-3">Rua</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Demanda</th>
                  <th className="py-3 px-3 text-right">Realizado</th>
                  <th className="py-3 px-3 text-right">Pendente</th>
                  <th className="py-3 px-3 text-right">Cobertura</th>
                  <th className="py-3 px-3 text-right">EPH</th>
                  <th className="py-3 px-3 text-right">VPH</th>
                  <th className="py-3 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {streetSummaries.map((s) => {
                  const isLive = activeSession && activeSession.rua === s.rua;
                  return (
                    <tr key={s.rua} className={`hover:bg-slate-900/60 transition-colors ${isLive ? 'bg-emerald-500/5' : ''}`}>
                      <td className="py-2.5 px-3 font-bold text-slate-400">
                        Setor {s.setor}
                      </td>

                      <td className="py-2.5 px-3 font-black text-white flex items-center gap-1.5">
                        <MapPin size={12} className={isLive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
                        <span>{s.rua}</span>
                        {isLive && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[0.55rem] font-bold animate-pulse">
                            AO VIVO
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {s.status === 'ATENDIDA' && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[0.6rem] font-bold">
                            Atendida
                          </span>
                        )}
                        {s.status === 'EXCEDENTE' && (
                          <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[0.6rem] font-bold">
                            +{s.excedente} Excedente
                          </span>
                        )}
                        {s.status === 'EM_ANDAMENTO' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.6rem] font-bold">
                            Em Andamento
                          </span>
                        )}
                        {s.status === 'NAO_INICIADA' && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-white/10 text-[0.6rem]">
                            Não Iniciada
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                        {s.demanda !== null ? `${s.demanda} ${s.unidade === 'CAIXAS' ? 'cx' : 'vol'}` : <span className="text-slate-500">Não def.</span>}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-cyan-300">
                        {s.realizado} {s.unidade === 'CAIXAS' ? 'cx' : 'vol'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                        {s.pendente !== null ? `${s.pendente}` : '---'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black">
                        {s.coberturaPercent !== null ? (
                          <span className={s.coberturaPercent >= 100 ? 'text-emerald-400' : 'text-amber-400'}>
                            {s.coberturaPercent}%
                          </span>
                        ) : '---'}
                      </td>

                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                        {s.eph}
                      </td>

                      <td className="py-2.5 px-3 text-right text-cyan-400 font-bold">
                        {s.vph}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={async () => {
                            const currentVal = s.demanda !== null ? String(s.demanda) : '';
                            const valStr = prompt(`Definir Demanda REPRO para a Rua ${s.rua} (Setor ${s.setor}):`, currentVal);
                            if (valStr !== null) {
                              const num = parseFloat(valStr.replace(',', '.'));
                              if (!isNaN(num) && num >= 0) {
                                const key = `${selectedDate}_${s.setor}_${s.rua}`;
                                const updated = {
                                  ...demands,
                                  [key]: {
                                    id: `dem_${Date.now()}`,
                                    data: selectedDate,
                                    setor: s.setor,
                                    rua: s.rua,
                                    demandaCalculada: num,
                                    unidade: s.unidade || 'CAIXAS'
                                  }
                                };
                                setDemands(updated);
                                await saveState(STORAGE_DEMANDS_KEY, updated);
                                localStorage.setItem(STORAGE_DEMANDS_KEY, JSON.stringify(updated));
                                onAddToast(`Demanda de ${num} salva para ${s.rua}!`, 'var(--color-success)');
                              }
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[0.6rem] font-bold uppercase transition-all cursor-pointer"
                        >
                          {s.demanda !== null ? 'Editar' : '+ Demanda'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. NOVA ABA: RELATÓRIOS CONSOLIDADOS */}
      {activeSubView === 'relatorios' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950 to-slate-950 border border-blue-500/30 shadow-md space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-400" />
              <h2 className="text-sm font-black text-white uppercase">Relatórios Consolidados do Dia</h2>
            </div>
            
            <p className="text-xs text-slate-300">
              Visualize relatórios unificados calculados a partir dos dados consolidados no banco local. 
              Estes dados são enviados para o Google Sheets na próxima sincronização.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/10">
              {/* Card Diário */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-emerald-500/30 space-y-2">
                <h3 className="text-xs font-black text-emerald-400 uppercase">Relatório Diário</h3>
                <div className="space-y-1 text-[0.7rem]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data:</span>
                    <span className="text-white font-bold">{targetDateBR}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Demanda Total:</span>
                    <span className="text-white font-bold">{totals.totalDemanda} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Realizado:</span>
                    <span className="text-cyan-300 font-bold">{totals.totalRealizado} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cobertura:</span>
                    <span className="text-emerald-300 font-bold">{totals.coberturaGlobal}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Produtividade:</span>
                    <span className="text-purple-300 font-bold">{totals.vphGlobal} VPH</span>
                  </div>
                </div>
              </div>

              {/* Card Semanal (Acumulado) */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-blue-500/30 space-y-2">
                <h3 className="text-xs font-black text-blue-400 uppercase">Relatório Semanal</h3>
                <div className="space-y-1 text-[0.7rem]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Semana:</span>
                    <span className="text-white font-bold">{getWeekNumber(targetDateBR)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Demanda Total:</span>
                    <span className="text-white font-bold">{totals.totalDemanda} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Realizado:</span>
                    <span className="text-cyan-300 font-bold">{totals.totalRealizado} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ruas Atendidas:</span>
                    <span className="text-emerald-300 font-bold">{totals.ruasAtendidas}/{totals.totalRuas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">EPH Média:</span>
                    <span className="text-purple-300 font-bold">{totals.ephGlobal}</span>
                  </div>
                </div>
              </div>

              {/* Card Mensal (Acumulado) */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-amber-500/30 space-y-2">
                <h3 className="text-xs font-black text-amber-400 uppercase">Relatório Mensal</h3>
                <div className="space-y-1 text-[0.7rem]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mês/Ano:</span>
                    <span className="text-white font-bold">
                      {new Date(selectedDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Demanda Total:</span>
                    <span className="text-white font-bold">{totals.totalDemanda} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Realizado:</span>
                    <span className="text-cyan-300 font-bold">{totals.totalRealizado} vol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Endereços:</span>
                    <span className="text-blue-300 font-bold">{totals.totalEnderecos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Saldo Pendente:</span>
                    <span className="text-amber-300 font-bold">{totals.saldoPendenteGlobal} vol</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 text-xs text-slate-300 space-y-2">
            <p>
              ✨ <strong>Novo Fluxo Unificado:</strong> Os relatórios são calculados uma única vez a partir dos dados consolidados no banco local. 
              Não há mais redundância de cálculos entre abas antigas.
            </p>
            <p>
              🔄 <strong>Sincronização Automática:</strong> Todos os dados são enviados para Google Sheets através do orquestrador centralizado a cada 30 segundos ou ao clicar em "Sincronizar Agora".
            </p>
            <p>
              📊 <strong>Supabase Webhook:</strong> Dados chegam também via webhook automático quando novos registros são inseridos, garantindo zero perda de dados por Wi-Fi instável.
            </p>
          </div>
        </div>
      )}

      {/* 6. TRILHA DE EVENTOS - COMPACTA */}
      {activeSubView === 'eventos' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-emerald-400" />
              <div>
                <h2 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  Fila de Eventos em Espera (IndexedDB)
                  {isConnected ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[0.55rem] flex items-center gap-1 border border-emerald-500/30">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></div>
                      REALTIME ON
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[0.55rem] border border-white/10">
                      REALTIME OFF
                    </span>
                  )}
                </h2>
                <p className="text-[0.65rem] text-slate-400">
                  {syncQueueItems.length} eventos pendentes de sincronização
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSyncToSheets}
              disabled={isSyncingSheets || syncQueueItems.length === 0}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-black text-xs font-black uppercase rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <Send size={13} />
              <span>Descarregar Fila</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950 shadow-md">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[0.62rem] border-b border-white/10">
                <tr>
                  <th className="py-3 px-3">Hora</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Setor/Rua</th>
                  <th className="py-3 px-3 text-center">Δ Volumes</th>
                  <th className="py-3 px-3">Justificativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {eventsList.slice(-15).reverse().map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(evt.timestamp).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-300">{evt.tipo}</td>
                    <td className="py-2.5 px-3 text-white">Setor {evt.setor} • <strong>{evt.rua}</strong></td>
                    <td className="py-2.5 px-3 text-center font-bold text-amber-300">
                      {evt.volumesDelta > 0 ? `+${evt.volumesDelta}` : evt.volumesDelta}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {evt.justification ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[0.6rem] font-bold">
                          {evt.justification}
                        </span>
                      ) : '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. ODBC & Auditoria */}
      {activeSubView === 'odbc' && (
        <OdbcQueryBridge
          streetSummaries={streetSummaries}
          syncQueueItems={syncQueueItems}
          eventsList={eventsList}
          logs={logs}
          apiUrl={apiUrl}
          onAddToast={onAddToast}
          onApplyDemands={async (newDemands) => {
            const updated = { ...demands, ...newDemands };
            setDemands(updated);
            await saveState(STORAGE_DEMANDS_KEY, updated);
            localStorage.setItem(STORAGE_DEMANDS_KEY, JSON.stringify(updated));
            onAddToast('Demandas integradas com sucesso!', 'var(--color-success)');
          }}
        />
      )}

      {/* 8. SHEETS Config */}
      {activeSubView === 'sheets' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-3">
            <h2 className="text-xs font-black text-white uppercase flex items-center gap-1.5">
              <FileSpreadsheet size={15} className="text-emerald-400" />
              <span>URL da Planilha / Google Apps Script</span>
            </h2>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => {
                  onApiUrlChange(e.target.value);
                  localStorage.setItem('repro_sheets_api_url', e.target.value);
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-h-[40px] px-3 bg-slate-900 border border-white/15 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('repro_sheets_api_url', apiUrl);
                  onAddToast('URL do Google Sheets salva com sucesso!', 'var(--color-success)');
                }}
                className="min-h-[40px] px-4 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase rounded-xl cursor-pointer"
              >
                Salvar URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Diagnóstico */}
      {activeSubView === 'diagnostico' && (
        <DiagnosticsTelemetryView />
      )}

      {/* MODAL DE AJUDA */}
      <HelpSupportModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        apiUrl={apiUrl}
        initialTab={helpModalTab}
      />
    </div>
  );
}
