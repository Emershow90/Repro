/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, Cloud, Database, RefreshCw, AlertCircle, LogIn, LogOut, Loader2, Key, HelpCircle, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Log, AppTimerState } from './types';
import {
  initDb,
  getLogs,
  saveLog,
  deleteLog,
  saveState,
  getState,
  clearLogsAndState
} from './services/dbLocal';
import { syncOfflineQueue, fetchFromCloud, postLogWithRetry } from './sheetService';
import { getBackupConfig, executeSupabaseBackupNow } from './services/supabaseBackupService';

import { getWeekNumber, getDayOfWeekName, formatDateToBR, parseDateString, formatTime } from './utils/dateUtils';
import { pdtAudio } from './utils/pdtAudio';
import { EventBus } from './eventBus';
import { useSectorStore, SECTOR_OPTIONS, SECTOR_NAMES } from './stores/sectorStore';
import { useCollaboratorStore } from './stores/collaboratorStore';
import { useUIStore } from './stores/uiStore';
import { useHistoryStore } from './stores/historyStore';
import { TabType } from './stores/uiStore';
import AuthLoginCard from './components/AuthLoginCard';
import DashboardMetrics from './components/DashboardMetrics';
import TemporalFilterBar from './components/TemporalFilterBar';
import StopwatchPanel from './components/StopwatchPanel';
import RankingTable from './components/RankingTable';
import RecentLogsTable from './components/RecentLogsTable';
import VphChart from './components/VphChart';
import BreakdownPanel from './components/BreakdownPanel';
import HistoryTab from './components/HistoryTab';
import WeeklyFollowupTab from './components/WeeklyFollowupTab';
import StreetReplenishmentModule from './components/StreetReplenishmentModule';
import ManagementModule from './components/ManagementModule';
import OfflineReplenishmentAssistant from './components/OfflineReplenishmentAssistant';
import ReabastecimentoGuiado from './features/ReabastecimentoGuiado';
import TvRadarModule from './components/TvRadarModule';
import ArticleAddressAuditModule from './components/ArticleAddressAuditModule';
import ErrorBoundary from './components/ErrorBoundary';

import TabBarBead from './components/TabBarBead';
import FormModalFloatingButton from './components/FormModalFloatingButton';
import { 
  deduplicateLogs, 
  isLogMatchingSector, 
  filterLogsByPeriod, 
  PeriodType, 
  getMonthYearKey, 
  formatDateToPt 
} from './utils/logUtils';
import { 
  LayoutDashboard, 
  History, 
  CalendarClock, 
  User, 
  Shield, 
  ShieldCheck,
  Lock,
  Unlock,
  PackageOpen,
  Monitor, 
  Terminal,
  Filter, 
  Settings, 
  Edit3,
  MapPin,
  Clock,
  Layers,
  FileSpreadsheet,
  Cpu,
  Moon,
  ExternalLink,
  ScanLine,
  Tv
} from 'lucide-react';
import GeneralShiftClosureModal from './components/GeneralShiftClosureModal';
import InitialCheckpointModal from './components/InitialCheckpointModal';
import { isShiftLocked } from './services/shiftClosureService';

const diasDaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function obterSetorDaAtividade(atividade: string): string {
  if (!atividade) return 'outros';
  const name = atividade.toLowerCase();
  if (name.includes('recep') || name.includes('receb') || name.includes('entrada') || name.includes('descarga')) {
    return 'rececao';
  }
  if (name.includes('armazen') || name.includes('arrum') || name.includes('abastec') || name.includes('reposic') || name.includes('reposição')) {
    return 'armazenagem';
  }
  if (name.includes('picking') || name.includes('prep') || name.includes('separ') || name.includes('embal') || name.includes('pack')) {
    return 'picking';
  }
  if (name.includes('exped') || name.includes('carreg') || name.includes('envio') || name.includes('saida') || name.includes('saída')) {
    return 'expedicao';
  }
  if (name.includes('devol') || name.includes('retorno') || name.includes('reversa')) {
    return 'devolucoes';
  }
  return 'outros';
}

