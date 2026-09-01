/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import { Wifi, WifiOff, Cloud, Database, RefreshCw, AlertCircle, LogIn, LogOut, Loader2, Key, HelpCircle } from 'lucide-react';
import { Log, AppTimerState } from './types';
import {
  initDb,
  getLogs,
  saveLog,
  deleteLog,
  saveState,
  getState,
  clearLogsAndState
} from './dbLocal';
import { syncOfflineQueue, fetchFromCloud, postLogWithRetry } from './sheetService';

import { getWeekNumber, getDayOfWeekName, formatDateToBR, parseDateString } from './utils/dateUtils';
import { EventBus } from './eventBus';
import { useSectorStore } from './stores/sectorStore';
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
import ErrorBoundary from './components/ErrorBoundary';
import Screensaver from './components/Screensaver';
import HelpSupportModal from './components/HelpSupportModal';
import TabBarBead from './components/TabBarBead';
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
  ExternalLink
} from 'lucide-react';

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

  const defaultSheetUrl = 'https://script.google.com/macros/s/AKfycbwzg8jDY71b5sMc6Q_qMii3YYQrdyKROuPe9l24iyEtke1Zhx9cCEt1R7xhxmtjN5aK2A/exec';
  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('repro_sheets_api_url');
    if (!saved || saved.includes('2PACX-1vTy_lfMaDqE48mRuMZJ_nBP2R4qbDG7wYEA3vtIeHOhMTTxjYHPZzGPcJrWvaIokP0EaRrMGf_1UoP2')) {
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

  const updateScreensaverEnabled = (enabled: boolean) => {
    storeUpdateScreensaverEnabled(enabled, addToast);
  };

  const updateScreensaverTimeout = (timeout: number) => {
    storeUpdateScreensaverTimeout(timeout, addToast);
  };

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

  // Idle timer for Screensaver (Desativado se screensaverEnabled for falso)
  useEffect(() => {
    if (!screensaverEnabled) {
      if (screensaverActive) {
        setScreensaverActive(false);
      }
      return;
    }
    if (screensaverActive) return;

    let idleTimer: any;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (screensaverEnabled) {
          setScreensaverActive(true);
        }
      }, screensaverTimeout * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, resetIdleTimer));

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [screensaverEnabled, screensaverTimeout, screensaverActive, setScreensaverActive]);

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

  // Timer interval to increment elapsed seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTicks(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const navigationTabs = useMemo(() => [
    {
      id: 'cronometro',
      label: 'Cronômetro',
      icon: <Clock size={15} className={activeTab === 'cronometro' ? 'text-black' : 'text-emerald-400'} />,
      badge: 'Livre'
    },
    {
      id: 'ruas',
      label: 'Reabastecimento por Rua',
      icon: <MapPin size={15} className={activeTab === 'ruas' ? 'text-black' : 'text-emerald-400'} />,
      badge: 'Livre'
    },
    {
      id: 'gestao',
      label: 'Gestão & Sheets',
      icon: <Layers size={15} className={activeTab === 'gestao' ? 'text-black' : 'text-emerald-400'} />,
      badge: 'PC / Web'
    },
    {
      id: 'painel',
      label: 'Painel Gráfico',
      icon: <LayoutDashboard size={15} className={activeTab === 'painel' ? 'text-black' : 'text-emerald-400'} />,
      badge: isAuthUnlocked ? 'Liberado' : 'Login'
    },
    {
      id: 'historico',
      label: 'Histórico de Logs',
      icon: <History size={15} className={activeTab === 'historico' ? 'text-black' : 'text-emerald-400'} />,
      badge: isAuthUnlocked ? 'Liberado' : 'Login'
    },
    {
      id: 'followup',
      label: 'Follow-up Semanal',
      icon: <CalendarClock size={15} className={activeTab === 'followup' ? 'text-black' : 'text-emerald-400'} />,
      badge: isAuthUnlocked ? 'Liberado' : 'Login'
    }
  ], [activeTab, isAuthUnlocked]);

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
    <div className={`terminal-root ${theme === 'as400' ? 'theme-as400' : ''} p-2 sm:p-4 md:p-8 flex flex-col items-center relative overflow-hidden min-h-screen`}>
      
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

      {/* AS/400 CRT TOP SYSTEM LINE */}
      {theme === 'as400' && (
        <div className="w-full max-w-6xl mb-2 px-3 py-1 bg-black border border-[#00ff66] text-[#00ff66] font-mono text-[0.68rem] flex justify-between items-center tracking-widest uppercase">
          <span>IBM 5250 REPRO WMS // ESTAÇÃO: WS01</span>
          <span className="hidden sm:inline">DATA: {new Date().toLocaleDateString('pt-PT')}</span>
          <span>OPERADOR: {activeOperator || 'GUEST'}</span>
        </div>
      )}

      {/* Global Supabase Loading Progress and Spinner feedback */}
      {supabaseLoading && (
        <div className="fixed top-0 left-0 w-full z-50 pointer-events-none">
          <div className="h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse w-full"></div>
          <div className="absolute right-4 top-4 flex items-center gap-2 bg-black/90 border border-emerald-500/50 px-3 py-1.5 rounded-xl text-[10px] font-mono text-emerald-400 shadow-2xl backdrop-blur-md">
            <Loader2 size={12} className="animate-spin text-emerald-400" />
            CONECTANDO AO SUPABASE...
          </div>
        </div>
      )}
      
      {/* Toast Alert stack overlay */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
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

      <div className="w-full max-w-6xl space-y-6 relative z-10">
        
        {/* MODO STANDALONE / EMBED / TV (SITE EXTERNO) */}
        {isStandaloneMode ? (
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-950/90 border border-cyan-500/30 rounded-2xl backdrop-blur-md shadow-xl gap-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-500/50 animate-pulse shrink-0" />
              <div>
                <h1 className="text-sm md:text-base font-black tracking-wider uppercase text-white font-mono flex items-center gap-2">
                  <span>TERMINAL REPRO</span>
                  <span className="text-cyan-400 text-xs font-normal">// Torre de Gestão</span>
                </h1>
                <p className="text-[0.60rem] text-slate-400 font-mono flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">● TEMPO REAL (READ-ONLY)</span>
                  <span>•</span>
                  <span>Última Sincronização: <strong className="text-white">{lastSyncTime || 'Ao vivo'}</strong></span>
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
              {networkStatus === 'online' ? (
                <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[0.65rem]">
                  <Wifi size={11} />
                  <span>ONLINE</span>
                </span>
              ) : (
                <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[0.65rem]">
                  <WifiOff size={11} />
                  <span>OFFLINE</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => toggleTheme(addToast)}
                className={`px-3 py-1.5 border text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all ${
                  theme === 'as400'
                    ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md'
                    : 'bg-slate-900 border-purple-500/40 text-purple-300 hover:bg-purple-500/10'
                }`}
                title="Alternar Tema: IBM AS/400 5250 (Fósforo Verde) vs Torre Obsidian (Alt+T)"
              >
                <Terminal size={12} className={theme === 'as400' ? 'text-black' : 'text-purple-400'} />
                <span>{theme === 'as400' ? 'IBM AS/400' : 'Tema AS/400'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="px-3 py-1.5 bg-slate-900 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
                title="Abrir Central de Ajuda e Documentação"
              >
                <HelpCircle size={12} className="text-emerald-400" />
                <span>Ajuda</span>
              </button>

              <button
                type="button"
                onClick={() => sincronizarFila(false)}
                disabled={isSyncing}
                className="px-3 py-1.5 bg-slate-900 border border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                title="Atualizar dados da nuvem agora"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin text-cyan-400' : ''} />
                <span>{isSyncing ? 'Atualizando...' : 'Atualizar Dados'}</span>
              </button>

              <a
                href={typeof window !== 'undefined' ? window.location.pathname : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white/5 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all"
                title="Abrir Terminal Operacional Completo"
              >
                <ExternalLink size={12} />
                <span>Abrir Terminal</span>
              </a>
            </div>
          </header>
        ) : (
          <>
            {/* CABEÇALHO ORGÂNICO */}
            <header className="relative flex flex-col md:flex-row justify-between border-b border-white/10 pb-5 items-start md:items-end gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50 animate-pulse" />
                  <h1 className="text-xl md:text-2xl font-black tracking-widest uppercase text-white font-sans">
                    REPRO <span className="text-emerald-400 font-mono text-base font-normal opacity-80">// Torre de Comando</span>
                  </h1>
                </div>
                <p className="text-[0.62rem] text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>Motor v5.0 Cloud</span>
                  <span className="text-white/20">•</span>
                  <span className="text-emerald-400/90 font-bold">Obsidian Matte & Esmeralda</span>
                </p>
              </div>
              
              <div className="flex flex-col items-start md:items-end gap-2 text-[0.6rem] font-mono tracking-wider">
                {/* Status Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {networkStatus === 'online' ? (
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <Wifi size={11} />
                      <span>ONLINE</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 font-bold bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <WifiOff size={11} />
                      <span>OFFLINE</span>
                    </span>
                  )}
                  
                  <span className="text-slate-300 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <Database size={11} />
                    <span>IndexedDB</span>
                  </span>
                  
                  {apiUrl ? (
                    unsyncedCount > 0 ? (
                      <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1.5">
                        <Cloud size={11} />
                        <span>{unsyncedCount} Pendentes</span>
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                        <Cloud size={11} />
                        <span>Sheets OK</span>
                      </span>
                    )
                  ) : (
                    <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <Cloud size={11} />
                      <span>Configurar Sheets</span>
                    </span>
                  )}

                  {user ? (
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <Cloud size={11} />
                      <span>PostgreSQL Cloud</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <Cloud size={11} />
                      <span>Modo Local</span>
                    </span>
                  )}
                </div>

                {/* Ações de Restauração & Sessão */}
                <div className="flex flex-wrap items-center gap-2 mt-1 justify-start md:justify-end">
                  <button
                    type="button"
                    onClick={() => toggleTheme(addToast)}
                    className={`px-2 md:px-2.5 py-1 border rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold flex items-center gap-1 md:gap-1.5 shadow-sm text-[0.6rem] ${
                      theme === 'as400'
                        ? 'bg-emerald-500 text-black border-emerald-400 font-black'
                        : 'bg-white/5 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                    }`}
                    title="Alternar Tema: IBM AS/400 5250 (Fósforo Verde) vs Torre Obsidian (Alt+T)"
                  >
                    <Terminal size={11} className={theme === 'as400' ? 'text-black' : 'text-purple-400'} />
                    <span className="hidden md:inline">{theme === 'as400' ? 'IBM AS/400' : 'TEMA AS/400'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="px-2 md:px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold flex items-center gap-1 md:gap-1.5 shadow-sm text-[0.6rem]"
                    title="Central de Ajuda, Atalhos do Coletor e Documentação"
                  >
                    <HelpCircle size={11} className="text-emerald-400" />
                    <span className="hidden md:inline">Ajuda</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateScreensaverEnabled(!screensaverEnabled)}
                    className={`px-2 md:px-2.5 py-1 border rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold flex items-center gap-1 md:gap-1.5 shadow-sm text-[0.6rem] ${
                      screensaverEnabled
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                        : 'bg-white/5 border-white/15 text-slate-400 hover:text-white'
                    }`}
                    title={screensaverEnabled ? 'Descanso de Tela ATIVADO (Clique para desligar)' : 'Descanso de Tela DESLIGADO (Clique para ligar)'}
                  >
                    <Moon size={11} className={screensaverEnabled ? 'text-purple-400' : 'text-slate-400'} />
                    <span className="hidden md:inline">Descanso: {screensaverEnabled ? 'LIGADO' : 'OFF'}</span>
                  </button>

                  <button
                    onClick={handleRestoreSystem}
                    disabled={isSyncing}
                    className="px-2 md:px-2.5 py-1 bg-white/5 border border-white/15 text-slate-200 hover:text-emerald-400 hover:border-emerald-500/40 rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold flex items-center gap-1 md:gap-1.5 shadow-sm"
                    title="Restaura o sistema, diagnostica base de dados e reconecta sincronização"
                  >
                    <RefreshCw size={11} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
                    <span className="hidden md:inline">Restaurar Sistema</span>
                  </button>

                  {user ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-[0.55rem] md:text-xs">
                        <span className="hidden md:inline">OPERADOR: </span><strong className="text-white uppercase">{user.user_metadata?.full_name || user.email?.split('@')[0]}</strong>
                      </span>
                      <button
                        onClick={() => {
                          localStorage.removeItem('repro_local_user');
                          setUser(null);
                          addToast("Sessão terminada.", 'var(--color-info)');
                        }}
                        className="px-2 py-1 bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 rounded-lg cursor-pointer transition-all text-xs"
                      >
                        SAIR
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsGuestMode(false);
                        localStorage.setItem('repro_guest_mode', 'false');
                      }}
                      className="px-2 md:px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-black rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold text-[0.6rem] md:text-xs"
                    >
                      LOGIN ⚡
                    </button>
                  )}
                </div>
                
                <div className="text-slate-500 text-right text-[0.55rem]">
                  ÚLTIMA SINCRONIZAÇÃO: <span className="text-slate-400 font-bold">{lastSyncTime}</span>
                </div>
              </div>
            </header>

            {/* NAVEGAÇÃO DE ABAS RESPONSIVA COM BEAD DESLIZANTE (PC, MOBILE & PDT ZEBRA) */}
            <TabBarBead
              tabs={navigationTabs}
              activeId={activeTab}
              onChange={(id) => handleTabChange(id as TabType)}
            />
          </>
        )}

        {/* CONTEÚDO DINÂMICO DE ACORDO COM A ABA ATIVA */}
        
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
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ABA 3: GESTÃO / AUDITORIA / SHEETS (ACESSO LIVRE / MÓDULO WEB & PC) */}
        {activeTab === 'gestao' && (
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

        {/* ABA 4: HISTÓRICO DE LOGS (PROTEGIDO POR LOGIN) */}
        {activeTab === 'historico' && (
          !isAuthUnlocked ? (
            <AuthLoginCard
              requestedTabName="Histórico de Logs"
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
          )
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

      {screensaverEnabled && screensaverActive && (
        <Screensaver
          onClose={() => setScreensaverActive(false)}
          logs={logs}
          currentUser={currentUser}
          currentRole={currentRole}
        />
      )}

      {/* CENTRAL DE AJUDA & DOCUMENTAÇÃO */}
      <HelpSupportModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        apiUrl={apiUrl}
      />
    </div>
  );
}
