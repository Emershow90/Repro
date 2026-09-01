/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
  Check
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
import { postBatchToGoogleSheets } from '../sheetService';
import DiagnosticsTelemetryView from './DiagnosticsTelemetryView';
import OdbcQueryBridge from './OdbcQueryBridge';
import HelpSupportModal from './HelpSupportModal';
import { useUIStore } from '../stores/uiStore';

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
  const [activeSubView, setActiveSubView] = useState<'resumo' | 'eventos' | 'odbc' | 'repro' | 'sheets' | 'externo' | 'diagnostico'>('resumo');

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

  // Sincronização
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [internalLastSync, setInternalLastSync] = useState<string | null>(null);
  const lastSyncTimestamp = externalLastSync || internalLastSync;
  const isCurrentlySyncing = Boolean(externalIsSyncing || isSyncingSheets);
  const [syncLogsResult, setSyncLogsResult] = useState<{ success: number; errors: number } | null>(null);

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpModalTab, setHelpModalTab] = useState<'manual' | 'sheets' | 'tv' | 'sql'>('sheets');

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    onAddToast('Copiado para a área de transferência!', 'var(--color-success)');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // Carregar dados locais do IndexedDB
  const loadLocalData = useCallback(async () => {
    try {
      const [savedDemands, savedSession, savedEvents, queue] = await Promise.all([
        getState<Record<string, ReproDemand>>(STORAGE_DEMANDS_KEY),
        getState<ActiveSession>(STORAGE_ACTIVE_SESSION_KEY),
        getState<OperationalEvent[]>(STORAGE_EVENTS_KEY),
        getOperationalSyncQueue()
      ]);

      if (savedDemands) setDemands(savedDemands);
      if (savedSession) setActiveSession(savedSession);
      if (savedEvents) setEventsList(savedEvents);
      if (queue) setSyncQueueItems(queue);
    } catch (err) {
      console.warn('Erro ao carregar dados do IndexedDB no Painel de Gestão', err);
    }
  }, []);

  useEffect(() => {
    loadLocalData();
    const interval = setInterval(loadLocalData, 3000); // Polling leve a cada 3s para acompanhar o PDT ao vivo
    return () => clearInterval(interval);
  }, [loadLocalData]);

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

      // Soma de volumes dos logs já gravados na data
      const streetLogs = logs.filter(l => {
        const act = (l.atividade || '').toUpperCase();
        const r = (l.rua || act.replace(/REABASTECIMENTO\s*-\s*/i, '')).trim().toUpperCase();
        return l.data === targetDateBR && r === rua;
      });

      const totalVolumesLogs = streetLogs.reduce((acc, l) => acc + (Number(l.volumes) || 0), 0);
      const totalEnderecosLogs = streetLogs.reduce((acc, l) => acc + (Number(l.enderecos) || 0), 0);
      const totalHorasLogs = streetLogs.reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

      // Se a rua for a que está ativa no coletor neste momento, soma o temporário
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

  // Sincronização com o Google Sheets (Consolidação em Lote)
  const handleSyncToSheets = async () => {
    if (!apiUrl || !apiUrl.startsWith('http')) {
      onAddToast('Configure a URL da API do Google Sheets nas opções.', 'var(--color-danger)');
      return;
    }

    setIsSyncingSheets(true);
    setSyncLogsResult(null);

    try {
      const queue = await getOperationalSyncQueue();
      const payloadBatch = {
        tipo: 'SYNC_BATCH_REPRO',
        data: targetDateBR,
        timestamp: Date.now(),
        resumo: streetSummaries,
        eventos: queue.slice(0, 50) // Envia lote de até 50 eventos pendentes
      };

      const isSuccess = await postBatchToGoogleSheets(apiUrl, payloadBatch);

      if (isSuccess) {
        const processedIds = queue.slice(0, 50).map(e => e.id);
        await clearOperationalSyncQueue(processedIds);
        setSyncQueueItems(await getOperationalSyncQueue());

        setInternalLastSync(new Date().toLocaleTimeString('pt-BR'));
        setSyncLogsResult({ success: streetSummaries.length, errors: 0 });
        onAddToast(`Dados consolidados enviados com sucesso para o Google Sheets!`, 'var(--color-success)');
      } else {
        throw new Error('Falha no envio para o Google Sheets. Verifique o link e permissões do Google Apps Script.');
      }
    } catch (err: any) {
      console.error('Erro de sincronização com o Sheets', err);
      onAddToast('Erro ao sincronizar com Google Sheets. Os dados permanecem seguros no IndexedDB.', 'var(--color-danger)');
      setSyncLogsResult({ success: 0, errors: 1 });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  return (
    <div className="w-full space-y-5 font-mono text-slate-200">
      
      {/* 1. BARRA SUPERIOR DE FILTRO & CONTROLO DE GESTÃO */}
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
              Acompanhamento operacional, auditoria de eventos e integração com Google Sheets
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

          {/* Botão Sincronizar com Planilha */}
          <button
            type="button"
            onClick={handleSyncToSheets}
            disabled={isSyncingSheets}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 disabled:opacity-50 text-black text-xs font-black uppercase rounded-xl border border-emerald-300 shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <RefreshCw size={13} className={isSyncingSheets ? 'animate-spin' : ''} />
            <span>{isSyncingSheets ? 'Enviando...' : 'Sincronizar Sheets'}</span>
          </button>
        </div>
      </div>

      {/* 2. CARDS DE INDICADORES GLOBAIS DO TURNO */}
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

      {/* 3. NAVEGAÇÃO DE SUB-VISÕES (RESUMO POR RUA / EVENTOS EM TEMPO REAL / CONFIG SHEETS) */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubView('resumo')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'resumo'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Activity size={14} />
          <span>Resumo por Rua ({streetSummaries.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('eventos')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'eventos'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RotateCw size={14} />
          <span>Trilha de Eventos & Fila Sync ({syncQueueItems.length} na fila)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('odbc')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'odbc'
              ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Database size={14} />
          <span>Queries SQL / ODBC & Auditoria</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('sheets')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'sheets'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet size={14} />
          <span>Configuração Sheets</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('externo')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'externo'
              ? 'bg-cyan-400 text-black shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Globe size={14} />
          <span>Conexão Site Externo / TV</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('diagnostico')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeSubView === 'diagnostico'
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <ShieldCheck size={14} />
          <span>Performance & Diagnóstico</span>
        </button>
      </div>

      {/* 4. CONTEÚDO DA SUB-VISÃO: RESUMO POR RUA */}
      {activeSubView === 'resumo' && (
        <div className="space-y-3">
          {/* Campo de Busca Rápida */}
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

          {/* Tabela de Ruas */}
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
                  <th className="py-3 px-3 text-right">Tempo</th>
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

                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {new Date(s.tempoTotalSegundos * 1000).toISOString().substring(11, 19)}
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

      {/* 5. CONTEÚDO DA SUB-VISÃO: TRILHA DE EVENTOS & FILA SYNC */}
      {activeSubView === 'eventos' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-emerald-400" />
              <div>
                <h2 className="text-xs font-black text-white uppercase">Fila de Eventos em Espera (IndexedDB)</h2>
                <p className="text-[0.65rem] text-slate-400">
                  {syncQueueItems.length} eventos pendentes de sincronização para a nuvem
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

          {/* Histórico Recente de Eventos Locais */}
          <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950 shadow-md">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[0.62rem] border-b border-white/10">
                <tr>
                  <th className="py-3 px-3">Hora</th>
                  <th className="py-3 px-3">Tipo de Evento</th>
                  <th className="py-3 px-3">Setor/Rua</th>
                  <th className="py-3 px-3 text-center">Δ Endereços</th>
                  <th className="py-3 px-3 text-center">Δ Volumes</th>
                  <th className="py-3 px-3">Lap / Duração</th>
                  <th className="py-3 px-3">Justificativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {eventsList.slice(-20).reverse().map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(evt.timestamp).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-300">
                      {evt.tipo}
                    </td>
                    <td className="py-2.5 px-3 text-white">
                      Setor {evt.setor} • <strong>{evt.rua}</strong>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-cyan-300">
                      {evt.enderecosDelta > 0 ? `+${evt.enderecosDelta}` : evt.enderecosDelta}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-amber-300">
                      {evt.volumesDelta > 0 ? `+${evt.volumesDelta}` : evt.volumesDelta}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {evt.lapDurationSeconds ? `${evt.lapDurationSeconds}s` : '---'}
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

      {/* 5.5 CONTEÚDO DA SUB-VISÃO: QUERIES SQL / ODBC & AUDITORIA DE REABASTECIMENTO */}
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
            onAddToast('Demandas da Query ODBC integradas com sucesso!', 'var(--color-success)');
          }}
        />
      )}

      {/* 6. CONTEÚDO DA SUB-VISÃO: CONFIGURAÇÃO GOOGLE SHEETS & SINCRONIZAÇÃO MULTI-MÁQUINA */}
      {activeSubView === 'sheets' && (
        <div className="space-y-4">
          {/* Card Central de Sincronização Multi-Dispositivo Simultânea */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-4 font-mono">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Radio size={22} className={networkStatus === 'online' ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">
                      Sincronização Multi-Dispositivo Simultânea (PDT ↔ PC ↔ Planilha)
                    </h2>
                    {networkStatus === 'online' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[0.62rem] font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        ONLINE ATIVO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[0.62rem] font-black flex items-center gap-1">
                        <WifiOff size={10} />
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <p className="text-[0.7rem] text-slate-400 mt-0.5">
                    Transmissão e recebimento de dados simultâneos entre múltiplos computadores e coletores Zebra/PDT.
                  </p>
                </div>
              </div>

              {/* Botão Forçar Sincronismo Imediato */}
              <button
                type="button"
                onClick={async () => {
                  if (onTriggerSync) {
                    await onTriggerSync();
                  } else {
                    await handleSyncToSheets();
                  }
                }}
                disabled={isCurrentlySyncing}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black uppercase rounded-xl border border-emerald-300 shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <RefreshCw size={14} className={isCurrentlySyncing ? 'animate-spin' : ''} />
                <span>{isCurrentlySyncing ? 'Sincronizando Agora...' : 'Sincronizar Simultâneo Agora'}</span>
              </button>
            </div>

            {/* Painel Explicativo de Arquitetura Multi-Máquina */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-900/90 rounded-xl border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase">
                  <Smartphone size={14} />
                  <span>1. Coletor / PDT em Campo</span>
                </div>
                <p className="text-[0.65rem] text-slate-400 leading-relaxed">
                  Ao bipejar ou apontar uma rua no Zebra/PDT, o registro é salvo localmente e enviado imediatamente para a nuvem/planilha.
                </p>
              </div>

              <div className="p-3 bg-slate-900/90 rounded-xl border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold uppercase">
                  <Laptop size={14} />
                  <span>2. Computador / Painel Torre</span>
                </div>
                <p className="text-[0.65rem] text-slate-400 leading-relaxed">
                  Outro PC ou máquina online recebe os dados automaticamente a cada 30 segundos ou ao focar a aba, atualizando totais e gráficos.
                </p>
              </div>

              <div className="p-3 bg-slate-900/90 rounded-xl border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-400 text-xs font-bold uppercase">
                  <FileSpreadsheet size={14} />
                  <span>3. Planilha Google Central</span>
                </div>
                <p className="text-[0.65rem] text-slate-400 leading-relaxed">
                  Atua como banco mestre unificado (aba <strong className="text-white">Controle de horas - Repro</strong>), consolidando todos os turnos.
                </p>
              </div>
            </div>

            {/* Métricas da Sincronização em Tempo Real */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-slate-400">
                  Última sincronização: <strong className="text-emerald-400">{lastSyncTimestamp || 'Conectando...'}</strong>
                </span>
                <span className="text-slate-400">
                  Registros unificados na base: <strong className="text-white">{logs.length}</strong>
                </span>
                <span className="text-slate-400">
                  Auto-sync em background: <strong className="text-emerald-400">Ativo (30s)</strong>
                </span>
              </div>
            </div>
          </div>

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

            {lastSyncTimestamp && (
              <p className="text-[0.68rem] text-emerald-400">
                Última sincronização bem-sucedida às {lastSyncTimestamp}
              </p>
            )}
          </div>

          {/* Configuração do Descanso de Tela (Screensaver) */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-4 font-mono">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-0.5">
                <h2 className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                  <Moon size={15} className={screensaverEnabled ? 'text-purple-400' : 'text-slate-400'} />
                  <span>Descanso de Tela / Economia de Energia</span>
                </h2>
                <p className="text-[0.65rem] text-slate-400">
                  Controle a inatividade automática para coletores Zebra e terminais de operação.
                </p>
              </div>

              <button
                type="button"
                onClick={() => updateScreensaverEnabled(!screensaverEnabled, onAddToast)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 cursor-pointer transition-all ${
                  screensaverEnabled 
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' 
                    : 'bg-slate-900 border border-white/20 text-slate-400 hover:text-white'
                }`}
              >
                <Moon size={14} className={screensaverEnabled ? 'text-white' : 'text-slate-400'} />
                <span>{screensaverEnabled ? 'ATIVADO' : 'DESATIVADO'}</span>
              </button>
            </div>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <label className="text-[0.65rem] font-bold text-slate-300 uppercase flex items-center gap-1.5">
                <Clock size={12} className="text-emerald-400" />
                <span>Tempo de Inatividade para Disparar:</span>
              </label>

              <div className="flex items-center flex-wrap gap-1.5">
                {[1, 2, 5, 10, 15, 30].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    disabled={!screensaverEnabled}
                    onClick={() => updateScreensaverTimeout(mins, onAddToast)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      screensaverTimeout === mins && screensaverEnabled
                        ? 'bg-emerald-500 text-black font-black shadow-md'
                        : 'bg-slate-900 border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {mins} {mins === 1 ? 'minuto' : 'minutos'}
                  </button>
                ))}
              </div>

              <p className="text-[0.6rem] text-slate-500 pt-1">
                {screensaverEnabled 
                  ? `O protetor de tela será acionado após ${screensaverTimeout} minutos sem interação do usuário.` 
                  : 'O protetor de tela está completamente DESATIVADO. O aplicativo nunca bloqueará a tela automaticamente.'}
              </p>
            </div>
          </div>

          {/* Card Executivo de Ajuda e Integração com Google Sheets */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-emerald-500/20 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400">
                <FileSpreadsheet size={18} />
                <h3 className="text-xs font-black uppercase tracking-wider font-mono">
                  Instruções & Script do Google Sheets
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                O código de integração e o passo a passo completo estão centralizados no Manual de Ajuda para manter as telas limpas para o operador.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setHelpModalTab('sheets');
                setShowHelpModal(true);
              }}
              className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold font-mono uppercase flex items-center gap-2 cursor-pointer transition-all shrink-0"
            >
              <FileSpreadsheet size={15} />
              <span>Ver Script & Passo a Passo</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. CONTEÚDO DA SUB-VISÃO: CONEXÃO SITE EXTERNO & TORRE TV */}
      {activeSubView === 'externo' && (
        <div className="space-y-6 animate-fade-in">
          {/* Banner de Introdução */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/60 to-slate-950 border border-cyan-500/30 shadow-lg space-y-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <Globe size={18} />
              <h2 className="text-sm font-black uppercase tracking-wider font-mono">
                Conexão da Aba Gestão com Sites Externos & Painéis de TV
              </h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exiba os dados de <strong>Reabastecimento em tempo real</strong> em qualquer site externo, portal corporativo, intranet ou televisores de torre de controle em <strong>modo somente leitura (Read-Only)</strong>.
            </p>
          </div>

          {/* Card Modo TV */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-xs font-black text-white uppercase flex items-center gap-2 font-mono">
                  <Tv size={15} className="text-cyan-400" />
                  <span>Modo Standalone / Televisores de Torre</span>
                </h3>
                <p className="text-[0.65rem] text-slate-400">
                  URL direta para exibição em tela cheia na torre de controle ou embutir em portais.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?view=gestao&standalone=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-900 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer font-mono"
                >
                  <ExternalLink size={13} />
                  <span>Testar em Nova Aba</span>
                </a>
              </div>
            </div>

            {/* Link Direto */}
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider font-mono">
                URL Standalone (Modo TV / Somente Gestão):
              </label>
              <div className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-xl border border-white/10">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?view=gestao&standalone=true`}
                  className="bg-transparent text-xs text-cyan-300 focus:outline-none w-full font-mono select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(`${window.location.origin + window.location.pathname}?view=gestao&standalone=true`, 'url')}
                  className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 font-mono"
                >
                  {copiedType === 'url' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedType === 'url' ? 'Copiado!' : 'Copiar URL'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[0.65rem] text-slate-400">Precisa do código HTML do iframe ou da API de integração?</span>
              <button
                type="button"
                onClick={() => {
                  setHelpModalTab('tv');
                  setShowHelpModal(true);
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-bold font-mono underline cursor-pointer flex items-center gap-1"
              >
                <span>Ver códigos na Central de Ajuda</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONTEÚDO DA SUB-VISÃO: PERFORMANCE & DIAGNÓSTICO */}
      {activeSubView === 'diagnostico' && (
        <DiagnosticsTelemetryView />
      )}

      {/* MODAL DE AJUDA & DOCUMENTAÇÃO */}
      <HelpSupportModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        apiUrl={apiUrl}
        initialTab={helpModalTab}
      />
    </div>
  );
}