interface Toast {
  id: number;
  message: string;
  color: string;
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  
  // Authentication states (Local User or null)
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('repro_local_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loadingUser, setLoadingUser] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(() => localStorage.getItem('repro_guest_mode') === 'true');

  // Zustand Stores
  const { activeSectorId, childActiveSector, updateActiveSector } = useSectorStore();
  const { currentUser, currentRole, activeOperator, updateCurrentUser, updateCurrentRole, setActiveOperator } = useCollaboratorStore();
  const {
    activeTab,
    theme,
    toggleTheme,
    screensaverEnabled,
    screensaverTimeout,
    screensaverActive,
    toasts,
    handleTabChange,
    setScreensaverActive,
    updateScreensaverEnabled: storeUpdateScreensaverEnabled,
    updateScreensaverTimeout: storeUpdateScreensaverTimeout,
    addToast,
    removeToast,
    supabaseLoading,
    setSupabaseLoading
  } = useUIStore();
  const {
    logs,
    lastSyncTime,
    isSyncing,
    isImporting,
    networkStatus,
    setLogs,
    setNetworkStatus,
    setLastSyncTime,
    setIsSyncing,
    setIsImporting,
  } = useHistoryStore();

  const defaultSheetUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SHEETS_API_URL) || 'https://script.google.com/macros/s/AKfycbwMnOu5j1J_8WK_hY5SZkvKNIgQflJgDcXPTIOghTwo7zo7-kNdhFRFXqDKFOQyVtw/exec';

  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('repro_sheets_api_url');
    if (!saved || saved.includes('2PACX-1vTy_lfMaDqE48mRuMZJ_nBP2R4qbDG7wYEA3vtIeHOhMTTxjYHPZzGPcJrWvaIokP0EaRrMGf_1UoP2') || saved.includes('AKfycbyuTz4pZYeqgFd0P0BnmoTGfJIKtN9Cw2gwfspIqKbLFRUpjLyBJEeqBe0tfqk85cxu-w')) {
      localStorage.setItem('repro_sheets_api_url', defaultSheetUrl);
      return defaultSheetUrl;
    }
    return saved;
  });


  const [showHelpModal, setShowHelpModal] = useState(false);

  const isSyncingRef = useRef(false);
  const lastAutoSyncTimeRef = useRef(0);
  const apiUrlRef = useRef(apiUrl);
  apiUrlRef.current = apiUrl;
  const userRef = useRef(user);
  userRef.current = user;
  
  const [timerState, setTimerState] = useState<AppTimerState>({
    cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
    rascunhoColab: '',
    rascunhoVol: ''
  });
  const [panelSubTab, setPanelSubTab] = useState<'repro' | 'ruas'>('repro');
  const [inputOpen, setInputOpen] = useState(false);
  const [ticks, setTicks] = useState(0);

  // Estados de Fechamento Geral de Turno & Travamento de Edição
  const [isShiftLockedToday, setIsShiftLockedToday] = useState<boolean>(() => isShiftLocked());
  const [isGeneralClosureModalOpen, setIsGeneralClosureModalOpen] = useState<boolean>(false);
  const [isInitialCheckpointModalOpen, setIsInitialCheckpointModalOpen] = useState<boolean>(false);
  const [existingCheckpointLog, setExistingCheckpointLog] = useState<Log | null>(null);

  const refreshShiftState = useCallback(() => {
    const todayBR = formatDateToBR(new Date());
    setIsShiftLockedToday(isShiftLocked(todayBR));
  }, []);

  // Contagem regressiva para Backup Automático do IndexedDB (Padrão: 5 minutos = 300 segundos)
  const AUTO_BACKUP_INTERVAL_SECS = 300;
  const [backupCountdown, setBackupCountdown] = useState<number>(AUTO_BACKUP_INTERVAL_SECS);
  const [isDbBackingUp, setIsDbBackingUp] = useState<boolean>(false);

  // Executa o Backup no IndexedDB
  const handleTriggerIndexedDbBackup = useCallback(async (isAuto = false) => {
    if (!dbReady || isDbBackingUp) return;
    setIsDbBackingUp(true);
    try {
      const currentLogs = await getLogs();
      const backupPayload = {
        timestamp: Date.now(),
        dateStr: new Date().toISOString(),
        totalLogs: currentLogs.length,
        logs: currentLogs
      };
      await saveState('indexeddb_auto_backup_snapshot', backupPayload);
      await saveState('indexeddb_last_backup_ts', Date.now());
      
      pdtAudio.playSuccessChime();
      addToast(
        isAuto 
          ? `✓ Backup automático do IndexedDB realizado (${currentLogs.length} registros).` 
          : `✓ Backup manual do IndexedDB realizado com sucesso (${currentLogs.length} registros).`, 
        'var(--color-success)'
      );
      setBackupCountdown(AUTO_BACKUP_INTERVAL_SECS);
    } catch (err) {
      addToast('Erro ao gravar snapshot de backup no IndexedDB.', 'var(--color-danger)');
    } finally {
      setIsDbBackingUp(false);
    }
  }, [dbReady, isDbBackingUp, addToast]);

  // Rotina de Backup Automático de Snapshots no Supabase (se habilitado pelo gestor)
  useEffect(() => {
    if (!dbReady) return;
    const checkAndRunCloudBackup = async () => {
      try {
        const cfg = await getBackupConfig();
        if (cfg.autoBackupEnabled && cfg.url && cfg.anonKey) {
          const lastTs = cfg.lastBackupAt ? new Date(cfg.lastBackupAt).getTime() : 0;
          const intervalMs = (cfg.autoBackupIntervalMinutes || 60) * 60 * 1000;
          if (Date.now() - lastTs >= intervalMs) {
            const res = await executeSupabaseBackupNow();
            addToast(`☁️ Backup automático do Supabase salvo com sucesso (${res.snapshot?.counts.logs || 0} registros).`, 'var(--color-success)');
          }
        }
      } catch (err) {
        console.warn('Ciclo de backup automático no Supabase:', err);
      }
    };

    const timer = setInterval(checkAndRunCloudBackup, 60000);
    return () => clearInterval(timer);
  }, [dbReady, addToast]);

  // Detecção de Modo Standalone / Iframe / TV para visualização externa
  const isStandaloneMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('standalone') === 'true' || params.get('embed') === 'true' || params.get('mode') === 'tv';
  }, []);

  // Parallax mouse position tracking for organic ambient effect
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 35;
      const y = (e.clientY / innerHeight - 0.5) * 35;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);



  // Temporal Filter State for Dashboard
  const [temporalPeriod, setTemporalPeriod] = useState<PeriodType>('todos');
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateToPt(new Date()));
  const [selectedWeek, setSelectedWeek] = useState<number>(() => getWeekNumber(new Date()));
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => getMonthYearKey(formatDateToPt(new Date())));

  // 1. Clean deduplicated logs (no repetitive records)
  const cleanLogs = useMemo(() => {
    return deduplicateLogs(logs);
  }, [logs]);

  // Available weeks & months derived from clean data
  const availableWeeks = useMemo(() => {
    return Array.from(new Set(cleanLogs.map(l => Number(l.semana)))).sort((a, b) => Number(b) - Number(a));
  }, [cleanLogs]);

  const availableMonths = useMemo(() => {
    return Array.from(new Set(cleanLogs.map(l => getMonthYearKey(l.data)).filter((k): k is string => Boolean(k)))).sort();
  }, [cleanLogs]);

  // 2. Filter by sector (handles 87 solo, 88_89_90 unified, and todos)
  const sectorLogs = useMemo(() => {
    return cleanLogs.filter(log => isLogMatchingSector(log.setor, activeSectorId, log.atividade));
  }, [cleanLogs, activeSectorId]);

  // 3. Filter by temporal period (diario, semanal, mensal, todos)
  const filteredLogs = useMemo(() => {
    return filterLogsByPeriod(sectorLogs, temporalPeriod, selectedDate, selectedWeek, selectedMonthKey);
  }, [sectorLogs, temporalPeriod, selectedDate, selectedWeek, selectedMonthKey]);





  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online');
      addToast("Dispositivo restabeleceu a ligacao à rede.", 'var(--color-success)');
      sincronizarFila(false);
    };
    const handleOffline = () => {
      setNetworkStatus('offline');
      addToast("Dispositivo offline. Fila de sincronizacao retida.", 'var(--color-warning)');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setNetworkStatus(navigator.onLine ? 'online' : 'offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize DB and load session state
  useEffect(() => {
    async function setup() {
      try {
        await initDb();
        setDbReady(true);
        
        // Recover previous timer and draft states
        const saved = await getState('timerStateDual') as any;
        if (saved) {
          if (!saved.cronometro && (saved.direta || saved.indireta)) {
            const cronometro = saved.direta?.ativo ? saved.direta : (saved.indireta?.ativo ? { ...saved.indireta, tipo: 'indireta' } : { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' });
            setTimerState({
              cronometro: cronometro,
              rascunhoColab: saved.rascunhoColabDir || saved.rascunhoColab || '',
              rascunhoVol: saved.rascunhoVolDir || saved.rascunhoVol || ''
            });
            if (saved.rascunhoVolDir || saved.rascunhoVol) {
              setInputOpen(true);
            }
          } else {
            setTimerState({
              cronometro: saved.cronometro || { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
              rascunhoColab: saved.rascunhoColab || '',
              rascunhoVol: saved.rascunhoVol || ''
            });
            if (saved.rascunhoVol) {
              setInputOpen(true);
            }
          }
        }

        // Migrate legacy buffer
        if (localStorage.getItem('terminal_repro_v2')) {
          try {
            const oldDb = JSON.parse(localStorage.getItem('terminal_repro_v2')!);
            addToast("A migrar dados legado para IndexedDB...", 'var(--color-warning)');
            for (const l of oldDb.logs) {
              const logType = String(l.atividade).startsWith("IND:") ? 'indireta' : 'direta';
              l.tipo = logType;
              await saveLog(l);
            }
            localStorage.removeItem('terminal_repro_v2');
            addToast("Dados integrados com sucesso!", 'var(--color-success)');
          } catch (err) {
            console.error("Migration error", err);
          }
        }

        const loadedLogs = await getLogs();
        setLogs(loadedLogs);
      } catch (err) {
        console.error("Failed to initialize IndexedDB", err);
        addToast("Falha ao inicializar a Base de Dados Local.", 'var(--color-danger)');
      }
    }
    setup();

    // Subscribe to EventBus
    EventBus.on('ATIVIDADE_FINALIZADA', (log) => {
      addToast(`Notificando Torre de Comando: ${log.atividade}`, 'var(--color-info)');
    });
  }, []);

  // Timer interval to increment elapsed seconds & Auto-Backup Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTicks(t => t + 1);
      setBackupCountdown(prev => (prev <= 1 ? AUTO_BACKUP_INTERVAL_SECS : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const lastBackupTickRef = useRef<number>(0);
  const lastWarningTickRef = useRef<number>(0);

  // Handle countdown triggers (10s warning and automated execution)
  useEffect(() => {
    if (backupCountdown === 10 && lastWarningTickRef.current !== ticks) {
      lastWarningTickRef.current = ticks;
      addToast("💾 Próximo backup automático do IndexedDB em 10 segundos...", 'var(--color-info)');
      pdtAudio.playAttentionReminder();
    } else if (backupCountdown === AUTO_BACKUP_INTERVAL_SECS && ticks > 1 && lastBackupTickRef.current !== ticks) {
      lastBackupTickRef.current = ticks;
      handleTriggerIndexedDbBackup(true);
    }
  }, [backupCountdown, ticks, addToast, handleTriggerIndexedDbBackup]);

  // Update seconds based on high precision math reference, auto-saving every 5 seconds
  useEffect(() => {
    if (!dbReady) return;
    setTimerState(prev => {
      let changed = false;
      const updated = { ...prev };
      
      if (prev.cronometro?.ativo) {
        const secs = Math.floor((Date.now() - prev.cronometro?.inicio) / 1000);
        if (secs !== prev.cronometro?.segundos) {
          updated.cronometro = { ...prev.cronometro, segundos: secs };
          changed = true;
        }
      }
      
      // Secure background Auto-Save draft state to DB every 5 seconds
      if (ticks > 0 && ticks % 5 === 0) {
        saveState('timerStateDual', prev);
        // Visual cue of secure save
        const autoSaveVisual = document.getElementById('visual-cue-save');
        if (autoSaveVisual) {
          autoSaveVisual.style.opacity = '1';
          setTimeout(() => { autoSaveVisual.style.opacity = '0'; }, 800);
        }
      }

      if (changed) return updated;
      return prev;
    });
  }, [ticks, dbReady]);

  // Monitoramento de Encerramento do Turno e Checkpoint de Início
  useEffect(() => {
    if (!dbReady) return;
    const todayBR = formatDateToBR(new Date());
    const todayISO = new Date().toISOString().slice(0, 10);
    
    // Atualiza estado de travamento de turno
    setIsShiftLockedToday(isShiftLocked(todayBR));

    // Busca se já existe checkpoint de início hoje
    const cpLog = logs.find(l => 
      (l.data === todayBR || l.data === todayISO) && 
      l.atividade?.toUpperCase().includes('INÍCIO_DIA')
    );
    setExistingCheckpointLog(cpLog || null);

    // Se não há checkpoint registrado hoje, não foi dispensado pelo operador e o turno não está finalizado:
    const dismissed = localStorage.getItem(`repro_checkpoint_dismissed_${todayBR}`) === 'true';
    if (!cpLog && !dismissed && !isShiftLocked(todayBR)) {
      setIsInitialCheckpointModalOpen(true);
    }
  }, [dbReady, logs]);

  // Sincronização Bidirecional Multi-Dispositivo (PDT ↔ PC ↔ Google Sheets / Nuvem)
  const syncMultiDevice = useCallback(async (options: { silent?: boolean; forceAlert?: boolean } = {}) => {
    const { silent = false, forceAlert = false } = options;
    const currentApiUrl = apiUrlRef.current;
    const currentUserObj = userRef.current;

    if (isSyncingRef.current) return;

    // Se for sincronização automática silenciosa em background, garante intervalo de segurança
    const nowMs = Date.now();
    if (silent && !forceAlert && nowMs - lastAutoSyncTimeRef.current < 15000) {
      return;
    }

    if (!navigator.onLine) {
      setNetworkStatus('offline');
      if (forceAlert) {
        addToast("Sem ligação à Internet. Sincronização retida localmente.", 'var(--color-warning)');
      }
      return;
    }
    setNetworkStatus('online');

    if (!currentApiUrl) {
      if (forceAlert) {
        addToast("URL da planilha Google não configurada em Gestão & Sheets.", 'var(--color-warning)');
      }
      return;
    }

    isSyncingRef.current = true;
    lastAutoSyncTimeRef.current = nowMs;
    setIsSyncing(true);

    if (!silent) {
      addToast("Sincronizando com a planilha e outros terminais...", 'var(--color-info)');
    }

    try {
      // 1. Enviar registros pendentes locais para a planilha / nuvem
      const queueResult = await syncOfflineQueue(currentApiUrl);

      // 2. Buscar registros remotos recentes (gerados por outros PDTs ou PCs)
      let importedCount = 0;
      try {
        const cloudLogs = await fetchFromCloud(currentApiUrl, currentUserObj?.id || currentUserObj?.uid);
        const localLogs = await getLogs();
        const localIds = new Set(localLogs.map(l => String(l.id)));
        const localSignatures = new Set(localLogs.map(l => `${l.data}_${l.setor}_${l.colaborador}_${l.atividade}_${l.horas}_${l.volumes}`));

        for (const remote of cloudLogs) {
          const remoteIdStr = String(remote.id);
          const remoteSig = `${remote.data}_${remote.setor}_${remote.colaborador}_${remote.atividade}_${remote.horas}_${remote.volumes}`;

          if (!localIds.has(remoteIdStr) && !localSignatures.has(remoteSig)) {
            await saveLog({ ...remote, synced: true });
            importedCount++;
          }
        }
      } catch (pullErr) {
        console.warn("Pull remoto em segundo plano:", pullErr);
      }

      // 3. Atualizar estado com todos os logs locais unificados
      const refreshedLogs = await getLogs();
      setLogs(refreshedLogs);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);

      if (!silent) {
        if (importedCount > 0 || queueResult.successCount > 0) {
          addToast(`Sincronizado! ${queueResult.successCount} enviados, ${importedCount} recebidos de outros dispositivos.`, 'var(--color-success)');
        } else if (forceAlert) {
          addToast("Base já sincronizada com a nuvem e outras máquinas.", 'var(--color-info)');
        }
      } else if (importedCount > 0) {
        addToast(`📡 ${importedCount} novo(s) registro(s) recebido(s) de outro terminal!`, 'var(--color-success)');
      }
    } catch (err: any) {
      console.error('Erro na sincronização multi-dispositivo:', err);
      if (!silent || forceAlert) {
        addToast(`Falha ao sincronizar: ${err?.message || 'Erro de conexão'}`, 'var(--color-danger)');
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [setNetworkStatus, addToast, setLogs, setLastSyncTime, setIsSyncing]);

  // Synchronize queue wrapper for backward compatibility
  const sincronizarFila = useCallback(async (forcarAlerta = false) => {
    await syncMultiDevice({ silent: !forcarAlerta, forceAlert: forcarAlerta });
  }, [syncMultiDevice]);

  // Trigger import from Google Sheets wrapper
  const importarPlanilha = useCallback(async () => {
    await syncMultiDevice({ silent: false, forceAlert: true });
  }, [syncMultiDevice]);

  // Intervalo de Sincronização Automática em Segundo Plano (Multi-Máquinas Online)
  useEffect(() => {
    if (!apiUrl || !dbReady) return;

    // Sincronização inicial silenciosa
    syncMultiDevice({ silent: true });

    // Sincronização periódica a cada 30 segundos
    const syncInterval = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        syncMultiDevice({ silent: true });
      }
    }, 30000);

    // Sincronização ao retornar para a janela ou reconectar
    const handleFocus = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        syncMultiDevice({ silent: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [apiUrl, dbReady, syncMultiDevice]);

  // Retry synchronization for a single log
  const handleRetrySyncLog = async (log: Log) => {
    if (!apiUrl) {
      addToast("Introduza a URL do Google Sheets nas configurações.", 'var(--color-danger)');
      return;
    }
    addToast(`A reenviar o registo #${log.id}...`, 'var(--color-info)');
    try {
      const success = await postLogWithRetry(apiUrl, log);
      if (success) {
        const updatedLog: Log = { ...log, synced: true };
        await saveLog(updatedLog);
        setLogs(prev => prev.map(l => l.id === log.id ? updatedLog : l));
        addToast(`Registo #${log.id} sincronizado com sucesso na planilha Google!`, 'var(--color-success)');
      } else {
        addToast(`Falha ao sincronizar o registo #${log.id}. Verifique a ligação.`, 'var(--color-danger)');
      }
    } catch (err) {
      console.error('Error retrying log sync:', err);
      addToast(`Erro ao tentar sincronizar o registo #${log.id}.`, 'var(--color-danger)');
    }
  };

  // Direct Stopwatches controllers

  const getDiaDaSemana = () => {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return dias[new Date().getDay()];
  };

  const saveLogAndSync = async (log: Log) => {
    // Verificação de travamento de edição pós-fechamento consciente
    const isClosureLog = log.atividade?.toUpperCase().includes('FECHAMENTO GERAL DE TURNO');
    const isCheckpointLog = log.atividade?.toUpperCase().includes('INÍCIO_DIA');
    if (!isClosureLog && !isCheckpointLog && isShiftLocked(log.data)) {
      addToast(`O turno do dia ${log.data} está FINALIZADO e com edições travadas. Reabra o turno no cabeçalho se precisar fazer novos lançamentos.`, 'var(--color-warning)');
      pdtAudio.playScanError();
      return;
    }

    await saveLog(log);
    setLogs(prev => [log, ...prev]);
    
    if (apiUrl && networkStatus === 'online') {
      const isSuccess = await postLogWithRetry(apiUrl, log);
      if (isSuccess) {
        log.synced = true;
        await saveLog(log);
        setLogs(prev => prev.map(l => l.id === log.id ? log : l));
        setLastSyncTime(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }
  };

  const handleSaveStreetLog = async (newLog: Log) => {
    // Verificação de travamento de edição pós-fechamento consciente
    if (isShiftLocked(newLog.data)) {
      addToast(`O turno do dia ${newLog.data} está FINALIZADO e com edições travadas. Reabra o turno no cabeçalho para registrar novos apontamentos.`, 'var(--color-warning)');
      pdtAudio.playScanError();
      return;
    }

    await saveLog(newLog);
    setLogs(prev => [newLog, ...prev]);
    addToast(`Apontamento da ${newLog.rua || 'Rua'} guardado com sucesso!`, 'var(--color-success)');
    
    if (apiUrl && networkStatus === 'online') {
      postLogWithRetry(apiUrl, newLog, user?.id || user?.uid).then(async (success) => {
        if (success) {
          const syncedLog = { ...newLog, synced: true };
          await saveLog(syncedLog);
          setLogs(prev => prev.map(l => l.id === newLog.id ? syncedLog : l));
          setLastSyncTime(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      }).catch(err => console.error("Cloud post error:", err));
    }
  };

  const startTimer = (activity: string, btnId: string, tipo: 'direta' | 'indireta') => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro.ativo = true;
      updated.cronometro.atividade = activity;
      updated.cronometro.botaoId = btnId;
      updated.cronometro.tipo = tipo;
      updated.cronometro.inicio = Date.now() - (prev.cronometro?.segundos * 1000);
      return updated;
    });
    setInputOpen(false);
  };

  const pauseTimer = () => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro.ativo = false;
      return updated;
    });
    addToast("Registo suspenso.", 'var(--color-warning)');
  };

  const stopTimer = () => {
    pauseTimer();
    if (timerState.cronometro?.segundos === 0) {
      addToast("Nenhum tempo registado.", 'var(--color-danger)');
      return;
    }
    setInputOpen(true);
  };

  const cancelTimer = () => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro = { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' };
      updated.rascunhoVol = '';
      return updated;
    });
    setInputOpen(false);
    addToast("Registo cancelado.", 'var(--color-danger)');
  };

  const saveTimer = async (
    colab: string, 
    volumes: number, 
    customHours?: number, 
    horaInicio?: string, 
    horaFim?: string
  ) => {
    const defaultDecimalHours = (timerState.cronometro?.segundos || 0) / 3600;
    const decimalHours = (customHours !== undefined && customHours > 0) ? customHours : defaultDecimalHours;
    
    if (!colab.trim()) {
      addToast("Operador não definido.", 'var(--color-danger)');
      return;
    }

    const todayDate = new Date();
    const newLog: Log = {
      id: Date.now(),
      data: formatDateToBR(todayDate),
      dia: getDayOfWeekName(todayDate),
      semana: getWeekNumber(todayDate),
      atividade: timerState.cronometro?.tipo === 'indireta' ? `IND: ${timerState.cronometro?.atividade}` : timerState.cronometro?.atividade,
      colaborador: colab.toUpperCase(),
      volumes: volumes,
      horas: Number(decimalHours.toFixed(2)),
      vph: (decimalHours > 0 && volumes > 0 && timerState.cronometro?.tipo === 'direta') ? (volumes / decimalHours).toFixed(2) : "0.00",
      timestamp: Date.now(),
      synced: false,
      tipo: timerState.cronometro?.tipo,
      setor: activeSectorId,
      horaInicio: horaInicio || undefined,
      horaFim: horaFim || undefined
    };

    await saveLogAndSync(newLog);

    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro = { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' };
      updated.rascunhoVol = '';
      return updated;
    });
    setInputOpen(false);
    addToast("Registo gravado com sucesso!", 'var(--color-success)');
  };

  const handleSaveManualLog = async (entry: {
    data: string;
    setor: string;
    atividade: string;
    colaborador: string;
    volumes: number;
    horas: number;
    horaInicio?: string;
    horaFim?: string;
    tipo: 'direta' | 'indireta';
  }) => {
    if (!entry.colaborador.trim()) {
      addToast("Operador não definido.", 'var(--color-danger)');
      return;
    }
    if (entry.horas <= 0) {
      addToast("Duração em horas deve ser maior que zero.", 'var(--color-danger)');
      return;
    }

    const parsedDate = parseDateString(entry.data) || new Date();
    const decimalHours = entry.horas;
    const isDirect = entry.tipo === 'direta';

    const newLog: Log = {
      id: Date.now(),
      data: formatDateToBR(parsedDate),
      dia: getDayOfWeekName(parsedDate),
      semana: getWeekNumber(parsedDate),
      atividade: entry.tipo === 'indireta' && !entry.atividade.toUpperCase().startsWith('IND:') ? `IND: ${entry.atividade}` : entry.atividade,
      colaborador: entry.colaborador.toUpperCase(),
      volumes: isDirect ? entry.volumes : 0,
      horas: Number(decimalHours.toFixed(2)),
      vph: (decimalHours > 0 && entry.volumes > 0 && isDirect) ? (entry.volumes / decimalHours).toFixed(2) : "0.00",
      timestamp: Date.now(),
      synced: false,
      tipo: entry.tipo,
      setor: entry.setor || activeSectorId,
      horaInicio: entry.horaInicio || undefined,
      horaFim: entry.horaFim || undefined
    };

    await saveLogAndSync(newLog);
    addToast("Registo manual gravado com sucesso!", 'var(--color-success)');
  };

  const handleDeleteLog = async (id: number) => {
    const logToDelete = logs.find(l => l.id === id);
    if (logToDelete && isShiftLocked(logToDelete.data)) {
      addToast(`O turno do dia ${logToDelete.data} está FINALIZADO e com edições travadas. Reabra o turno no cabeçalho antes de remover registros.`, 'var(--color-warning)');
      pdtAudio.playScanError();
      return;
    }

    if (confirm("Deseja remover este registo permanentemente?")) {
      await deleteLog(id);
      addToast("Registo removido localmente.", 'var(--color-warning)');
      
      const refreshedLogs = await getLogs();
      setLogs(refreshedLogs);
    }
  };

  // CSV backup exporter
  const handleExportBackup = () => {
    if (logs.length === 0) {
      addToast("Base de dados vazia.", 'var(--color-danger)');
      return;
    }
    const headers = "ID,Data,Dia,Semana,Atividade,Colaborador,Volume,Horas,VPH,Synced,Tipo\n";
    const rows = logs.map(l => 
      `${l.id},${l.data},${l.dia},${l.semana},${l.atividade},${l.colaborador},${l.volumes},${l.horas.toFixed(2)},${l.vph},${l.synced},${l.tipo || 'direta'}`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Backup_IndexedDB_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Backup CSV descarregado com sucesso!", 'var(--color-info)');
  };

  // Clear Database
  const handleClearDb = async () => {
    if (confirm("ALERTA DE SEGURANÇA: Esta acao apaga permanentemente todo o historico e rascunhos. Continuar?")) {
      await clearLogsAndState();
      
      setTimerState({
        cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
        rascunhoColab: '',
        rascunhoVol: ''
      });
      
      setLogs([]);
      addToast("Base de dados local redefinida com sucesso.", 'var(--color-danger)');
    }
  };

  // API URL update handler
  const handleApiUrlChange = (valOrEvent: string | ChangeEvent<HTMLInputElement>) => {
    const val = typeof valOrEvent === 'string' ? valOrEvent.trim() : valOrEvent.target.value.trim();
    setApiUrl(val);
    localStorage.setItem('repro_sheets_api_url', val);
    if (val) {
      addToast("URL de ligação guardada localmente.", 'var(--color-success)');
      setTimeout(() => sincronizarFila(true), 150);
    } else {
      addToast("URL da planilha removida.", 'var(--color-warning)');
    }
  };

  // Computed counts for visual status indicators
  const syncedCount = logs.filter(l => l.synced).length;
  const unsyncedCount = logs.length - syncedCount;

  // List of collaborators to show as autocomplete helper
  const colabHistory: string[] = Array.from(new Set(logs.map(l => l.colaborador)));

  // System diagnostic and restore procedure
  const handleRestoreSystem = async () => {
    setIsSyncing(true);
    addToast("Iniciando restauração e diagnóstico do sistema...", 'var(--color-info)');
    try {
      await initDb();
      const localLogs = await getLogs();
      setLogs(localLogs);

      // Reset any broken timer state
      await saveState('appState', {
        cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
        rascunhoColab: '',
        rascunhoVol: ''
      });
      setTimerState({
        cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
        rascunhoColab: '',
        rascunhoVol: ''
      });
      setInputOpen(false);

      if (networkStatus === 'online') {
        if (apiUrl) {
          await sincronizarFila(false);
        }
      }

      setLastSyncTime(new Date().toLocaleTimeString('pt-PT'));
      addToast("✅ Sistema 100% restaurado! Base sincronizada e estável.", 'var(--color-success)');
    } catch (err: any) {
      console.error("Erro na restauração:", err);
      addToast(`Falha na restauração: ${err.message || 'Erro de conexão'}`, 'var(--color-danger)');
    } finally {
      setIsSyncing(false);
    }
  };

  // Detecção de Modo TV Direto (URL ?mode=tv ou ?tv=1) - Acesso público sem barreira de login para Smart TVs
  const isTvParamDirect = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'tv' || params.get('tv') === 'true' || params.get('tv') === '1';
  }, []);

  if (isTvParamDirect) {
    return (
      <TvRadarModule
        isStandalone={true}
        onClose={() => {
          window.location.href = window.location.pathname;
        }}
      />
    );
  }

  if (loadingUser) {
    return (
      <div className="terminal-root min-h-screen flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center border border-white/10 p-8 rounded-2xl bg-slate-900/90 shadow-2xl backdrop-blur-xl">
          <Loader2 className="animate-spin text-emerald-400" size={36} />
          <p className="font-mono text-xs text-slate-300 tracking-widest uppercase animate-pulse">
            Carregando Sistema Operacional...
          </p>
        </div>
      </div>
    );
  }

  const isAuthUnlocked = Boolean(user || isGuestMode);

  // Filter tabs based on auth status
  const navigationTabs = useMemo(() => {
    const allTabs = [
      { id: 'cronometro', label: 'Cronômetro', icon: <Clock size={15} /> },
      { id: 'ruas', label: 'Reabastecimento por Rua', icon: <MapPin size={15} /> },
      { id: 'artigos', label: 'Artigos & Auditoria CTN', icon: <FileSpreadsheet size={15} /> },
      { id: 'tv', label: 'Modo TV (Rastreio Ao Vivo)', icon: <Tv size={15} /> },
      { id: 'apoio', label: 'Apoio Reabastecimento', icon: <ScanLine size={15} /> },
      { id: 'gestao', label: 'Gestão & Sheets', icon: <Layers size={15} /> },
      { id: 'painel', label: 'Painel Gráfico', icon: <LayoutDashboard size={15} /> },
      { id: 'historico', label: 'Histórico de Logs', icon: <History size={15} /> },
      { id: 'followup', label: 'Follow-up Semanal', icon: <CalendarClock size={15} /> }
    ];

    if (!isAuthUnlocked) {
      return allTabs.filter(tab => !['gestao', 'followup'].includes(tab.id));
    }
    return allTabs;
  }, [isAuthUnlocked]);

  const activeTabDetails = navigationTabs.find(t => t.id === activeTab) || navigationTabs[0];

  // Global keyboard shortcut for AS/400 Theme & Functions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F24 or Alt+T for switching theme
      if (e.key === 'F24' || (e.altKey && (e.key === 't' || e.key === 'T'))) {
        e.preventDefault();
        toggleTheme(addToast);
      }
      // F5 custom refresh
      if (e.key === 'F5' && e.ctrlKey) {
        // allow normal browser hard reload
      } else if (e.key === 'F5') {
        e.preventDefault();
        sincronizarFila(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme, addToast, sincronizarFila]);

  return (
    <div className={`terminal-root ${theme === 'as400' ? 'theme-as400' : ''} p-2 flex flex-col items-center relative overflow-hidden min-h-screen`}>
      
      {/* ... (Keep background spheres as is) ... */}
      
      {/* Dynamic Parallax Floating Background Spheres (Disabled in AS/400 mode) */}
      {theme !== 'as400' && (
        <>
          <div 
            className="parallax-orb parallax-orb-1"
            style={{
              transform: `translate3d(${mousePos.x * 0.8}px, ${mousePos.y * 0.8}px, 0)`
            }}
          />
          <div 
            className="parallax-orb parallax-orb-2"
            style={{
              transform: `translate3d(${-mousePos.x * 1.2}px, ${-mousePos.y * 1.2}px, 0)`
            }}
          />
          <div 
            className="parallax-orb parallax-orb-3"
            style={{
              transform: `translate3d(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px, 0)`
            }}
          />
        </>
      )}

      {/* Global Toast Alert stack overlay */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="toast-custom border-l-4 select-all pointer-events-auto"
            style={{ borderColor: t.color }}
          >
            &gt; {t.message}
          </div>
        ))}
      </div>

      <div className="w-full max-w-6xl space-y-4 relative z-10">
        
        {/* NOVO CABEÇALHO REESTRUTURADO // REPRO COMMAND COCKPIT */}
        <header className="repro-card-elevated p-3.5 sm:p-4 rounded-2xl shadow-2xl space-y-3 relative overflow-hidden">
          {/* Top Line: Brand identity + Sector badge + System quick actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping absolute opacity-60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-mono text-sm sm:text-base font-black text-white tracking-widest uppercase">
                      REPRO // <span className="text-emerald-400">TORRE 5.0</span>
                    </h1>
                    <span className="badge-emerald">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[0.62rem] text-slate-400 font-sans">
                    Terminal de Reabastecimento &amp; Controle Operacional de Produtividade
                  </p>
                </div>
              </div>

              {/* Setor Ativo Quick Selector Pills */}
              <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-mono">
                <span className="text-slate-400 text-[0.55rem] uppercase px-1.5 font-bold">Setor:</span>
                {SECTOR_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateActiveSector(opt.id, addToast)}
                    className={`px-2 py-0.5 rounded-lg text-[0.62rem] font-bold transition-all cursor-pointer ${
                      activeSectorId === opt.id
                        ? 'bg-emerald-500 text-black shadow-sm font-black'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={opt.description}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Status Badges & Quick Actions */}
            <div className="flex items-center gap-2">
              {/* Checkpoint de Início (Abertura / Saldo Inicial de Caixas) */}
              <button
                id="btn-header-checkpoint-inicio"
                type="button"
                onClick={() => setIsInitialCheckpointModalOpen(true)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  existingCheckpointLog
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                }`}
                title={
                  existingCheckpointLog
                    ? `Checkpoint Inicial gravado (${existingCheckpointLog.volumes} caixas). Clique para consultar ou atualizar.`
                    : 'Registrar Checkpoint de Início (Saldo de caixas na fila antes de começar)'
                }
              >
                <PackageOpen size={13} className={existingCheckpointLog ? 'text-emerald-400' : 'text-slate-400'} />
                <span className="hidden lg:inline text-[0.65rem] font-bold">
                  {existingCheckpointLog ? `Início: ${existingCheckpointLog.volumes} cx` : 'Checkpoint'}
                </span>
              </button>

              {/* Função Finalizar Turno Geral / Badge de Travamento 'TURNO FINALIZADO' */}
              {isShiftLockedToday ? (
                <button
                  id="btn-header-turno-finalizado"
                  type="button"
                  onClick={() => setIsGeneralClosureModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/15 animate-pulse"
                  title="Turno de hoje finalizado e edições travadas. Clique para visualizar o resumo consolidado, exportar CSV ou reabrir o turno."
                >
                  <Lock size={13} className="text-amber-400 shrink-0" />
                  <span className="text-[0.65rem] font-black uppercase tracking-wider">Turno Finalizado</span>
                </button>
              ) : (
                <button
                  id="btn-header-finalizar-turno"
                  type="button"
                  onClick={() => setIsGeneralClosureModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 hover:text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:border-indigo-400 active:scale-95"
                  title="Finalizar Turno Geral: Consolidação de produtividade, verificação de meta, travamento de edição e sincronização garantida"
                >
                  <ShieldCheck size={14} className="text-indigo-400 shrink-0" />
                  <span className="hidden sm:inline text-[0.65rem] font-black uppercase tracking-wider">Finalizar Turno</span>
                </button>
              )}

              {/* Active Stopwatch Ticker */}
              <button
                type="button"
                onClick={() => handleTabChange('cronometro')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  timerState.cronometro?.ativo
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10 animate-pulse'
                    : (timerState.cronometro?.segundos || 0) > 0
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                }`}
                title={timerState.cronometro?.ativo ? 'Cronômetro em execução - clique para alternar para a aba' : 'Cronômetro pausado / pronto'}
              >
                <Clock size={13} className={timerState.cronometro?.ativo ? 'text-emerald-400 animate-spin' : ''} />
                <span>{timerState.cronometro?.ativo ? formatTime(timerState.cronometro?.segundos || 0) : '00:00:00'}</span>
                {timerState.cronometro?.ativo && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              {/* Botão de Acesso Rápido ao Modo TV */}
              <button
                id="btn-header-modo-tv"
                type="button"
                onClick={() => handleTabChange('tv')}
                className={`px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-all cursor-pointer font-mono font-bold ${
                  activeTab === 'tv'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20 font-black'
                    : 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300'
                }`}
                title="Modo TV: Transmissão em tempo real e rastreio de operacão em qualquer tela"
              >
                <Tv size={13} className={activeTab === 'tv' ? 'text-slate-950' : 'text-cyan-400 animate-pulse'} />
                <span className="hidden sm:inline text-[0.65rem]">Modo TV</span>
              </button>

              {/* Google Sheets Sync Pill */}
              <button
                type="button"
                onClick={() => sincronizarFila(true)}
                disabled={isSyncing}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-500/40 text-xs text-slate-300 hover:text-emerald-300 flex items-center gap-1.5 transition-all cursor-pointer font-mono"
                title="Sincronizar com a Planilha Google (F5)"
              >
                <Cloud size={13} className={isSyncing ? 'animate-spin text-emerald-400' : 'text-slate-400'} />
                <span className="hidden md:inline text-[0.62rem] font-bold">
                  {isSyncing ? 'Sincronizando...' : `${syncedCount}/${logs.length}`}
                </span>
              </button>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={() => toggleTheme(addToast)}
                className="p-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 text-xs transition-all cursor-pointer"
                title="Mudar Tema (Modo Moderno / IBM AS/400) [Alt+T]"
              >
                <Terminal size={14} />
              </button>

              {/* Active Operator Badge */}
              <div 
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono cursor-pointer hover:border-white/20"
                onClick={() => handleTabChange('cronometro')}
                title="Operador Ativo"
              >
                <User size={13} className="text-emerald-400" />
                <span className="text-[0.62rem] font-bold text-slate-200 max-w-[100px] truncate">
                  {activeOperator || 'SEM OPERADOR'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Bar ("Algo Novo") - Segmented capsule dock with icons & active glow */}
          <nav className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-thin pt-0.5">
            <div className="flex items-center gap-1.5 w-full">
              {navigationTabs.map(tab => {
                const isActive = activeTab === tab.id;
                const isTimerActive = tab.id === 'cronometro' && timerState.cronometro?.ativo;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id as TabType)}
                    className={`px-3 py-2 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25 font-black scale-[1.01]'
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-emerald-500/30'
                    }`}
                  >
                    <span className={isActive ? 'text-black' : 'text-emerald-400'}>
                      {tab.icon}
                    </span>
                    <span className="text-[0.65rem] tracking-wider">{tab.label}</span>
                    {isTimerActive && !isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black/70" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </header>



        {/* CONTEÚDO DINÂMICO DE ACORDO COM A ABA ATIVA COM TRANSIÇÃO SUAVE */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full space-y-6"
          >
        
        {/* ABA 1: CRONÔMETRO (ACESSO LIVRE SEM LOGIN) */}
        {activeTab === 'cronometro' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <StopwatchPanel
                  timerState={timerState}
                  colabHistory={colabHistory}
                  inputOpen={inputOpen}
                  onStartTimer={startTimer}
                  onPauseTimer={pauseTimer}
                  onStopTimer={stopTimer}
                  onCancelTimer={cancelTimer}
                  onSaveTimer={saveTimer}
                  onSaveManualLog={handleSaveManualLog}
                  activeOperator={activeOperator}
                  onActiveOperatorChange={(op) => {
                    setActiveOperator(op);
                    localStorage.setItem('repro_active_operator', op);
                  }}
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                />
                
                <section className="p-3.5 px-5 rounded-xl border border-white/10 bg-black/40 text-xs backdrop-blur-md">
                  <div className="font-bold tracking-wider uppercase text-center font-mono">
                    <div className="flex flex-col md:flex-row justify-between items-center w-full opacity-80 gap-2">
                      <span className={timerState.cronometro?.ativo ? (timerState.cronometro?.tipo === 'indireta' ? 'text-amber-400' : 'text-emerald-400') : 'text-slate-400'}>
                        {timerState.cronometro?.ativo
                          ? `⏱️ EM EXECUÇÃO: ${timerState.cronometro?.atividade} [${Math.floor((timerState.cronometro?.segundos || 0) / 3600)}h ${(Math.floor(((timerState.cronometro?.segundos || 0) % 3600) / 60))}m]`
                          : (timerState.cronometro?.segundos || 0) > 0
                          ? `⏸️ PAUSADO: [${Math.floor((timerState.cronometro?.segundos || 0) / 3600)}h]`
                          : '⚡ CRONÔMETRO PRONTO'}
                      </span>
                      <span className="text-slate-500 text-[0.6rem]">
                        Setor Ativo: <strong>{activeSectorId}</strong>
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              {/* STATUS DA BASE / SIDEBAR CONFIGS */}
              <div className="space-y-6">
                <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2.5">
                    <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Database size={13} />
                    </div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Status da Base
                    </h2>
                  </div>

                  <div className="space-y-3 text-[0.68rem] font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Armazenamento:</span>
                      <span className="text-emerald-400 font-bold">IndexedDB</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total de Registos:</span>
                      <span className="text-white font-bold">{logs.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Sincronizados:</span>
                      <span className="text-emerald-400 font-bold">{syncedCount}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/10 pt-2.5">
                      <span className="text-amber-400 font-bold">Fila Retida:</span>
                      <span className="text-amber-400 font-black">{unsyncedCount}</span>
                    </div>
                  </div>
                  
                  <div className="mt-5">
                    <button
                      onClick={() => sincronizarFila(true)}
                      disabled={isSyncing}
                      className="w-full btn-primary py-2.5 text-xs font-bold uppercase rounded-xl cursor-pointer flex justify-center items-center gap-2 shadow-lg font-mono disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                      <span>Sincronizar Nuvem</span>
                    </button>
                  </div>
                </section>

                <section className="border-panel p-5 rounded-2xl space-y-3">
                  <h2 className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10 pb-2 font-mono">
                    Backup & Nuvem
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleExportBackup}
                      className="btn-term text-[0.62rem] py-2 uppercase font-bold text-blue-400 border-blue-500/20 hover:border-blue-500/50 rounded-xl cursor-pointer font-mono"
                    >
                      Exportar
                    </button>
                    <button
                      onClick={importarPlanilha}
                      disabled={isImporting}
                      className="btn-term text-[0.62rem] py-2 uppercase font-bold text-blue-400 border-blue-500/20 hover:border-blue-500/50 rounded-xl cursor-pointer flex justify-center items-center gap-1 font-mono"
                    >
                      {isImporting ? 'Lendo...' : 'Importar'}
                    </button>
                  </div>
                  <button
                    onClick={importarPlanilha}
                    disabled={isImporting}
                    className="w-full btn-term border-blue-500/30 text-blue-400 py-2.5 text-[0.62rem] font-bold uppercase rounded-xl hover:bg-blue-500/10 flex justify-center items-center gap-1.5 cursor-pointer disabled:opacity-50 font-mono"
                  >
                    <span>Baixar Dados da Nuvem</span>
                  </button>
                </section>
              </div>
            </div>

            {/* ÚLTIMOS APONTAMENTOS RECENTES DA SESSÃO */}
            <RecentLogsTable
              logs={filteredLogs}
              onDeleteLog={handleDeleteLog}
              onExportBackup={handleExportBackup}
              onClearDb={handleClearDb}
              onRetrySync={handleRetrySyncLog}
              apiUrl={apiUrl}
            />
          </div>
        )}

        {/* ABA 2: REABASTECIMENTO POR RUA (ACESSO LIVRE SEM LOGIN) */}
        {activeTab === 'ruas' && (
          <div className="animate-fade-in">
            <ErrorBoundary fallbackTitle="Módulo de Reabastecimento por Rua">
              <StreetReplenishmentModule
                logs={filteredLogs}
                activeOperator={activeOperator}
                activeSectorId={activeSectorId}
                onSaveLog={handleSaveStreetLog}
                onAddToast={addToast}
                onTriggerSync={() => sincronizarFila(true)}
              />

            </ErrorBoundary>
          </div>
        )}

        {/* ABA: ARTIGOS, ENDEREÇOS E AUDITORIA DE CTN (100% LOCAL SEGURO) */}
        {activeTab === 'artigos' && (
          <div className="animate-fade-in">
            <ErrorBoundary fallbackTitle="Auditoria de Artigo, Endereço e CTN">
              <ArticleAddressAuditModule
                logs={logs}
                onNavigateToStreet={(st: string) => {
                  handleTabChange('ruas');
                  addToast(`Foco direcionado para a rua ${st}`, 'var(--color-info)');
                }}
                onNotify={(msg: string, color?: string) => addToast(msg, color || 'var(--color-info)')}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ABA: MODO TV - RASTREIO OPERACIONAL E TRANSMISSÃO EM TEMPO REAL */}
        {activeTab === 'tv' && (
          <div className="animate-fade-in">
            <ErrorBoundary fallbackTitle="Modo TV - Radar de Reabastecimento em Tempo Real">
              <TvRadarModule
                isStandalone={false}
                onClose={() => handleTabChange('ruas')}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ABA: APOIO OFFLINE AO REABASTECIMENTO (PROVA DE CONCEITO - PDT / COLETOR) */}
        {activeTab === 'apoio' && (
          <div className="animate-fade-in">
            <ErrorBoundary fallbackTitle="Módulo de Apoio Offline ao Reabastecimento">
              <OfflineReplenishmentAssistant
                activeOperator={activeOperator}
                activeSectorId={activeSectorId}
                onAddToast={addToast}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ABA: REABASTECIMENTO GUIADO OFFLINE (FASE A1) */}
        {activeTab === 'guiado' && (
          <div className="animate-fade-in">
            <ErrorBoundary fallbackTitle="Módulo de Reabastecimento Guiado Offline">
              <ReabastecimentoGuiado />
            </ErrorBoundary>
          </div>
        )}

        {/* ABA: GESTÃO / AUDITORIA / SHEETS (PROTEGIDO POR LOGIN) */}
        {activeTab === 'gestao' && (
          !isAuthUnlocked ? (
            <AuthLoginCard
              requestedTabName="Gestão & Sheets"
              onNavigateToTab={(t) => handleTabChange(t)}
              onLoginSuccess={(u) => {
                setUser(u);
                localStorage.setItem('repro_local_user', JSON.stringify(u));
              }}
              onSuccessToast={(msg) => addToast(msg, 'var(--color-success)')}
              onErrorToast={(msg) => addToast(msg, 'var(--color-danger)')}
            />
          ) : (
            <div className="animate-fade-in">
              <ErrorBoundary fallbackTitle="Módulo de Gestão & Sheets">
                <ManagementModule
                  logs={logs}
                  activeSectorId={activeSectorId}
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                  onAddToast={addToast}
                  lastSyncTimestamp={lastSyncTime || undefined}
                  isSyncing={isSyncing}
                  onTriggerSync={() => syncMultiDevice({ forceAlert: true })}
                  networkStatus={networkStatus}
                />
              </ErrorBoundary>
            </div>
          )
        )}

        {/* ABA 4: PAINEL OPERACIONAL (PROTEGIDO POR LOGIN) */}
        {activeTab === 'painel' && (
          !isAuthUnlocked ? (
            <AuthLoginCard
              requestedTabName="Painel Operacional"
              onNavigateToTab={(t) => handleTabChange(t)}
              onLoginSuccess={(u) => {
                setUser(u);
                localStorage.setItem('repro_local_user', JSON.stringify(u));
              }}
              onSuccessToast={(msg) => addToast(msg, 'var(--color-success)')}
              onErrorToast={(msg) => addToast(msg, 'var(--color-danger)')}
            />
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* 0. CONTROLO OPERACIONAL & FILTROS (SETOR 87 SOLO, 88-90 UNIFICADOS, VISÕES DIÁRIA, SEMANAL E MENSAL) */}
              <TemporalFilterBar
                activeSectorId={activeSectorId}
                onSectorChange={(sec) => updateActiveSector(sec, addToast)}
                period={temporalPeriod}
                onPeriodChange={setTemporalPeriod}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                selectedWeek={selectedWeek}
                onWeekChange={setSelectedWeek}
                selectedMonthKey={selectedMonthKey}
                onMonthChange={setSelectedMonthKey}
                availableWeeks={availableWeeks}
                availableMonths={availableMonths}
                totalLogsCount={cleanLogs.length}
                filteredLogsCount={filteredLogs.length}
              />

              {/* 1. MÉTRICAS SESSÃO */}
              <DashboardMetrics logs={filteredLogs} />

              {/* 2. GRÁFICOS & ANÁLISE DE PRODUTIVIDADE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <VphChart logs={filteredLogs} />
                </div>
                <div className="space-y-6">
                  <BreakdownPanel logs={filteredLogs} />
                  <RankingTable logs={filteredLogs} />
                </div>
              </div>

              {/* ÚLTIMOS APONTAMENTOS */}
              <RecentLogsTable
                logs={filteredLogs}
                onDeleteLog={handleDeleteLog}
                onExportBackup={handleExportBackup}
                onClearDb={handleClearDb}
                onRetrySync={handleRetrySyncLog}
                apiUrl={apiUrl}
              />
            </div>
          )
        )}

        {/* ABA 4: HISTÓRICO DE LOGS & MAPA DE CALOR (ACESSO LIVRE & RÁPIDO) */}
        {activeTab === 'historico' && (
          <div className="animate-fade-in">
            <HistoryTab 
              logs={logs} 
              apiUrl={apiUrl}
              onRefresh={async () => {
                const refreshedLogs = await getLogs();
                setLogs(refreshedLogs);
              }} 
              onAddToast={addToast}
              onImportCloud={importarPlanilha}
              onRetrySync={handleRetrySyncLog}
              userUid={user?.id || user?.uid}
            />
          </div>
        )}

        {/* ABA 5: FOLLOW-UP SEMANAL (PROTEGIDO POR LOGIN) */}
        {activeTab === 'followup' && (
          !isAuthUnlocked ? (
            <AuthLoginCard
              requestedTabName="Follow-up Semanal"
              onNavigateToTab={(t) => handleTabChange(t)}
              onLoginSuccess={(u) => {
                setUser(u);
                localStorage.setItem('repro_local_user', JSON.stringify(u));
              }}
              onSuccessToast={(msg) => addToast(msg, 'var(--color-success)')}
              onErrorToast={(msg) => addToast(msg, 'var(--color-danger)')}
            />
          ) : (
            <div className="animate-fade-in">
              <WeeklyFollowupTab
                logs={logs}
                apiUrl={apiUrl}
                onAddToast={addToast}
                onRefreshLogs={async () => {
                  const refreshedLogs = await getLogs();
                  setLogs(refreshedLogs);
                }}
                userUid={user?.id || user?.uid}
              />
            </div>
          )
        )}
          </motion.div>
        </AnimatePresence>

        {/* IBM AS/400 5250 RETRO COMMAND & FUNCTION KEY BAR */}
        {theme === 'as400' && (
          <div className="p-3 rounded-xl border border-emerald-500/50 bg-black/90 font-mono text-[0.72rem] text-emerald-400 flex flex-wrap items-center justify-between gap-2 select-none shadow-lg mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">=== IBM AS/400 (5250) ===</span>
              <button 
                type="button" 
                onClick={() => sincronizarFila(true)}
                className="hover:underline cursor-pointer"
              >
                <strong className="text-emerald-300">F5</strong>=Sincronizar
              </button>
              <button 
                type="button" 
                onClick={() => handleTabChange('gestao')}
                className="hover:underline cursor-pointer"
              >
                <strong className="text-emerald-300">F9</strong>=ODBC/Gestão
              </button>
              <button 
                type="button" 
                onClick={() => handleTabChange('ruas')}
                className="hover:underline cursor-pointer"
              >
                <strong className="text-emerald-300">F10</strong>=Reabastecimento
              </button>
              <button 
                type="button" 
                onClick={() => toggleTheme(addToast)}
                className="hover:underline cursor-pointer text-emerald-300 font-bold"
              >
                <strong className="text-emerald-200">F24/Alt+T</strong>=Mudar Tema
              </button>
            </div>
            <div className="text-[0.65rem] text-emerald-500/80 font-bold">
              SISTEMA CONECTADO: DEMANDA x REALIZADO
            </div>
          </div>
        )}

      </div>

      {/* CENTRAL DE AJUDA & DOCUMENTAÇÃO */}

      {/* SOLICITAÇÃO DE PEDIDO - FLOATING BUTTON */}
      <FormModalFloatingButton />

      {/* MODAL: FECHAMENTO CONSCIENTE DE TURNO GERAL (Cockpit Header / Badge) */}
      <GeneralShiftClosureModal
        isOpen={isGeneralClosureModalOpen}
        onClose={() => {
          setIsGeneralClosureModalOpen(false);
          refreshShiftState();
        }}
        logs={logs}
        activeOperator={activeOperator}
        activeSectorId={activeSectorId}
        onSaveLog={saveLogAndSync}
        onTriggerSync={() => sincronizarFila(true)}
        onAddToast={addToast}
        onShiftStateChanged={refreshShiftState}
      />

      {/* MODAL: CHECKPOINT DE INÍCIO DO TURNO (ABERTURA OPERACIONAL) */}
      <InitialCheckpointModal
        isOpen={isInitialCheckpointModalOpen}
        onClose={() => setIsInitialCheckpointModalOpen(false)}
        onSaveCheckpoint={saveLogAndSync}
        activeOperator={activeOperator}
        activeSectorId={activeSectorId}
        existingCheckpointLog={existingCheckpointLog}
        onAddToast={addToast}
        onTriggerSync={() => sincronizarFila(true)}
      />
    </div>
  );
}
