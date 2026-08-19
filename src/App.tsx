/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { Wifi, WifiOff, Cloud, Database, RefreshCw, AlertCircle, LogIn, LogOut, Loader2, Key } from 'lucide-react';
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
import {
  supabase,
  getSupabase,
  signInWithGoogle,
  signOutSupabase,
  getCurrentSupabaseUser,
  syncPerfilDirectly,
  fetchPerfilDirectly,
  saveLogsDirectly,
  fetchLogsDirectly,
  deleteLogDirectly,
  clearLogsDirectly
} from './utils/supabase/client';
import { getWeekNumber, getDayOfWeekName, formatDateToBR, parseDateString } from './utils/dateUtils';
import { EventBus } from './eventBus';
import { useSectorStore } from './stores/sectorStore';
import { useCollaboratorStore } from './stores/collaboratorStore';
import { useUIStore } from './stores/uiStore';
import { useHistoryStore } from './stores/historyStore';
import DashboardMetrics from './components/DashboardMetrics';
import TemporalFilterBar from './components/TemporalFilterBar';
import StopwatchPanel from './components/StopwatchPanel';
import RankingTable from './components/RankingTable';
import RecentLogsTable from './components/RecentLogsTable';
import VphChart from './components/VphChart';
import BreakdownPanel from './components/BreakdownPanel';
import HistoryTab from './components/HistoryTab';
import WeeklyFollowupTab from './components/WeeklyFollowupTab';
import Screensaver from './components/Screensaver';
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
  Monitor, 
  Filter, 
  Settings, 
  Edit3 
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
  
  // Authentication states (Supabase User or null)
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(() => localStorage.getItem('repro_guest_mode') === 'true');

  // Zustand Stores
  const { activeSectorId, childActiveSector, updateActiveSector } = useSectorStore();
  const { currentUser, currentRole, activeOperator, updateCurrentUser, updateCurrentRole, setActiveOperator } = useCollaboratorStore();
  const {
    activeTab,
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

  const defaultSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTy_lfMaDqE48mRuMZJ_nBP2R4qbDG7wYEA3vtIeHOhMTTxjYHPZzGPcJrWvaIokP0EaRrMGf_1UoP2/pubhtml?gid=357189506&single=true';
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('repro_sheets_api_url') || defaultSheetUrl);
  
  const [timerState, setTimerState] = useState<AppTimerState>({
    cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
    rascunhoColab: '',
    rascunhoVol: ''
  });
  const [inputOpen, setInputOpen] = useState(false);
  const [ticks, setTicks] = useState(0);

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

  // Subscribe to Supabase Authentication and sync
  useEffect(() => {
    async function initUserSession(currentUser: any) {
      if (!currentUser) {
        setUser(null);
        setLoadingUser(false);
        return;
      }

      setUser(currentUser);
      setIsGuestMode(false);
      localStorage.setItem('repro_guest_mode', 'false');
      
      setSupabaseLoading(true);
      try {
        const email = currentUser.email || '';
        const displayName = currentUser.user_metadata?.full_name || currentUser.email || 'Operador';
        const userUid = currentUser.id || currentUser.uid;
        
        // 1. Sync or retrieve user profile in Supabase
        const existingPerfil = await fetchPerfilDirectly(userUid);
        let role = 'Pendente';
        
        if (existingPerfil) {
          role = existingPerfil.role || 'Pendente';
          updateCurrentRole(role);
        } else {
          await syncPerfilDirectly(userUid, email, displayName, 'Pendente', 'Geral');
        }
        
        addToast(`Sessão iniciada como ${displayName}. Perfil: ${role}`, 'var(--color-success)');
        
        // 2. Pull and sync records from Supabase
        const cloudRecords = await fetchLogsDirectly(userUid);
        for (const rec of cloudRecords) {
          await saveLog({
            id: rec.id,
            data: rec.data,
            dia: rec.dia,
            semana: rec.semana,
            atividade: rec.atividade,
            colaborador: rec.colaborador,
            setor: rec.setor,
            volumes: rec.volumes,
            horas: rec.horas,
            vph: rec.vph,
            timestamp: rec.timestamp,
            synced: true,
            tipo: rec.tipo
          });
        }
        const refreshed = await getLogs();
        setLogs(refreshed);
      } catch (err: any) {
        console.error("Cloud Supabase sync error:", err);
        const errorMsg = err.message || 'Erro de conexão';
        addToast(`Erro ao sincronizar dados com Supabase: ${errorMsg}`, 'var(--color-danger)');
      } finally {
        setSupabaseLoading(false);
        setLoadingUser(false);
      }
    }

    getCurrentSupabaseUser().then(user => initUserSession(user));

    const client = getSupabase();
    let authListener: any = null;
    if (client?.auth) {
      const { data } = client.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          initUserSession(session.user);
        } else {
          setUser(null);
          setLoadingUser(false);
        }
      });
      authListener = data;
    }

    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // Periodic background cloud synchronization
  useEffect(() => {
    if (!user || networkStatus !== 'online') return;
    
    const interval = setInterval(async () => {
      const unsyncedLogs = logs.filter(l => !l.synced);
      if (unsyncedLogs.length === 0) return;
      
      setSupabaseLoading(true);
      try {
        const userUid = user.id || user.uid;
        await saveLogsDirectly(unsyncedLogs, userUid);
        for (const l of unsyncedLogs) {
          await saveLog({ ...l, synced: true });
        }
        const refreshed = await getLogs();
        setLogs(refreshed);
        const now = new Date();
        setLastSyncTime(now.toLocaleTimeString('pt-PT'));
        addToast(`${unsyncedLogs.length} logs pendentes sincronizados na nuvem Supabase!`, 'var(--color-success)');
      } catch (err: any) {
        console.error("Periodic Supabase sync failed:", err);
        const errorCode = err.code || 'N/A';
        addToast(`Erro de sincronização em segundo plano [Código: ${errorCode}]`, 'var(--color-danger)');
      } finally {
        setSupabaseLoading(false);
      }
    }, 25000);
    
    return () => clearInterval(interval);
  }, [user, logs, networkStatus]);



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

  // Idle timer for Screensaver
  useEffect(() => {
    if (!screensaverEnabled || screensaverActive) return;

    let idleTimer: any;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setScreensaverActive(true);
      }, screensaverTimeout * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, resetIdleTimer));

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [screensaverEnabled, screensaverTimeout, screensaverActive]);

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

  // Synchronize queue
  const sincronizarFila = async (forcarAlerta = false) => {
    if (isSyncing) return;
    if (!navigator.onLine) {
      setNetworkStatus('offline');
      if (forcarAlerta) {
        addToast("Sem conexao à Internet. Sincronizacao retida.", 'var(--color-warning)');
      }
      return;
    }
    setNetworkStatus('online');

    if (!apiUrl) {
      if (forcarAlerta) {
        addToast("URL de ligacao nao configurada.", 'var(--color-warning)');
      }
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncOfflineQueue(apiUrl);
      const updatedLogs = await getLogs();
      setLogs(updatedLogs);

      if (result.successCount > 0) {
        const now = new Date();
        setLastSyncTime(now.toLocaleTimeString('pt-PT'));
        addToast(`${result.successCount} registos enviados à planilha Google!`, 'var(--color-success)');
      } else if (forcarAlerta && result.failedCount === 0) {
        addToast("Fila limpa. Tudo sincronizado.", 'var(--color-success)');
      } else if (result.failedCount > 0) {
        addToast("A ligacao ao Google falhou. Retentando em background...", 'var(--color-danger)');
      }
    } catch (err) {
      console.error(err);
      addToast("Erro ao sincronizar. Verifique as configuracoes.", 'var(--color-danger)');
    } finally {
      setIsSyncing(false);
    }
  };

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

  // Trigger import from Google Sheets
  const importarPlanilha = async () => {
    if (isImporting) return;
    if (!apiUrl) {
      addToast("Introduza a URL nas configuracoes.", 'var(--color-danger)');
      return;
    }
    setIsImporting(true);
    addToast("A descarregar dados...", 'var(--color-info)');

    try {
      const cloudLogs = await fetchFromCloud(apiUrl);
      const localLogs = await getLogs();
      let importedCount = 0;

      for (const remote of cloudLogs) {
        const exists = localLogs.some(l => String(l.id) === String(remote.id));
        if (!exists) {
          await saveLog(remote);
          importedCount++;
        }
      }

      if (importedCount > 0) {
        addToast(`${importedCount} novos registos importados com sucesso!`, 'var(--color-success)');
        const refreshed = await getLogs();
        setLogs(refreshed);
      } else {
        addToast("A base local ja se encontra atualizada.", 'var(--color-info)');
      }
    } catch (err) {
      console.error(err);
      addToast("A importacao falhou. Verifique as credenciais e rede.", 'var(--color-danger)');
    } finally {
      setIsImporting(false);
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
      
      if (user && networkStatus === 'online') {
        setSupabaseLoading(true);
        try {
          await deleteLogDirectly(id, user.uid);
          addToast("Registo removido da nuvem Supabase!", 'var(--color-success)');
        } catch (err: any) {
          console.error("Cloud delete error:", err);
          const errorCode = err.code || 'N/A';
          addToast(`Falha ao sincronizar remoção na nuvem [Código: ${errorCode}]`, 'var(--color-warning)');
        } finally {
          setSupabaseLoading(false);
        }
      }
      
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
      
      if (user && networkStatus === 'online') {
        setSupabaseLoading(true);
        try {
          await clearLogsDirectly(user.uid);
          addToast("Base de dados cloud redefinida.", 'var(--color-danger)');
        } catch (err: any) {
          console.error("Cloud clear error:", err);
          const errorCode = err.code || 'N/A';
          addToast(`Falha ao redefinir base de dados cloud [Código: ${errorCode}]`, 'var(--color-danger)');
        } finally {
          setSupabaseLoading(false);
        }
      }
      
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
        if (user) {
          const userUid = user.id || user.uid;
          const cloudRecs = await fetchLogsDirectly(userUid);
          if (cloudRecs && cloudRecs.length > 0) {
            for (const rec of cloudRecs) {
              await saveLog({ ...rec, synced: true });
            }
            const refreshed = await getLogs();
            setLogs(refreshed);
          }
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
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center border border-terminal-border/40 p-8 rounded-lg bg-terminal-panel/45 shadow-2xl">
          <Loader2 className="animate-spin text-terminal-accent" size={36} />
          <p className="font-mono text-xs text-terminal-text tracking-widest uppercase animate-pulse">
            Sincronizando Sistema Cloud...
          </p>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <div className="terminal-root min-h-screen flex flex-col items-center justify-center p-4">
        {/* Toast Alert stack overlay inside login */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className="toast-custom border-l-3 border-t-0 border-b-0 border-r-0 select-all pointer-events-auto"
              style={{ borderColor: t.color }}
            >
              &gt; {t.message}
            </div>
          ))}
        </div>

        <div className="w-full max-w-md border border-terminal-border/40 p-8 rounded shadow-2xl relative space-y-8 bg-terminal-panel/90">
          <div className="text-center space-y-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-widest uppercase text-white">
              REPRO // Terminal REPRO
            </h1>
            <p className="text-[0.6rem] text-terminal-accent uppercase tracking-widest font-mono">
              Sincronização em Tempo Real na Nuvem (PostgreSQL)
            </p>
          </div>

          <div className="border border-terminal-border/20 p-4 rounded bg-black/40 space-y-3 font-mono text-[0.65rem] text-terminal-text">
            <p className="text-white border-b border-terminal-border/20 pb-1 flex items-center gap-1.5 font-bold">
              <Shield size={12} className="text-terminal-accent animate-pulse" />
              BENEFÍCIOS DA SESSÃO EM NUVEM
            </p>
            <ul className="list-disc pl-4 space-y-1.5 opacity-80">
              <li>Sincronização Instantânea: Registros unificados em tempo real.</li>
              <li>Persistência Segura: Salvaguarda de dados na nuvem Supabase.</li>
              <li>Multi-dispositivo: Opere a torre de comando de qualquer ecrã.</li>
              <li>Autenticação Google / Supabase: Login seguro e único.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={async () => {
                try {
                  await signInWithGoogle();
                } catch (err) {
                  console.error("Sign in failed:", err);
                  addToast("Falha no login com Google.", "var(--color-danger)");
                }
              }}
              className="w-full py-3.5 bg-terminal-accent text-black font-bold text-xs uppercase tracking-widest rounded flex items-center justify-center gap-2 cursor-pointer hover:bg-transparent hover:text-terminal-accent border border-terminal-accent transition-all shadow-lg active:scale-95 font-mono"
            >
              <LogIn size={16} />
              Entrar com Google / Supabase
            </button>

            <button
              onClick={() => {
                setIsGuestMode(true);
                localStorage.setItem('repro_guest_mode', 'true');
                addToast("Operando em Modalidade Local (Convidado)", "var(--color-info)");
              }}
              className="w-full py-3 border border-terminal-border/60 text-terminal-text hover:text-white hover:border-terminal-accent font-semibold text-xs uppercase tracking-widest rounded flex items-center justify-center gap-2 cursor-pointer transition-all font-mono"
            >
              Continuar como Convidado (Local Only)
            </button>
          </div>

          <div className="text-center font-mono">
            <span className="text-[0.55rem] text-terminal-text opacity-30 uppercase tracking-wider">
              Versão 5.0 Cloud // Powered by PostgreSQL & Firebase Auth
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-root p-4 md:p-8 flex flex-col items-center relative overflow-hidden">
      
      {/* Dynamic Parallax Floating Background Spheres */}
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
                onClick={handleRestoreSystem}
                disabled={isSyncing}
                className="px-2.5 py-1 bg-white/5 border border-white/15 text-slate-200 hover:text-emerald-400 hover:border-emerald-500/40 rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold flex items-center gap-1.5 shadow-sm"
                title="Restaura o sistema, diagnostica base de dados e reconecta sincronização"
              >
                <RefreshCw size={11} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
                <span>Restaurar Sistema</span>
              </button>

              {user ? (
                <>
                  <span className="text-slate-400">OPERADOR: <strong className="text-white uppercase">{user.user_metadata?.full_name || user.email}</strong></span>
                  <button
                    onClick={async () => {
                      await signOutSupabase();
                      addToast("Sessão terminada.", 'var(--color-info)');
                    }}
                    className="px-2 py-1 bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 rounded-lg cursor-pointer transition-all"
                  >
                    SAIR
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsGuestMode(false);
                    localStorage.setItem('repro_guest_mode', 'false');
                  }}
                  className="px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-black rounded-lg cursor-pointer transition-all uppercase tracking-wider font-bold"
                >
                  CONECTAR SUPABASE ⚡
                </button>
              )}
            </div>
            
            <div className="text-slate-500 text-right text-[0.55rem]">
              ÚLTIMA SINCRONIZAÇÃO: <span className="text-slate-400 font-bold">{lastSyncTime}</span>
            </div>
          </div>
        </header>

        {/* NAVEGAÇÃO DE ABAS ORGÂNICA */}
        <div className="flex border-b border-white/10 gap-2 pb-px font-mono">
          <button
            onClick={() => handleTabChange('painel')}
            className={`nav-link flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-wider font-bold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'painel'
                ? 'text-white bg-white/5 active'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <LayoutDashboard size={14} className={activeTab === 'painel' ? 'text-emerald-400' : ''} />
            <span>Painel Operacional</span>
          </button>
          
          <button
            onClick={() => handleTabChange('historico')}
            className={`nav-link flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-wider font-bold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'historico'
                ? 'text-white bg-white/5 active'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <History size={14} className={activeTab === 'historico' ? 'text-emerald-400' : ''} />
            <span>Histórico de Logs</span>
          </button>

          <button
            onClick={() => handleTabChange('followup')}
            className={`nav-link flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-wider font-bold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'followup'
                ? 'text-white bg-white/5 active'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <CalendarClock size={14} className={activeTab === 'followup' ? 'text-emerald-400' : ''} />
            <span>Follow-up Semanal</span>
          </button>
        </div>

        {/* CONTEÚDO DINÂMICO DE ACORDO COM A ABA ATIVA */}
        {activeTab === 'painel' && (
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

            {/* 2. DUAL STOPWATCHES & BASE STATUS */}
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

            {/* 3. BREAKDOWN POR ATIVIDADE DIRETA */}
            <BreakdownPanel logs={filteredLogs} />
            
            {/* 4. EVOLUÇÃO PRODUTIVIDADE VPH */}
            <VphChart logs={filteredLogs} />

            {/* 5. RANKING DE OPERADORES */}
            <RankingTable logs={filteredLogs} />

            {/* 6. REGISTOS RECENTES */}
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

        {activeTab === 'followup' && (
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
        )}

      </div>

      {screensaverActive && (
        <Screensaver
          onClose={() => setScreensaverActive(false)}
          logs={logs}
          currentUser={currentUser}
          currentRole={currentRole}
        />
      )}

      {/* FLOATING FORM MODAL BUTTON */}
      <FormModalFloatingButton formUrl="https://docs.google.com/forms/d/e/1FAIpQLSdIMZqQ2_N7FDheTwynysUK_tcCtZ4ETiUsGmOAFu_V2MFc9w/viewform?usp=dialog" />
    </div>
  );
}
