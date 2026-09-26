/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MÓDULO DE GESTÃO & GOOGLE SHEETS - REAPRO TORRE 5.0
 * Arquitetura Orientada a Processos: Terminal Local ➔ IndexedDB ➔ Fila ➔ Google Sheets ➔ Supabase
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Log, 
  ReproDemand, 
  ActiveSession, 
  OperationalEvent, 
  StreetSummary 
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
  Search, 
  Activity, 
  ShieldCheck, 
  ExternalLink,
  ChevronRight,
  Database,
  MapPin,
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
  ShieldAlert,
  Settings,
  Zap,
  ArrowRight,
  Sparkles,
  HardDrive,
  Calendar,
  Filter,
  Trash2,
  X,
  Edit3,
  RotateCw,
  BellRing
} from 'lucide-react';
import VphAlertManagement from './VphAlertManagement';
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
import { 
  getState, 
  saveState, 
  getOperationalSyncQueue, 
  clearOperationalSyncQueue,
  getLogs,
  saveLog,
  getUnsyncedLogs
} from '../services/dbLocal';
import { 
  postBatchToGoogleSheets, 
  postLogWithRetry, 
  fetchFromCloud, 
  normalizeSheetUrl 
} from '../sheetService';
import SupabaseConfigModule from './SupabaseConfigModule';
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

