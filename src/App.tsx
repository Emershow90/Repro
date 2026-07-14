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
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase';
import { syncOfflineQueue, fetchFromCloud, postLogWithRetry } from './sheetService';
import { EventBus } from './eventBus';
import { useSectorStore } from './stores/sectorStore';
import { useCollaboratorStore } from './stores/collaboratorStore';
import { useUIStore } from './stores/uiStore';
import { useHistoryStore } from './stores/historyStore';
import DashboardMetrics from './components/DashboardMetrics';
import StopwatchPanel from './components/StopwatchPanel';
import RankingTable from './components/RankingTable';
import RecentLogsTable from './components/RecentLogsTable';
import VphChart from './components/VphChart';
import BreakdownPanel from './components/BreakdownPanel';
import HistoryTab from './components/HistoryTab';
import WeeklyFollowupTab from './components/WeeklyFollowupTab';
import Screensaver from './components/Screensaver';
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

function obterSemanaDoAno(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

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
  
  // Authentication states
  const [user, setUser] = useState<FirebaseUser | null>(null);
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
    removeToast
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

  const [apiUrl, setApiUrl] = useState(localStorage.getItem('repro_sheets_api_url') || 'https://script.google.com/macros/s/AKfycbzOKrsUqrfa6W3V2leIleNkl6SZAwB5xMUt6qIw0ESMKPY1XS_ffv-QQRJHsYPkenWi/exec');
  
  const [timerState, setTimerState] = useState<AppTimerState>({
    cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
    rascunhoColab: '',
    rascunhoVol: ''
  });
  const [inputOpen, setInputOpen] = useState(false);
  const [ticks, setTicks] = useState(0);

  const updateScreensaverEnabled = (enabled: boolean) => {
    storeUpdateScreensaverEnabled(enabled, addToast);
  };

  const updateScreensaverTimeout = (timeout: number) => {
    storeUpdateScreensaverTimeout(timeout, addToast);
  };

  // Dynamically filtered logs based on active sector focus
  const filteredLogs = useMemo(() => {
    if (activeSectorId === 'todos') return logs;
    return logs.filter(log => {
      if (log.setor && log.setor === activeSectorId) {
        return true;
      }
      return obterSetorDaAtividade(log.atividade) === activeSectorId;
    });
  }, [logs, activeSectorId]);

  // Subscribe to Firebase Authentication and sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsGuestMode(false);
        localStorage.setItem('repro_guest_mode', 'false');
        
        try {
          const token = await currentUser.getIdToken();
          // Sync user on backend PostgreSQL
          await fetch('/api/auth/sync-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          addToast(`Sessão iniciada como ${currentUser.displayName || currentUser.email}`, 'var(--color-success)');
          
          // Pull and sync records from PostgreSQL
          const response = await fetch('/api/records', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            const cloudRecords = await response.json();
            for (const rec of cloudRecords) {
              await saveLog({
                id: rec.id,
                data: rec.data,
                dia: rec.dia,
                semana: rec.semana,
                atividade: rec.atividade,
                colaborador: rec.colaborador,
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
          }
        } catch (err) {
          console.error("Cloud PostgreSQL sync error:", err);
          addToast("Erro ao sincronizar dados com PostgreSQL.", 'var(--color-danger)');
        }
      } else {
        setUser(null);
      }
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  // Periodic background cloud synchronization
  useEffect(() => {
    if (!user || networkStatus !== 'online') return;
    
    const interval = setInterval(async () => {
      const unsyncedLogs = logs.filter(l => !l.synced);
      if (unsyncedLogs.length === 0) return;
      
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/records/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ logs: unsyncedLogs })
        });
        if (response.ok) {
          for (const l of unsyncedLogs) {
            await saveLog({ ...l, synced: true });
          }
          const refreshed = await getLogs();
          setLogs(refreshed);
          const now = new Date();
          setLastSyncTime(now.toLocaleTimeString('pt-PT'));
          addToast(`${unsyncedLogs.length} logs pendentes sincronizados na nuvem PostgreSQL!`, 'var(--color-success)');
        }
      } catch (err) {
        console.error("Periodic PostgreSQL sync failed:", err);
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

  const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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

  const saveTimer = async (colab: string, volumes: number) => {
    const decimalHours = timerState.cronometro?.segundos / 3600;
    
    if (!colab.trim()) {
      addToast("Operador não definido.", 'var(--color-danger)');
      return;
    }

    const newLog: Log = {
      id: Date.now(),
      data: new Date().toLocaleDateString('pt-PT'),
      dia: getDiaDaSemana(),
      semana: getWeekNumber(new Date()),
      atividade: timerState.cronometro?.tipo === 'indireta' ? `IND: ${timerState.cronometro?.atividade}` : timerState.cronometro?.atividade,
      colaborador: colab.toUpperCase(),
      volumes: volumes,
      horas: Number(decimalHours.toFixed(2)),
      vph: (decimalHours > 0 && volumes > 0 && timerState.cronometro?.tipo === 'direta') ? (volumes / decimalHours).toFixed(2) : "0.00",
      timestamp: Date.now(),
      synced: false,
      tipo: timerState.cronometro?.tipo,
      setor: activeSectorId
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

  const handleDeleteLog = async (id: number) => {
    if (confirm("Deseja remover este registo permanentemente?")) {
      await deleteLog(id);
      addToast("Registo removido localmente.", 'var(--color-warning)');
      
      if (user && networkStatus === 'online') {
        try {
          const token = await user.getIdToken();
          const response = await fetch(`/api/records/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            addToast("Registo removido da nuvem PostgreSQL!", 'var(--color-success)');
          } else {
            addToast("Falha ao sincronizar remoção na nuvem.", 'var(--color-warning)');
          }
        } catch (err) {
          console.error("Cloud delete error:", err);
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
        try {
          const token = await user.getIdToken();
          await fetch('/api/records', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          addToast("Base de dados cloud redefinida.", 'var(--color-danger)');
        } catch (err) {
          console.error("Cloud clear error:", err);
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
  const handleApiUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setApiUrl(val);
    localStorage.setItem('repro_sheets_api_url', val);
    addToast("URL de ligacao guardada localmente.", 'var(--color-success)');
    setTimeout(() => sincronizarFila(true), 150);
  };

  // Computed counts for visual status indicators
  const syncedCount = logs.filter(l => l.synced).length;
  const unsyncedCount = logs.length - syncedCount;

  // List of collaborators to show as autocomplete helper
  const colabHistory: string[] = Array.from(new Set(logs.map(l => l.colaborador)));

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
              <li>Persistência Segura: Salvaguarda de dados no PostgreSQL em nuvem.</li>
              <li>Multi-dispositivo: Opere a torre de comando de qualquer ecrã.</li>
              <li>Autenticação Google: Login seguro e único.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={async () => {
                try {
                  await signInWithPopup(auth, googleAuthProvider);
                } catch (err) {
                  console.error("Sign in failed:", err);
                  addToast("Falha no login com Google.", "var(--color-danger)");
                }
              }}
              className="w-full py-3.5 bg-terminal-accent text-black font-bold text-xs uppercase tracking-widest rounded flex items-center justify-center gap-2 cursor-pointer hover:bg-transparent hover:text-terminal-accent border border-terminal-accent transition-all shadow-lg active:scale-95 font-mono"
            >
              <LogIn size={16} />
              Entrar com Google
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
    <div className="terminal-root p-4 md:p-8 flex flex-col items-center">
      
      {/* Toast Alert stack overlay */}
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

      <div className="w-full max-w-6xl space-y-8">
        
        {/* CABEÇALHO */}
        <header className="relative flex flex-col md:flex-row justify-between border-b border-terminal-border/40 pb-6 md:items-para-baixo">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-widest uppercase text-white">
              REPRO // Torre de Comando
            </h1>
            <p className="text-[0.6rem] text-terminal-text opacity-40 uppercase tracking-widest">
              Motor v5.0 // Obsidian Matte & Emerald Line_
            </p>
          </div>
          
          <div className="flex flex-col items-start md:items-para-baixo gap-1 mt-4 md:mt-0 text-[0.55rem] font-medium tracking-widest">
            <div className="flex flex-wrap items-centralizados gap-2 text-terminal-text opacity-60">
              {networkStatus === 'online' ? (
                <span className="text-success font-bold pulse-dot flex items-centralizados gap-1">
                  <Wifi size={10} />
                  ● ONLINE
                </span>
              ) : (
                <span className="text-terminal-text opacity-40 flex items-centralizados gap-1">
                  <WifiOff size={10} />
                  ● OFFLINE
                </span>
              )}
              
              <span className="text-terminal-border/50">•</span>
              
              <span className="text-terminal-text/80 flex items-centralizados gap-1">
                <Database size={10} />
                💾 LOCAL SECURE
              </span>
              
              <span className="text-terminal-border/50">•</span>
              
              {apiUrl ? (
                unsyncedCount > 0 ? (
                  <span className="text-warning font-bold animate-pulse flex items-centralizados gap-1">
                    <Cloud size={10} />
                    ☁️ {unsyncedCount} RETIDOS
                  </span>
                ) : (
                  <span className="text-success font-bold flex items-centralizados gap-1">
                    <Cloud size={10} />
                    ☁️ GOOGLE SHEETS OK
                  </span>
                )
              ) : (
                <span className="text-warning font-bold flex items-centralizados gap-1">
                  <Cloud size={10} />
                  ☁️ CONFIGURAR LIGAÇÃO
                </span>
              )}

              <span className="text-terminal-border/50">•</span>
              {user ? (
                <span className="text-terminal-accent font-bold flex items-centralizados gap-1 animate-pulse">
                  <Cloud size={10} />
                  ⚡ POSTGRESQL CLOUD OK
                </span>
              ) : (
                <span className="text-terminal-text opacity-40 flex items-centralizados gap-1">
                  <Cloud size={10} />
                  ⚡ MODALIDADE LOCAL
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-centralizados gap-2 mt-1 text-[0.55rem] text-terminal-text opacity-80 font-mono justify-start md:justify-end">
              {user ? (
                <>
                  <span>OPERANDO COMO: <strong className="text-white uppercase">{user.displayName || user.email}</strong></span>
                  <span className="text-terminal-border/50">•</span>
                  <button
                    onClick={async () => {
                      await signOut(auth);
                      addToast("Sessão terminada.", 'var(--color-info)');
                    }}
                    className="px-1.5 py-0.5 bg-terminal-accent/10 border border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent hover:text-black rounded cursor-pointer transition-all"
                  >
                    SAIR DA CONTA
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsGuestMode(false);
                    localStorage.setItem('repro_guest_mode', 'false');
                  }}
                  className="px-2 py-0.5 bg-terminal-accent/15 border border-terminal-accent/40 text-terminal-accent hover:bg-terminal-accent hover:text-black rounded cursor-pointer transition-all uppercase tracking-wider font-bold"
                >
                  CONECTAR CLOUD POSTGRESQL ⚡
                </button>
              )}
            </div>
            
            <div className="text-terminal-text opacity-30 text-para-a-direita">
              ÚLTIMA SYNC: <span>{lastSyncTime}</span>
            </div>
            
            <div id="visual-cue-save" className="opacity-0 transition-opacity duration-300 text-info text-[0.5rem] font-bold">
              [ AUTO-SAVE SECURE ]
            </div>
          </div>
        </header>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex border-b border-terminal-border/30 gap-1 pb-px font-mono">
          <button
            onClick={() => handleTabChange('painel')}
            className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'painel'
                ? 'border-terminal-accent text-white bg-terminal-panel/20'
                : 'border-transparent text-terminal-text opacity-55 hover:opacity-85 hover:bg-terminal-panel/5'
            }`}
          >
            <LayoutDashboard size={14} className={activeTab === 'painel' ? 'text-terminal-accent' : ''} />
            <span>Painel Operacional</span>
          </button>
          
          <button
            onClick={() => handleTabChange('historico')}
            className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'historico'
                ? 'border-terminal-accent text-white bg-terminal-panel/20'
                : 'border-transparent text-terminal-text opacity-55 hover:opacity-85 hover:bg-terminal-panel/5'
            }`}
          >
            <History size={14} className={activeTab === 'historico' ? 'text-terminal-accent' : ''} />
            <span>Histórico de Logs</span>
          </button>

          <button
            onClick={() => handleTabChange('followup')}
            className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'followup'
                ? 'border-terminal-accent text-white bg-terminal-panel/20'
                : 'border-transparent text-terminal-text opacity-55 hover:opacity-85 hover:bg-terminal-panel/5'
            }`}
          >
            <CalendarClock size={14} className={activeTab === 'followup' ? 'text-terminal-accent' : ''} />
            <span>Follow-up Semanal</span>
          </button>
        </div>

        {/* CONTEÚDO DINÂMICO DE ACORDO COM A ABA ATIVA */}
        {activeTab === 'painel' && (
          <div className="space-y-8 animate-fade-in">
            {/* 1. MÉTRICAS SESSÃO */}
            <DashboardMetrics logs={filteredLogs} />

            {/* 2. DUAL STOPWATCHES & BASE STATUS */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              
              <div className="lg:col-span-3 space-y-8">
                <StopwatchPanel
                  timerState={timerState}
                  colabHistory={colabHistory}
                  inputOpen={inputOpen}
                  onStartTimer={startTimer}
                  onPauseTimer={pauseTimer}
                  onStopTimer={stopTimer}
                  onCancelTimer={cancelTimer}
                  onSaveTimer={saveTimer}
                  activeOperator={activeOperator}
                  onActiveOperatorChange={(op) => {
                    setActiveOperator(op);
                    localStorage.setItem('repro_active_operator', op);
                  }}
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                />
                
                <section className="p-4 px-6 rounded-sm bg-terminal-panel/30 text-xs">
                  <div className="font-bold tracking-widest uppercase text-center">
                    <div className="flex flex-col md:flex-row justify-between w-full opacity-80 gap-2 font-bold text-center">
                      <span className={timerState.cronometro?.ativo ? (timerState.cronometro?.tipo === 'indireta' ? 'text-warning' : 'text-terminal-accent') : 'text-terminal-text/50'}>
                        {timerState.cronometro?.ativo
                          ? `${timerState.cronometro?.atividade} [${Math.floor((timerState.cronometro?.segundos || 0) / 3600)}h]`
                          : (timerState.cronometro?.segundos || 0) > 0
                          ? `PAUSADO [${Math.floor((timerState.cronometro?.segundos || 0) / 3600)}h]`
                          : 'INATIVO'}
                      </span>
                      <span className="hidden md:inline text-terminal-border">•</span>
                      
                    </div>
                  </div>
                </section>
              </div>

              {/* STATUS DA BASE / SIDEBAR CONFIGS */}
              <div className="space-y-8">
                
                <section className="border-panel p-6 rounded-sm">
                  <h2 className="text-xs font-bold text-white uppercase tracking-widest mb-4 border-b border-terminal-border/40 pb-2 opacity-60">
                    [STATUS DA BASE]
                  </h2>
                  <div className="space-y-3.5 text-[0.65rem] tracking-widest">
                    <div className="flex justify-between">
                      <span className="text-terminal-text opacity-40">Motor DB:</span>
                      <span className="text-terminal-accent font-bold">IndexedDB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-text opacity-40">Registos Totais:</span>
                      <span className="text-white font-bold">{logs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-text opacity-40">Sincronizados:</span>
                      <span className="text-success font-bold">{syncedCount}</span>
                    </div>
                    <div className="flex justify-between border-t border-terminal-border/40 pt-3 mt-1">
                      <span className="text-warning font-bold">Fila Retida:</span>
                      <span className="text-warning font-bold animate-pulse">{unsyncedCount}</span>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <button
                      onClick={() => sincronizarFila(true)}
                      disabled={isSyncing}
                      className="w-full btn-term border-terminal-border py-2.5 text-[0.55rem] font-bold uppercase rounded-sm hover:border-terminal-accent/40 cursor-pointer flex justify-centralizado items-centralizados gap-1"
                    >
                      <RefreshCw size={10} className={isSyncing ? 'animate-spin text-terminal-accent' : 'text-success'} />
                      <span>🟢 SYNC ONLINE</span>
                    </button>
                  </div>
                </section>

                {/* FOCO SETORIAL */}
                

                <section className="border-panel p-6 rounded-sm space-y-4">
                  <h2 className="text-[0.55rem] font-bold text-terminal-text opacity-40 uppercase tracking-widest border-b border-terminal-border/40 pb-2">
                    BACKUP SEGURO
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleExportBackup}
                      className="btn-term text-[0.55rem] py-2 uppercase font-bold text-info border-info/10 hover:border-info/40 rounded-sm cursor-pointer"
                    >
                      JSON / CSV
                    </button>
                    <button
                      onClick={importarPlanilha}
                      disabled={isImporting}
                      className="btn-term text-[0.55rem] py-2 uppercase font-bold text-info border-info/10 hover:border-info/40 rounded-sm cursor-pointer flex justify-centralizado items-centralizados gap-1"
                    >
                      {isImporting ? 'LENDO...' : 'IMPOR TAR'}
                    </button>
                  </div>
                  <button
                    onClick={importarPlanilha}
                    disabled={isImporting}
                    className="w-full btn-term border-info text-info py-2 text-[0.55rem] font-bold uppercase rounded-sm hover:bg-info/5 flex justify-centralizado items-centralizados gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span>⬇️ IMPORTAR DA NUVEM</span>
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
            />
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="animate-fade-in">
            <HistoryTab 
              logs={logs} 
              onRefresh={async () => {
                const refreshedLogs = await getLogs();
                setLogs(refreshedLogs);
              }} 
              onAddToast={addToast} 
            />
          </div>
        )}

        {activeTab === 'followup' && (
          <div className="animate-fade-in">
            <WeeklyFollowupTab logs={filteredLogs} onAddToast={addToast} />
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
    </div>
  );
}