export type StorageSyncMode = 'hybrid' | 'sheets' | 'supabase';

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
  // -------------------------------------------------------------
  // NAVEGAÇÃO ORIENTADA PRINCIPAL (6 PILARES COM SINCRONIZAÇÃO DEDICADA)
  // -------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'sheets' | 'supabase' | 'demandas' | 'fila' | 'ferramentas' | 'alertas'>('sheets');

  // Modo de armazenamento preferencial (Persistido no localStorage)
  const [storageMode, setStorageMode] = useState<StorageSyncMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('repro_storage_mode') as StorageSyncMode;
      if (saved === 'sheets' || saved === 'supabase' || saved === 'hybrid') {
        return saved;
      }
    }
    return 'hybrid';
  });

  const handleSelectStorageMode = (mode: StorageSyncMode) => {
    setStorageMode(mode);
    try {
      localStorage.setItem('repro_storage_mode', mode);
    } catch (e) {
      console.warn('Falha ao salvar modo de armazenamento:', e);
    }
    if (mode === 'sheets') {
      onAddToast('Modo de armazenamento: Planilha Google Sheets ativo!', 'var(--color-success)');
    } else if (mode === 'supabase') {
      onAddToast('Modo de armazenamento: Supabase Cloud (PostgreSQL) ativo!', 'var(--color-success)');
    } else {
      onAddToast('Modo de armazenamento Híbrido ativo: Google Sheets + Supabase Cloud!', 'var(--color-info)');
    }
  };

  // Filtros de Data e Setor para o Balanço
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [selectedSector, setSelectedSector] = useState<string>('TODOS');
  const [streetSearch, setStreetSearch] = useState('');

  // Estados locais IndexedDB
  const [demands, setDemands] = useState<Record<string, ReproDemand>>({});
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [eventsList, setEventsList] = useState<OperationalEvent[]>([]);
  const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);

  // Estados da Conexão com Google Sheets
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; ms: number; message: string } | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isPullingSheets, setIsPullingSheets] = useState(false);
  const [internalLastSync, setInternalLastSync] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptDrawer, setShowScriptDrawer] = useState(false);

  // Modal de Demanda para Rua
  const [editingDemandStreet, setEditingDemandStreet] = useState<{ rua: string; setor: string; currentVal: number } | null>(null);
  const [modalDemandInput, setModalDemandInput] = useState<string>('');

  // UI Store (Screensaver & Theme)
  const {
    screensaverEnabled,
    screensaverTimeout,
    updateScreensaverEnabled,
    updateScreensaverTimeout
  } = useUIStore();

  const lastSyncTimestamp = externalLastSync || internalLastSync;
  const isCurrentlySyncing = Boolean(externalIsSyncing || isSyncingSheets || isPullingSheets);

  // Contadores de logs
  const unsyncedLogs = useMemo(() => logs.filter(l => !l.synced), [logs]);
  const syncedLogsCount = logs.length - unsyncedLogs.length;

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
      console.warn('Falha ao carregar dados do IndexedDB no Módulo de Gestão:', err);
    }
  }, []);

  useEffect(() => {
    loadLocalData();
    const interval = setInterval(loadLocalData, 3500);
    return () => clearInterval(interval);
  }, [loadLocalData]);

  // Data formatada para comparação
  const targetDateBR = useMemo(() => {
    const p = parseDateString(selectedDate) || new Date();
    return formatDateToBR(p);
  }, [selectedDate]);

  // Lista de ruas filtradas
  const filteredStreets = useMemo(() => {
    let list = ALL_CONFIGURED_STREETS;
    if (selectedSector === '87') list = SECTOR_87_STREETS;
    else if (selectedSector === '88') list = SECTOR_88_STREETS;
    else if (selectedSector === '89') list = SECTOR_89_STREETS;
    else if (selectedSector === '90') list = SECTOR_90_STREETS;

    if (streetSearch.trim()) {
      const q = streetSearch.trim().toUpperCase();
      list = list.filter(r => r.includes(q));
    }
    return list;
  }, [selectedSector, streetSearch]);

  // Resumo por rua estruturado
  const streetSummaries: StreetSummary[] = useMemo(() => {
    return filteredStreets.map(rua => {
      const setor = inferSectorFromStreet(rua);
      const demandKey = `${selectedDate}_${setor}_${rua}`;
      const demandObj = demands[demandKey];

      const demanda = demandObj && demandObj.demandaCalculada > 0 ? demandObj.demandaCalculada : null;
      const unidade = demandObj ? demandObj.unidade : 'CAIXAS';

      // Soma de volumes dos logs na data
      const streetLogs = logs.filter(l => {
        const act = (l.atividade || '').toUpperCase();
        const r = (l.rua || act.replace(/REABASTECIMENTO\s*-\s*/i, '')).trim().toUpperCase();
        return l.data === targetDateBR && r === rua;
      });

      const totalVolumesLogs = streetLogs.reduce((acc, l) => acc + (Number(l.volumes) || 0), 0);
      const totalEnderecosLogs = streetLogs.reduce((acc, l) => acc + (Number(l.enderecos) || 0), 0);
      const totalHorasLogs = streetLogs.reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

      // Sessão ativa ao vivo no coletor
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

  // Totais consolidados do turno
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

  // -------------------------------------------------------------
  // TESTE REAL DE CONEXÃO (PING NA PLANILHA)
  // -------------------------------------------------------------
  const handleTestPing = async () => {
    if (!apiUrl || !apiUrl.startsWith('http')) {
      onAddToast('Por favor, informe uma URL válida do Google Apps Script.', 'var(--color-danger)');
      return;
    }

    setIsTestingPing(true);
    setPingResult(null);
    const start = performance.now();

    try {
      const normalized = normalizeSheetUrl(apiUrl);
      // Tentativa 1: Via Server Proxy
      let reached = false;
      let latency = 0;

      try {
        const proxyRes = await fetch(`/api/sheets/proxy?apiUrl=${encodeURIComponent(normalized)}`);
        latency = Math.round(performance.now() - start);
        if (proxyRes.ok) {
          reached = true;
        }
      } catch {
        // fallback
      }

      // Tentativa 2: Direct browser fetch
      if (!reached) {
        const directRes = await fetch(normalized, { method: 'GET', mode: 'no-cors' });
        latency = Math.round(performance.now() - start);
        if (directRes.type === 'opaque' || directRes.ok) {
          reached = true;
        }
      }

      if (reached) {
        setPingResult({
          ok: true,
          ms: latency,
          message: `Conexão validada com sucesso! Resposta em ${latency}ms.`
        });
        onAddToast(`⚡ Planilha Online! Latência: ${latency}ms`, 'var(--color-success)');
      } else {
        throw new Error('Endpoint não respondeu ao teste de ping.');
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      setPingResult({
        ok: false,
        ms: latency,
        message: `Falha na conexão: ${err.message || 'Sem resposta do script'}`
      });
      onAddToast('Erro de conexão com o Google Sheets. Verifique a URL e se está publicado como "Qualquer pessoa".', 'var(--color-danger)');
    } finally {
      setIsTestingPing(false);
    }
  };

  // -------------------------------------------------------------
  // SINCRONIZAR TUDO (PUSH & PULL)
  // -------------------------------------------------------------
  const handleSyncAll = async () => {
    if (onTriggerSync) {
      await onTriggerSync();
      return;
    }

    if (!apiUrl) {
      onAddToast('Configure a URL da API do Google Sheets.', 'var(--color-danger)');
      return;
    }

    setIsSyncingSheets(true);
    try {
      // 1. Enviar lote de consolidação
      const queue = await getOperationalSyncQueue();
      const payloadBatch = {
        tipo: 'SYNC_BATCH_REPRO',
        data: targetDateBR,
        timestamp: Date.now(),
        resumo: streetSummaries,
        eventos: queue.slice(0, 50)
      };

      const success = await postBatchToGoogleSheets(apiUrl, payloadBatch);
      if (success) {
        const processedIds = queue.slice(0, 50).map(e => e.id);
        await clearOperationalSyncQueue(processedIds);
        setSyncQueueItems(await getOperationalSyncQueue());
        setInternalLastSync(new Date().toLocaleTimeString('pt-BR'));
        onAddToast('Sincronização completa realizada com a planilha!', 'var(--color-success)');
      } else {
        throw new Error('Falha ao transmitir lote para o Google Sheets.');
      }
    } catch (err: any) {
      onAddToast(`Erro ao sincronizar: ${err.message}`, 'var(--color-danger)');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // -------------------------------------------------------------
  // PUXAR DADOS DA PLANILHA (IMPORTAR)
  // -------------------------------------------------------------
  const handlePullFromSheets = async () => {
    if (!apiUrl) {
      onAddToast('URL da planilha não configurada.', 'var(--color-danger)');
      return;
    }

    setIsPullingSheets(true);
    try {
      const cloudLogs = await fetchFromCloud(apiUrl);
      if (cloudLogs && cloudLogs.length > 0) {
        // Mesclar com logs locais
        let addedCount = 0;
        for (const log of cloudLogs) {
          await saveLog(log);
          addedCount++;
        }
        setInternalLastSync(new Date().toLocaleTimeString('pt-BR'));
        onAddToast(`Sucesso! ${addedCount} registros importados da planilha Google.`, 'var(--color-success)');
        loadLocalData();
      } else {
        onAddToast('Nenhum dado retornado da planilha ou a base já está atualizada.', 'var(--color-info)');
      }
    } catch (err: any) {
      onAddToast(`Erro ao importar da planilha: ${err.message}`, 'var(--color-danger)');
    } finally {
      setIsPullingSheets(false);
    }
  };

  // -------------------------------------------------------------
  // DESCARREGAR LOGS OFFLINE PENDENTES
  // -------------------------------------------------------------
  const handlePushUnsyncedLogs = async () => {
    if (!apiUrl) {
      onAddToast('Configure a URL da API do Google Sheets.', 'var(--color-danger)');
      return;
    }

    const pending = await getUnsyncedLogs();
    if (pending.length === 0) {
      onAddToast('Nenhum log pendente de sincronização offline.', 'var(--color-info)');
      return;
    }

    setIsSyncingSheets(true);
    let successCount = 0;

    for (const log of pending) {
      try {
        const ok = await postLogWithRetry(apiUrl, log);
        if (ok) {
          log.synced = true;
          await saveLog(log);
          successCount++;
        }
      } catch (err) {
        console.warn(`Falha ao sincronizar log ${log.id}:`, err);
      }
    }

    setIsSyncingSheets(false);
    if (successCount > 0) {
      setInternalLastSync(new Date().toLocaleTimeString('pt-BR'));
      onAddToast(`${successCount} de ${pending.length} logs pendentes enviados para a planilha!`, 'var(--color-success)');
      loadLocalData();
    } else {
      onAddToast('Não foi possível enviar os logs pendentes. Verifique a conexão.', 'var(--color-danger)');
    }
  };

  // -------------------------------------------------------------
  // SALVAR META/DEMANDA DE RUA
  // -------------------------------------------------------------
  const handleSaveDemand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingDemandStreet) return;

    const num = parseFloat(modalDemandInput.replace(',', '.'));
    if (isNaN(num) || num < 0) {
      onAddToast('Informe um valor numérico válido maior ou igual a zero.', 'var(--color-danger)');
      return;
    }

    const { rua, setor } = editingDemandStreet;
    const key = `${selectedDate}_${setor}_${rua}`;
    const updated = {
      ...demands,
      [key]: {
        id: `dem_${Date.now()}`,
        data: selectedDate,
        setor: setor,
        rua: rua,
        demandaCalculada: num,
        unidade: 'CAIXAS' as const
      }
    };

    setDemands(updated);
    await saveState(STORAGE_DEMANDS_KEY, updated);
    localStorage.setItem(STORAGE_DEMANDS_KEY, JSON.stringify(updated));
    setEditingDemandStreet(null);
    onAddToast(`Meta de ${num} caixas definida para a Rua ${rua}!`, 'var(--color-success)');
  };

  // -------------------------------------------------------------
  // CÓDIGO DO GOOGLE APPS SCRIPT PARA CÓPIA RÁPIDA
  // -------------------------------------------------------------
  const appsScriptCode = `// SCRIPT GOOGLE APPS SCRIPT - REAPRO TORRE 5.0
// 1. Abra sua Planilha Google
// 2. Vá em Extensões > Apps Script
// 3. Cole o código abaixo e clique em Salvar
// 4. Clique em "Implantar" > "Nova Implantação"
// 5. Tipo: "App da Web" | Quem pode acessar: "Qualquer pessoa" (Anyone)

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Controle de horas - Repro") || ss.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", dados: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success", dados: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Controle de horas - Repro");
    if (!sheet) {
      sheet = ss.insertSheet("Controle de horas - Repro");
      sheet.appendRow([
        "Carimbo de data/hora", "Setor", "Data", "Semana", "Semana Ano",
        "Atividade", "Colaborador", "Qtd Endereços", "Horas", "VPH",
        "Tipo", "Hora Início", "Hora Fim"
      ]);
    }
    
    var body = e.postData.contents;
    var data = JSON.parse(body);
    
    // Suporte a envio em Lote
    if (data.tipo === 'SYNC_BATCH_REPRO' && data.eventos) {
      for (var i = 0; i < data.eventos.length; i++) {
        var ev = data.eventos[i];
        sheet.appendRow([
          new Date(), ev.setor || '', data.data || '', '', '',
          ev.rua ? 'REABASTECIMENTO - ' + ev.rua : 'REABASTECIMENTO',
          ev.operador || 'OPERADOR', ev.volumesDelta || 0,
          (ev.lapDurationSeconds || 0) / 3600, 0, 'DIRETA', '', ''
        ]);
      }
    } else {
      // Envio de apontamento individual
      sheet.appendRow([
        new Date(), data.setor || '87', data.data || '', data.semana || '', data.semanaAno || '',
        data.atividade || '', data.colaborador || '', data.qtdEnderecos || data.volumes || 0,
        data.horas || 0, data.vph || 0, data.tipo || 'direta',
        data.horaInicio || '', data.horaFim || ''
      ]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", gravados: 1 }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "erro", mensagem: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    onAddToast('Código do Apps Script copiado para a área de transferência!', 'var(--color-success)');
    setTimeout(() => setCopiedScript(false), 3000);
  };

  // Seletor de Modo de Armazenamento e Alternador Rápido entre Provedores
  const renderSyncModeSwitcher = () => (
    <div className="repro-card p-4 sm:p-5 rounded-2xl space-y-3 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
              <Layers size={15} className="text-cyan-400" />
              Estratégia de Armazenamento &amp; Sincronização
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${
              storageMode === 'hybrid'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : storageMode === 'sheets'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
            }`}>
              {storageMode === 'hybrid' ? 'Modo Híbrido (Dual)' : storageMode === 'sheets' ? 'Planilha Sheets' : 'Supabase Cloud'}
            </span>
          </div>
          <p className="text-[0.65rem] text-slate-400">
            Alterne entre as abas de configuração ou defina o destino preferencial da operação.
          </p>
        </div>

        {/* Abas Rápidas de Alternância: Google Sheets vs Supabase */}
        <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'sheets'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('supabase')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'supabase'
                ? 'bg-purple-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database size={14} />
            <span>Supabase Cloud</span>
          </button>
        </div>
      </div>

      {/* Cards de Seleção dos 3 Modos de Operação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
        {/* Modo Híbrido */}
        <button
          type="button"
          onClick={() => handleSelectStorageMode('hybrid')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
            storageMode === 'hybrid'
              ? 'bg-cyan-500/15 border-cyan-500/60 shadow-md ring-1 ring-cyan-500/30'
              : 'bg-slate-900/60 border-white/10 hover:border-white/25'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300">
                <Layers size={14} />
              </div>
              <span className="text-xs font-black text-white uppercase">Modo Híbrido (Dual-Sync)</span>
            </div>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Recomendado
            </span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-snug">
            Transmite logs para a Planilha Google E mantém snapshots no banco relacional Supabase.
          </p>
          <div className="flex items-center justify-between text-[0.6rem] text-cyan-300 font-bold border-t border-white/5 pt-1.5">
            <span>Máxima segurança operacional</span>
            {storageMode === 'hybrid' && <CheckCircle2 size={12} className="text-cyan-400" />}
          </div>
        </button>

        {/* Modo Google Sheets */}
        <button
          type="button"
          onClick={() => handleSelectStorageMode('sheets')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
            storageMode === 'sheets'
              ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
              : 'bg-slate-900/60 border-white/10 hover:border-white/25'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                <FileSpreadsheet size={14} />
              </div>
              <span className="text-xs font-black text-white uppercase">Planilha Google Sheets</span>
            </div>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
              apiUrl ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {apiUrl ? 'Conectado' : 'Sem URL'}
            </span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-snug">
            Canal direto via Apps Script para consolidação e relatórios executivos na aba "Controle de horas - Repro".
          </p>
          <div className="flex items-center justify-between text-[0.6rem] text-emerald-300 font-bold border-t border-white/5 pt-1.5">
            <span>{unsyncedLogs.length} pendentes na fila</span>
            {storageMode === 'sheets' && <CheckCircle2 size={12} className="text-emerald-400" />}
          </div>
        </button>

        {/* Modo Supabase Cloud */}
        <button
          type="button"
          onClick={() => handleSelectStorageMode('supabase')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
            storageMode === 'supabase'
              ? 'bg-purple-500/15 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
              : 'bg-slate-900/60 border-white/10 hover:border-white/25'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                <Database size={14} />
              </div>
              <span className="text-xs font-black text-white uppercase">Supabase Cloud DB</span>
            </div>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              PostgreSQL
            </span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-snug">
            Banco relacional ACID de alta disponibilidade, snapshots compactados e restauração de dados entre coletores.
          </p>
          <div className="flex items-center justify-between text-[0.6rem] text-purple-300 font-bold border-t border-white/5 pt-1.5">
            <span>Backups e Restauração Instantânea</span>
            {storageMode === 'supabase' && <CheckCircle2 size={12} className="text-purple-400" />}
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-5 font-mono text-slate-200">
      
      {/* ========================================================= */}
      {/* 1. ORGANOGRAMA & DIAGRAMA DE FLUXO ORIENTADO (TOPO VISUAL) */}
      {/* ========================================================= */}
      <section className="repro-card-elevated p-4 sm:p-5 rounded-2xl shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black text-white uppercase tracking-wider">
                  Hub de Gestão, Sincronização &amp; Armazenamento Nuvem
                </h1>
                <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  TORRE 5.0
                </span>
              </div>
              <p className="text-[0.65rem] text-slate-400">
                Arquitetura operacional: Coleta em campo ➔ Fila Offline ➔ Planilha Mestre ➔ Supabase Cloud
              </p>
            </div>
          </div>

          {/* Badges de Status Operacional em Tempo Real */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rede */}
            <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              networkStatus === 'online'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {networkStatus === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="text-[0.62rem] uppercase">{networkStatus}</span>
            </div>

            {/* Fila Retida */}
            <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              unsyncedLogs.length > 0
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse'
                : 'bg-slate-900 text-slate-400 border-white/10'
            }`}>
              <Radio size={12} />
              <span className="text-[0.62rem]">
                Fila: <strong>{unsyncedLogs.length}</strong> pendentes
              </span>
            </div>

            {/* Sincronizados */}
            <div className="px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-900 border border-white/10 text-slate-300">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="text-[0.62rem]">
                Base: <strong>{syncedLogsCount}/{logs.length}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* FLUXOGRAMA FUNCIONAL MINIMALISTA */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1 text-[0.65rem]">
          {/* Estágio 1: Coletor */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[0.58rem]">
              <span className="flex items-center gap-1"><Smartphone size={11} className="text-emerald-400" /> 1. Coleta</span>
              <span className="text-emerald-400">Ativo</span>
            </div>
            <div className="text-white font-black text-xs">PDT / Zebra</div>
            <p className="text-[0.58rem] text-slate-500 truncate">Bipejo &amp; Apontamentos</p>
          </div>

          {/* Estágio 2: IndexedDB */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[0.58rem]">
              <span className="flex items-center gap-1"><HardDrive size={11} className="text-cyan-400" /> 2. Armazenamento</span>
              <span className="text-cyan-400">{logs.length} logs</span>
            </div>
            <div className="text-white font-black text-xs">IndexedDB Local</div>
            <p className="text-[0.58rem] text-slate-500 truncate">Zero bloqueio offline</p>
          </div>

          {/* Estágio 3: Fila de Sincronia */}
          <div className={`p-2.5 rounded-xl border space-y-1 ${
            unsyncedLogs.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/80 border-white/10'
          }`}>
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[0.58rem]">
              <span className="flex items-center gap-1"><RefreshCw size={11} className={unsyncedLogs.length > 0 ? 'text-amber-400 animate-spin' : 'text-slate-400'} /> 3. Fila</span>
              <span className={unsyncedLogs.length > 0 ? 'text-amber-400 font-black' : 'text-emerald-400'}>
                {unsyncedLogs.length === 0 ? 'Pronta' : `${unsyncedLogs.length} itens`}
              </span>
            </div>
            <div className="text-white font-black text-xs">Fila de Espera</div>
            <p className="text-[0.58rem] text-slate-500 truncate">Retry automático</p>
          </div>

          {/* Estágio 4: Google Sheets Webhook */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/20 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[0.58rem]">
              <span className="flex items-center gap-1"><FileSpreadsheet size={11} className="text-emerald-400" /> 4. Sheets</span>
              <span className={apiUrl ? 'text-emerald-400' : 'text-amber-400'}>{apiUrl ? 'Conectado' : 'Sem URL'}</span>
            </div>
            <div className="text-white font-black text-xs truncate">Controle de Horas</div>
            <p className="text-[0.58rem] text-slate-500 truncate">Webhook Apps Script</p>
          </div>

          {/* Estágio 5: Supabase Cloud */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[0.58rem]">
              <span className="flex items-center gap-1"><Database size={11} className="text-purple-400" /> 5. Nuvem</span>
              <span className="text-purple-400">Snapshot</span>
            </div>
            <div className="text-white font-black text-xs">Supabase DB</div>
            <p className="text-[0.58rem] text-slate-500 truncate">Backup Relacional</p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. MENU DE NAVEGAÇÃO MINIMALISTA (5 ABAS OBJETIVAS) */}
      {/* ========================================================= */}
      <nav className="flex items-center gap-2 overflow-x-auto scrollbar-thin border-b border-white/10 pb-3">
        {/* 1. Google Sheets */}
        <button
          type="button"
          onClick={() => setActiveTab('sheets')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'sheets'
              ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet size={15} />
          <span>1. Google Sheets</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            activeTab === 'sheets' ? 'bg-black/20 text-black' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
          }`}>
            Planilha
          </span>
        </button>

        {/* 2. Supabase Cloud */}
        <button
          type="button"
          onClick={() => setActiveTab('supabase')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'supabase'
              ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Database size={15} />
          <span>2. Supabase Cloud</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            activeTab === 'supabase' ? 'bg-black/20 text-white' : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
          }`}>
            PostgreSQL
          </span>
        </button>

        {/* 3. Balanço de Demandas */}
        <button
          type="button"
          onClick={() => setActiveTab('demandas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'demandas'
              ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Activity size={15} />
          <span>3. Demandas por Rua ({filteredStreets.length})</span>
        </button>

        {/* 4. Fila de Transmissão */}
        <button
          type="button"
          onClick={() => setActiveTab('fila')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'fila'
              ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RotateCw size={15} />
          <span>4. Fila de Transmissão ({unsyncedLogs.length})</span>
        </button>

        {/* 5. Modo TV & Ferramentas */}
        <button
          type="button"
          onClick={() => setActiveTab('ferramentas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ferramentas'
              ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Settings size={15} />
          <span>5. Modo TV &amp; Dispositivos</span>
        </button>

        {/* 6. Metas & Alertas VPH */}
        <button
          type="button"
          onClick={() => setActiveTab('alertas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'alertas'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 scale-[1.01]'
              : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BellRing size={15} />
          <span>6. Alertas &amp; Metas VPH</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            activeTab === 'alertas' ? 'bg-black/20 text-black' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
          }`}>
            Produtividade
          </span>
        </button>
      </nav>

      {/* ========================================================= */}
      {/* ABA 1: CONEXÃO & SINCRONIZAÇÃO GOOGLE SHEETS */}
      {/* ========================================================= */}
      {activeTab === 'sheets' && (
        <div className="space-y-4 animate-fade-in">
          {renderSyncModeSwitcher()}
          
          {/* Card Central de Operação da Planilha */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/30 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-sm font-black text-white uppercase flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-emerald-400" />
                  <span>Configuração &amp; Endpoint do Google Apps Script</span>
                </h2>
                <p className="text-[0.68rem] text-slate-400 mt-0.5">
                  Conexão direta com a aba <strong className="text-white">Controle de horas - Repro</strong> da sua Planilha Google
                </p>
              </div>

              {/* Botão de Testar Conexão Real (Ping) */}
              <button
                type="button"
                onClick={handleTestPing}
                disabled={isTestingPing || !apiUrl}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs font-black uppercase flex items-center gap-2 cursor-pointer transition-all disabled:opacity-40"
              >
                <Zap size={14} className={isTestingPing ? 'animate-bounce text-amber-400' : 'text-emerald-400'} />
                <span>{isTestingPing ? 'Testando Ping...' : 'Testar Conexão (Ping)'}</span>
              </button>
            </div>

            {/* Input da URL do Apps Script */}
            <div className="space-y-2">
              <label className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider block">
                URL do Webhook Web App (exec):
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => onApiUrlChange(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-white/15 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('repro_sheets_api_url', apiUrl);
                    onAddToast('URL da planilha salva com sucesso no terminal!', 'var(--color-success)');
                  }}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase rounded-xl cursor-pointer transition-all shadow-md shrink-0"
                >
                  Salvar URL
                </button>
              </div>

              {/* Retorno do Teste de Ping */}
              {pingResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  pingResult.ok 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {pingResult.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>{pingResult.message}</span>
                  </div>
                  <span className="font-bold text-[0.65rem] px-2 py-0.5 rounded bg-black/40 border border-white/10">
                    {pingResult.ms} ms
                  </span>
                </div>
              )}
            </div>

            {/* Tríade de Ações Principais de Sincronia */}
            <div className="pt-2 border-t border-white/10">
              <div className="text-[0.65rem] font-bold text-slate-400 uppercase mb-3">
                Ações de Transmissão Bidirecional:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Sincronizar Tudo */}
                <button
                  type="button"
                  onClick={handleSyncAll}
                  disabled={isCurrentlySyncing}
                  className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 disabled:opacity-50 text-black text-xs font-black uppercase flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-lg shadow-emerald-500/15"
                >
                  <RefreshCw size={16} className={isCurrentlySyncing ? 'animate-spin' : ''} />
                  <span>Sincronizar Tudo Agora</span>
                  <span className="text-[0.58rem] font-medium opacity-80">Push pendências + Atualizar base</span>
                </button>

                {/* 2. Puxar Dados da Planilha (GET) */}
                <button
                  type="button"
                  onClick={handlePullFromSheets}
                  disabled={isCurrentlySyncing}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-white/15 hover:border-cyan-500/40 text-cyan-300 text-xs font-black uppercase flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download size={16} className={isPullingSheets ? 'animate-bounce' : ''} />
                  <span>Puxar Dados da Planilha</span>
                  <span className="text-[0.58rem] font-medium text-slate-400">Importar registros da nuvem (GET)</span>
                </button>

                {/* 3. Descarregar Fila Offline (POST) */}
                <button
                  type="button"
                  onClick={handlePushUnsyncedLogs}
                  disabled={isCurrentlySyncing || unsyncedLogs.length === 0}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-white/15 hover:border-amber-500/40 text-amber-300 disabled:opacity-40 text-xs font-black uppercase flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Send size={16} />
                  <span>Descarregar Fila ({unsyncedLogs.length})</span>
                  <span className="text-[0.58rem] font-medium text-slate-400">Enviar logs pendentes offline</span>
                </button>
              </div>
            </div>

            {/* Rodapé de Informações de Sincronia */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10 text-xs text-slate-400">
              <div>
                Última sincronização confirmada: <strong className="text-emerald-400">{lastSyncTimestamp || 'Aguardando primeiro sync...'}</strong>
              </div>
              <div>
                Auto-sincronia multi-máquina: <strong className="text-emerald-400">Ativa a cada 30s</strong>
              </div>
            </div>
          </div>

          {/* Card de Especificação das Colunas & Script Apps Script */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <Code size={16} className="text-cyan-400" />
                  <span>Estrutura de Colunas da Planilha &amp; Código Apps Script</span>
                </h3>
                <p className="text-[0.65rem] text-slate-400">
                  O Google Apps Script escreve e lê exatamente estas colunas na aba <strong className="text-white">Controle de horas - Repro</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScriptDrawer(!showScriptDrawer)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-slate-300 hover:text-white text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  {showScriptDrawer ? 'Ocultar Script' : 'Exibir Script Completo'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedScript ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedScript ? 'Copiado!' : 'Copiar Script'}</span>
                </button>
              </div>
            </div>

            {/* Grid com as Colunas Mapeadas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[0.62rem]">
              {[
                { col: 'A', name: 'Carimbo Data/Hora' },
                { col: 'B', name: 'Setor (87-90)' },
                { col: 'C', name: 'Data (DD/MM/AAAA)' },
                { col: 'D', name: 'Semana do Ano' },
                { col: 'E', name: 'Ano da Semana' },
                { col: 'F', name: 'Atividade / Rua' },
                { col: 'G', name: 'Colaborador' },
                { col: 'H', name: 'Qtd Volumes / End.' },
                { col: 'I', name: 'Horas Decimais' },
                { col: 'J', name: 'Vol/h (VPH)' },
                { col: 'K', name: 'Tipo (Direta/Ind)' },
                { col: 'L', name: 'Horário Início / Fim' },
              ].map(item => (
                <div key={item.col} className="p-2 rounded-xl bg-slate-900 border border-white/10">
                  <div className="text-cyan-400 font-black">Coluna {item.col}</div>
                  <div className="text-white font-bold truncate">{item.name}</div>
                </div>
              ))}
            </div>

            {/* Código Fonte do Google Apps Script (quando expandido) */}
            {showScriptDrawer && (
              <div className="relative mt-3 rounded-xl overflow-hidden border border-white/15 bg-slate-900">
                <div className="p-2 bg-slate-950 border-b border-white/10 flex items-center justify-between text-[0.65rem] text-slate-400">
                  <span>Código Google Apps Script (Code.gs)</span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>Copiar</span>
                  </button>
                </div>
                <pre className="p-3 text-[0.65rem] text-emerald-300 font-mono overflow-x-auto max-h-72 leading-relaxed">
                  {appsScriptCode}
                </pre>
              </div>
            )}
          </div>

          {/* Banner de Alternância Rápida para o Supabase */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-slate-950 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Database size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <span>Deseja gerenciar o Banco Relacional ou Snapshots na Nuvem?</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    PostgreSQL
                  </span>
                </h4>
                <p className="text-[0.65rem] text-slate-400">
                  O Supabase Cloud garante redundância integral dos dados do IndexedDB com backups e restauração rápida.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('supabase')}
              className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-500/20"
            >
              <span>Abrir Supabase Cloud</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 2: SUPABASE CLOUD (BANCO RELACIONAL & SNAPSHOTS) */}
      {/* ========================================================= */}
      {activeTab === 'supabase' && (
        <div className="space-y-4 animate-fade-in">
          {renderSyncModeSwitcher()}

          {/* Hero explicativo da arquitetura Supabase */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-purple-500/30 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Database size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase flex items-center gap-2">
                    <span>Supabase Cloud - Snapshots &amp; Banco Relacional</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      PostgreSQL
                    </span>
                  </h2>
                  <p className="text-[0.68rem] text-slate-400 mt-0.5">
                    Armazenamento relacional de missão crítica: contingência, snapshots do IndexedDB e recuperação rápida entre dispositivos.
                  </p>
                </div>
              </div>

              {/* Botão de Alternância Rápida para o Google Sheets */}
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs font-black uppercase flex items-center gap-2 cursor-pointer transition-all"
              >
                <FileSpreadsheet size={14} />
                <span>Ver Planilha Google Sheets</span>
              </button>
            </div>

            {/* Comparativo de Papéis dos Armazenamentos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-300 font-black text-[0.68rem] uppercase">
                  <Database size={13} />
                  <span>Papel do Supabase Cloud</span>
                </div>
                <p className="text-[0.62rem] text-slate-300 leading-relaxed">
                  Garante a integridade do banco de dados (tabelas de eventos e snapshots integrais). Permite que qualquer terminal ou coletor restaure o estado completo da operação em caso de perda ou troca de aparelho.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-300 font-black text-[0.68rem] uppercase">
                  <FileSpreadsheet size={13} />
                  <span>Papel do Google Sheets</span>
                </div>
                <p className="text-[0.62rem] text-slate-300 leading-relaxed">
                  Serve como o livro de registro executivo ("Controle de horas - Repro"), permitindo que supervisores e gerentes analisem tempos, VPH e distribuição de ruas sem precisar de queries no banco SQL.
                </p>
              </div>
            </div>
          </div>

          {/* Componente Modular Completo do Supabase */}
          <SupabaseConfigModule />

          {/* Banner de Alternância Rápida de Volta para a Planilha */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-950 to-slate-950 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <span>Deseja gerenciar o Webhook e as colunas do Google Sheets?</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Apps Script
                  </span>
                </h4>
                <p className="text-[0.65rem] text-slate-400">
                  Acesse o endpoint Apps Script, teste o ping e descarregue a fila de transmissão para a planilha.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('sheets')}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <span>Ir para Google Sheets</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 2: BALANÇO DE DEMANDAS & RUAS */}
      {/* ========================================================= */}
      {activeTab === 'demandas' && (
        <div className="space-y-4 animate-fade-in">
          
          {/* Barra de Filtros Operacionais */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/15 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-bold text-slate-400 uppercase">Data Operacional:</span>
              <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-white/15 text-xs">
                <Calendar size={13} className="text-emerald-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const y = today.getFullYear();
                  const m = String(today.getMonth() + 1).padStart(2, '0');
                  const d = String(today.getDate()).padStart(2, '0');
                  setSelectedDate(`${y}-${m}-${d}`);
                }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-lg text-[0.62rem] text-slate-300 hover:text-white cursor-pointer"
              >
                Hoje
              </button>
            </div>

            {/* Setores */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/15">
              <span className="text-[0.58rem] text-slate-400 uppercase px-1 font-bold">Setor:</span>
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

            {/* Busca de Rua */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-white/15 text-xs w-full sm:w-48">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                value={streetSearch}
                onChange={(e) => setStreetSearch(e.target.value)}
                placeholder="Buscar rua..."
                className="bg-transparent text-white focus:outline-none uppercase w-full placeholder-slate-500 text-xs font-bold"
              />
            </div>
          </div>

          {/* Cards de Métricas Consolidadas do Turno */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {/* Demanda Total */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-0.5">
              <span className="text-[0.6rem] text-slate-400 uppercase font-bold block">Demanda Planejada</span>
              <div className="text-xl font-black text-white">{totals.totalDemanda} <span className="text-xs text-slate-400 font-normal">cx/vol</span></div>
              <span className="text-[0.58rem] text-slate-500 block">Metas cadastradas no dia</span>
            </div>

            {/* Realizado Físico */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-cyan-500/30 shadow-sm space-y-0.5">
              <span className="text-[0.6rem] text-cyan-400 uppercase font-bold block">Realizado Físico</span>
              <div className="text-xl font-black text-cyan-300">{totals.totalRealizado} <span className="text-xs text-cyan-500 font-normal">cx/vol</span></div>
              <span className="text-[0.58rem] text-slate-500 block">{totals.totalEnderecos} endereços atendidos</span>
            </div>

            {/* Saldo Pendente */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-amber-500/30 shadow-sm space-y-0.5">
              <span className="text-[0.6rem] text-amber-400 uppercase font-bold block">Saldo Pendente</span>
              <div className="text-xl font-black text-amber-300">{totals.saldoPendenteGlobal} <span className="text-xs text-amber-500 font-normal">cx/vol</span></div>
              <span className="text-[0.58rem] text-slate-500 block">Restante para meta</span>
            </div>

            {/* Cobertura Geral */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-emerald-500/30 shadow-sm space-y-0.5">
              <span className="text-[0.6rem] text-emerald-400 uppercase font-bold block">Cobertura Geral</span>
              <div className="text-xl font-black text-emerald-300">{totals.coberturaGlobal}%</div>
              <span className="text-[0.58rem] text-slate-500 block">{totals.ruasAtendidas} de {totals.totalRuas} ruas atendidas</span>
            </div>

            {/* Ritmo Médio */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-purple-500/30 shadow-sm space-y-0.5 col-span-2 sm:col-span-1">
              <span className="text-[0.6rem] text-purple-400 uppercase font-bold block">Produtividade Média</span>
              <div className="text-lg font-black text-purple-300">
                {totals.vphGlobal} <span className="text-xs text-slate-400 font-normal">Vol/h</span>
              </div>
              <span className="text-[0.58rem] text-slate-500 block">{totals.ephGlobal} Endereços/h</span>
            </div>
          </div>

          {/* Tabela Estruturada de Ruas */}
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
                  <th className="py-3 px-3 text-right">Vol/h (VPH)</th>
                  <th className="py-3 px-3 text-right">End/h (EPH)</th>
                  <th className="py-3 px-3 text-right">Duração</th>
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
                        {s.demanda !== null ? `${s.demanda} cx` : <span className="text-slate-500">Sem meta</span>}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-cyan-300">
                        {s.realizado} cx
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

                      <td className="py-2.5 px-3 text-right text-cyan-400 font-bold">
                        {s.vph}
                      </td>

                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                        {s.eph}
                      </td>

                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {new Date(s.tempoTotalSegundos * 1000).toISOString().substring(11, 19)}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDemandStreet({
                              rua: s.rua,
                              setor: s.setor,
                              currentVal: s.demanda || 0
                            });
                            setModalDemandInput(s.demanda !== null ? String(s.demanda) : '');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[0.6rem] font-bold uppercase transition-all cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <Edit3 size={11} />
                          <span>{s.demanda !== null ? 'Editar' : '+ Meta'}</span>
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

      {/* ========================================================= */}
      {/* ABA 3: FILA DE TRANSMISSÃO & AUDITORIA */}
      {/* ========================================================= */}
      {activeTab === 'fila' && (
        <div className="space-y-4 animate-fade-in">
          
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RotateCw size={18} className="text-amber-400" />
              <div>
                <h2 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <span>Logs Pendentes de Sincronização na Nuvem</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.6rem] font-bold">
                    {unsyncedLogs.length} pendentes
                  </span>
                </h2>
                <p className="text-[0.65rem] text-slate-400">
                  Registros gravados localmente no IndexedDB aguardando envio para o Google Sheets
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePushUnsyncedLogs}
              disabled={isSyncingSheets || unsyncedLogs.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:brightness-110 disabled:opacity-30 text-black text-xs font-black uppercase rounded-xl cursor-pointer flex items-center gap-2 shadow-md transition-all"
            >
              <Send size={13} />
              <span>Transmitir Todos Agora</span>
            </button>
          </div>

          {/* Tabela de Logs na Fila */}
          <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950 shadow-md">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[0.62rem] border-b border-white/10">
                <tr>
                  <th className="py-3 px-3">ID</th>
                  <th className="py-3 px-3">Data/Hora</th>
                  <th className="py-3 px-3">Setor</th>
                  <th className="py-3 px-3">Atividade / Rua</th>
                  <th className="py-3 px-3">Colaborador</th>
                  <th className="py-3 px-3 text-right">Volumes</th>
                  <th className="py-3 px-3 text-right">Horas</th>
                  <th className="py-3 px-3 text-right">Vol/h</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {unsyncedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2 opacity-60" />
                      <p className="text-xs font-bold text-slate-300">Fila 100% Sincronizada!</p>
                      <p className="text-[0.65rem]">Todos os apontamentos locais foram transmitidos para a nuvem.</p>
                    </td>
                  </tr>
                ) : (
                  unsyncedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-2.5 px-3 text-slate-500 text-[0.65rem]">
                        #{log.id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {log.data}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">
                        Setor {log.setor || '87'}
                      </td>
                      <td className="py-2.5 px-3 text-white font-bold">
                        {log.atividade}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {log.colaborador}
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-300 font-black">
                        {log.volumes}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {log.horas}h
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                        {log.vph}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.6rem] font-bold">
                          Pendente
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!apiUrl) {
                              onAddToast('URL da planilha não configurada.', 'var(--color-danger)');
                              return;
                            }
                            onAddToast(`Transmitindo log #${log.id}...`, 'var(--color-info)');
                            const ok = await postLogWithRetry(apiUrl, log);
                            if (ok) {
                              log.synced = true;
                              await saveLog(log);
                              loadLocalData();
                              onAddToast(`Log #${log.id} enviado com sucesso!`, 'var(--color-success)');
                            } else {
                              onAddToast(`Falha ao transmitir #${log.id}.`, 'var(--color-danger)');
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-slate-900 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border border-white/15 text-[0.6rem] font-bold uppercase transition-all cursor-pointer"
                        >
                          Enviar Agora
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 5: MODO TV, DISPOSITIVOS & DIAGNÓSTICO */}
      {/* ========================================================= */}
      {activeTab === 'ferramentas' && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Card de Atalho para as Centrais de Sincronização */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <span>Centrais de Sincronização &amp; Armazenamento</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold border ${
                    storageMode === 'hybrid'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      : storageMode === 'sheets'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  }`}>
                    {storageMode === 'hybrid' ? 'Híbrido' : storageMode === 'sheets' ? 'Sheets' : 'Supabase'}
                  </span>
                </h3>
                <p className="text-[0.65rem] text-slate-400">
                  Gerencie as integrações de nuvem nas abas dedicadas do painel de gestão.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <FileSpreadsheet size={13} />
                <span>Google Sheets</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('supabase')}
                className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Database size={13} />
                <span>Supabase Cloud</span>
              </button>
            </div>
          </div>

          {/* 2. Modo Torre TV (Standalone Display) */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-cyan-500/30 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <Tv size={16} className="text-cyan-400" />
                  <span>Modo Torre TV / Painel Standalone em Tela Cheia</span>
                </h3>
                <p className="text-[0.65rem] text-slate-400">
                  URL para televisores de galpão, dashboards executivos ou portais corporativos (Modo Somente Leitura)
                </p>
              </div>

              <a
                href={`${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?view=gestao&standalone=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ExternalLink size={13} />
                <span>Abrir em Nova Janela</span>
              </a>
            </div>

            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider block">
                Link do Painel TV:
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
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin + window.location.pathname}?view=gestao&standalone=true`);
                    onAddToast('URL do Modo TV copiada com sucesso!', 'var(--color-success)');
                  }}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0"
                >
                  <Copy size={13} />
                  <span>Copiar</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Economia de Energia para Coletores Zebra */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-3 font-mono">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-0.5">
                <h3 className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <Clock size={15} className="text-purple-400" />
                  <span>Descanso de Tela / Economia de Bateria em Coletores</span>
                </h3>
                <p className="text-[0.65rem] text-slate-400">
                  Prevenção de consumo de bateria em terminais móveis Zebra após inatividade
                </p>
              </div>

              <button
                type="button"
                onClick={() => updateScreensaverEnabled(!screensaverEnabled, onAddToast)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer transition-all ${
                  screensaverEnabled 
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/25' 
                    : 'bg-slate-900 border border-white/20 text-slate-400 hover:text-white'
                }`}
              >
                <span>{screensaverEnabled ? 'ATIVADO' : 'DESATIVADO'}</span>
              </button>
            </div>

            {screensaverEnabled && (
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <span className="text-[0.65rem] text-slate-400 uppercase font-bold">Tempo Limite:</span>
                {[1, 2, 5, 10, 15].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => updateScreensaverTimeout(mins, onAddToast)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      screensaverTimeout === mins
                        ? 'bg-emerald-500 text-black font-black shadow-sm'
                        : 'bg-slate-900 border border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 6: METAS & ALERTAS DE PRODUTIVIDADE (VPH) */}
      {/* ========================================================= */}
      {activeTab === 'alertas' && (
        <div className="space-y-4 animate-fade-in">
          <VphAlertManagement
            logs={logs}
            selectedDate={selectedDate}
            activeSectorId={activeSectorId}
            onAddToast={onAddToast}
          />
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL MODERNO PARA AJUSTAR META/DEMANDA DA RUA */}
      {/* ========================================================= */}
      {editingDemandStreet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-950 border border-emerald-500/40 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white uppercase">
                    Meta de Rua: {editingDemandStreet.rua}
                  </h3>
                  <p className="text-[0.62rem] text-slate-400">
                    Setor {editingDemandStreet.setor} • Data {targetDateBR}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingDemandStreet(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveDemand} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[0.65rem] font-bold text-slate-300 uppercase tracking-wider block">
                  Demanda Calculada (Caixas / Volumes):
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  value={modalDemandInput}
                  onChange={(e) => setModalDemandInput(e.target.value)}
                  placeholder="Ex: 150"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/20 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingDemandStreet(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/15 text-slate-300 hover:text-white text-xs font-bold uppercase cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase cursor-pointer transition-all shadow-md"
                >
                  Salvar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
