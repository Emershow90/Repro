/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Log, ReproDemand, ActiveSession, OperationalEvent } from '../types';
import { 
  MapPin, 
  Clock, 
  Play, 
  Pause, 
  RotateCcw, 
  Box, 
  Plus, 
  Minus,
  Undo2, 
  Smartphone, 
  Volume2, 
  VolumeX, 
  Keyboard,
  Moon,
  Sun,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Search,
  CheckCircle2,
  Sparkles,
  Flame,
  Award,
  Calculator
} from 'lucide-react';
import ReproCalculatorModal from './ReproCalculatorModal';
import { 
  calculateDurationFromTimes, 
  formatDateToBR, 
  parseDateString, 
  getDayOfWeekName, 
  getWeekNumber,
  formatTimeToHHMM 
} from '../utils/dateUtils';
import { 
  SECTOR_87_STREETS,
  SECTOR_88_STREETS,
  SECTOR_89_STREETS,
  SECTOR_90_STREETS,
  ALL_CONFIGURED_STREETS,
  inferSectorFromStreet 
} from '../data/streetData';
import { pdtAudio } from '../utils/pdtAudio';
import { saveState, getState, enqueueOperationalEvent } from '../dbLocal';
import { useUIStore } from '../stores/uiStore';

interface StreetReplenishmentModuleProps {
  logs: Log[];
  activeOperator: string;
  activeSectorId: string;
  onSaveLog: (log: Log) => Promise<void>;
  onAddToast: (msg: string, color?: string) => void;
}

const STORAGE_ACTIVE_SESSION_KEY = 'repro_active_session_organism_v5';
const STORAGE_EVENTS_KEY = 'repro_operational_events_v5';
const STORAGE_DEMANDS_KEY = 'repro_demands_v5';

const toSafeNumber = (val: any): number => {
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : val;
  }
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  }
  return 0;
};

export default function StreetReplenishmentModule({
  logs,
  activeOperator,
  activeSectorId,
  onSaveLog,
  onAddToast
}: StreetReplenishmentModuleProps) {
  // Modo PDT Zebra (800x480)
  const [pdtMode, setPdtMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('repro_zebra_pdt_mode');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const [soundActive, setSoundActive] = useState<boolean>(() => pdtAudio.isEnabled());

  // Setores oficiais (87, 88, 89, 90, all)
  const [streetSectorFilter, setStreetSectorFilter] = useState<string>(() => {
    if (['87', '88', '89', '90'].includes(activeSectorId)) return activeSectorId;
    return '87';
  });

  // Rua e Unidade do Realizado
  const [selectedStreet, setSelectedStreet] = useState<string>('B4VD');
  const [customStreet, setCustomStreet] = useState('');
  const [unidadeRealizado, setUnidadeRealizado] = useState<'CAIXAS' | 'VOLUMES'>('CAIXAS');

  // Contadores
  const [addressCount, setAddressCount] = useState<number>(0);
  const [volumeCount, setVolumeCount] = useState<number>(0);
  const [defaultVolPerAddress, setDefaultVolPerAddress] = useState<number>(1);

  // Pilha de Eventos Operacionais (Audit Trail)
  const [eventHistory, setEventHistory] = useState<OperationalEvent[]>([]);

  // Cronômetro
  const [timeMode, setTimeMode] = useState<'cronometro' | 'manual'>('cronometro');
  const [stopwatchActive, setStopwatchActive] = useState<boolean>(false);
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);
  const [stopwatchStartTs, setStopwatchStartTs] = useState<number | null>(null);
  const [lastLapDuration, setLastLapDuration] = useState<number | null>(null);
  const [lastLapTimestamp, setLastLapTimestamp] = useState<number | null>(null);
  const [currentAddressSeconds, setCurrentAddressSeconds] = useState<number>(0);

  // Manual times
  const [manualStartTime, setManualStartTime] = useState('08:00');
  const [manualEndTime, setManualEndTime] = useState('08:45');

  // Data da Operação
  const [operationDate, setOperationDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Descanso de tela (Screensaver Global & Local)
  const { 
    screensaverEnabled, 
    screensaverActive, 
    screensaverTimeout,
    setScreensaverActive, 
    updateScreensaverEnabled 
  } = useUIStore();
  const idleTimeoutSeconds = Math.max(30, screensaverTimeout * 60);

  // Gamificação Visual & Feedback Efêmero
  const [flashReward, setFlashReward] = useState<string | null>(null);
  const [touchPulse, setTouchPulse] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Busca e Ajuste Modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Justificativa rápida para reduções
  const [reductionPending, setReductionPending] = useState<{ amount: number } | null>(null);
  const [customJustification, setCustomJustification] = useState('');

  // Demandas do REPRO
  const [reproDemands, setReproDemands] = useState<Record<string, ReproDemand>>({});
  const [showDemandModal, setShowDemandModal] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [inputDemandValue, setInputDemandValue] = useState<string>('');
  const [inputDemandUnit, setInputDemandUnit] = useState<'CAIXAS' | 'VOLUMES'>('CAIXAS');

  // Referência para sessionId persistente
  const sessionIdRef = useRef<string>(`sess_${Date.now()}`);

  const effectiveStreet = (selectedStreet === 'OUTRA' ? customStreet : selectedStreet).trim().toUpperCase();
  const inferredSector = inferSectorFromStreet(effectiveStreet);

  // Ruas disponíveis no filtro
  const availableStreets = useMemo(() => {
    if (streetSectorFilter === '87') return SECTOR_87_STREETS;
    if (streetSectorFilter === '88') return SECTOR_88_STREETS;
    if (streetSectorFilter === '89') return SECTOR_89_STREETS;
    if (streetSectorFilter === '90') return SECTOR_90_STREETS;
    return ALL_CONFIGURED_STREETS;
  }, [streetSectorFilter]);

  // Carregar Demandas do REPRO do IndexedDB ao iniciar
  useEffect(() => {
    (async () => {
      try {
        const savedDemands = await getState<Record<string, ReproDemand>>(STORAGE_DEMANDS_KEY);
        if (savedDemands) {
          setReproDemands(savedDemands);
        } else {
          // Fallback localStorage
          const local = localStorage.getItem(STORAGE_DEMANDS_KEY);
          if (local) setReproDemands(JSON.parse(local));
        }
      } catch (e) {
        console.warn('Erro ao carregar demandas do REPRO', e);
      }
    })();
  }, []);

  // Chave lógica de demanda: DATA + SETOR + RUA
  const currentDemandKey = `${operationDate}_${inferredSector}_${effectiveStreet}`;
  const activeReproDemand = reproDemands[currentDemandKey] || null;
  const isDemandLoaded = Boolean(activeReproDemand && activeReproDemand.demandaCalculada > 0);
  const demandValue = isDemandLoaded ? activeReproDemand!.demandaCalculada : null;
  const demandUnit = isDemandLoaded ? activeReproDemand!.unidade : null;

  // Realizado consolidado do dia para esta rua
  const historicalStreetVolumesToday = useMemo(() => {
    const formattedTargetDate = formatDateToBR(parseDateString(operationDate) || new Date());
    return logs.reduce((acc, l) => {
      const act = (l.atividade || '').toUpperCase();
      const ruaLog = (l.rua || act.replace(/REABASTECIMENTO\s*-\s*/i, '')).trim().toUpperCase();
      if (l.data === formattedTargetDate && ruaLog === effectiveStreet && act.includes('REABASTECIMENTO')) {
        return acc + toSafeNumber(l.volumes);
      }
      return acc;
    }, 0);
  }, [logs, operationDate, effectiveStreet]);

  const totalRealizadoHoje = historicalStreetVolumesToday + volumeCount;

  // Checagem de Compatibilidade de Unidades
  const isUnitCompatible = isDemandLoaded && demandUnit === unidadeRealizado;

  // Cálculos Oficiais do REPRO (Sem suposições de média e sem a palavra meta)
  const saldoPendente = (isDemandLoaded && isUnitCompatible && demandValue !== null)
    ? Math.max(0, demandValue - totalRealizadoHoje)
    : null;

  const excedente = (isDemandLoaded && isUnitCompatible && demandValue !== null)
    ? Math.max(0, totalRealizadoHoje - demandValue)
    : 0;

  const coberturaPercent = (isDemandLoaded && isUnitCompatible && demandValue !== null && demandValue > 0)
    ? Number(((totalRealizadoHoje / demandValue) * 100).toFixed(1))
    : null;

  // Recuperação Inicial de Sessão Ativa do IndexedDB
  useEffect(() => {
    (async () => {
      try {
        const savedSession = await getState<ActiveSession>(STORAGE_ACTIVE_SESSION_KEY);
        const savedEvents = await getState<OperationalEvent[]>(STORAGE_EVENTS_KEY);

        if (savedSession && savedSession.rua) {
          sessionIdRef.current = savedSession.id;
          setSelectedStreet(savedSession.rua);
          setAddressCount(savedSession.enderecos || 0);
          setVolumeCount(savedSession.volumes || 0);
          if (savedSession.unidadeRealizado) setUnidadeRealizado(savedSession.unidadeRealizado);
          if (savedSession.defaultVolPerAddress) setDefaultVolPerAddress(savedSession.defaultVolPerAddress);
          if (savedSession.data) setOperationDate(savedSession.data);

          if (savedSession.cronometro?.ativo && savedSession.cronometro?.iniciadoEm) {
            const elapsed = Math.floor((Date.now() - savedSession.cronometro.iniciadoEm) / 1000);
            setStopwatchSeconds(elapsed);
            setStopwatchStartTs(savedSession.cronometro.iniciadoEm);
            setStopwatchActive(true);
          } else if (savedSession.cronometro?.tempoAcumuladoMs) {
            setStopwatchSeconds(Math.floor(savedSession.cronometro.tempoAcumuladoMs / 1000));
            setStopwatchActive(false);
          }
        }

        if (savedEvents && Array.isArray(savedEvents)) {
          setEventHistory(savedEvents);
        }
      } catch (e) {
        console.warn('Erro ao restaurar ActiveSession do IndexedDB', e);
      }
    })();
  }, []);

  // Função Mestre de Persistência Atômica a cada Evento (Salva ActiveSession + OperationalEvents)
  const persistState = useCallback(async (
    nextAddr: number,
    nextVol: number,
    swActive: boolean,
    swSecs: number,
    swStart: number | null,
    events: OperationalEvent[],
    stName: string,
    opDate: string,
    unit: 'CAIXAS' | 'VOLUMES',
    volPerAddr: number
  ) => {
    const sId = sessionIdRef.current;
    const now = Date.now();

    const activeSession: ActiveSession = {
      id: sId,
      data: opDate,
      setor: inferSectorFromStreet(stName),
      rua: stName,
      demandaRepro: demandValue,
      unidade: demandUnit,
      realizado: historicalStreetVolumesToday + nextVol,
      enderecos: nextAddr,
      volumes: nextVol,
      unidadeRealizado: unit,
      defaultVolPerAddress: volPerAddr,
      cronometro: {
        ativo: swActive,
        iniciadoEm: swActive ? (swStart || now) : undefined,
        tempoAcumuladoMs: swSecs * 1000
      },
      atualizadoEm: now
    };

    try {
      await Promise.all([
        saveState(STORAGE_ACTIVE_SESSION_KEY, activeSession),
        saveState(STORAGE_EVENTS_KEY, events)
      ]);
      // Espelho de segurança no localStorage
      localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, JSON.stringify(activeSession));

      // Se houver um evento recém-adicionado, enfileira para sincronização sem travar o operador
      if (events.length > 0) {
        const latestEvent = events[events.length - 1];
        await enqueueOperationalEvent({
          ...latestEvent,
          colaborador: activeOperator,
          data: opDate,
          demandaCalculada: demandValue || undefined,
          unidade: demandUnit || undefined,
          totalRealizadoAteAgora: historicalStreetVolumesToday + nextVol
        });
      }
    } catch (err) {
      console.error('Erro ao persistir ActiveSession no IndexedDB', err);
    }
  }, [demandValue, demandUnit, historicalStreetVolumesToday, activeOperator]);

  const clearSession = useCallback(async () => {
    try {
      sessionIdRef.current = `sess_${Date.now()}`;
      await Promise.all([
        saveState(STORAGE_ACTIVE_SESSION_KEY, null),
        saveState(STORAGE_EVENTS_KEY, [])
      ]);
      localStorage.removeItem(STORAGE_ACTIVE_SESSION_KEY);
    } catch (e) {
      console.error('Erro ao limpar sessão', e);
    }
  }, []);

  // Timer do Cronômetro
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (stopwatchActive && stopwatchStartTs) {
      interval = setInterval(() => {
        const secs = Math.floor((Date.now() - stopwatchStartTs) / 1000);
        setStopwatchSeconds(secs);
        
        if (lastLapTimestamp) {
          setCurrentAddressSeconds(Math.floor((Date.now() - lastLapTimestamp) / 1000));
        } else {
          setCurrentAddressSeconds(secs);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [stopwatchActive, stopwatchStartTs, lastLapTimestamp]);

  // Screensaver Inatividade Timer (Preserva Cronômetro em Segundo Plano)
  useEffect(() => {
    if (!screensaverEnabled) {
      if (screensaverActive) setScreensaverActive(false);
      return;
    }
    if (screensaverActive) return;

    let timeoutId: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (screensaverEnabled) {
          setScreensaverActive(true);
        }
      }, idleTimeoutSeconds * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [screensaverEnabled, screensaverActive, idleTimeoutSeconds, setScreensaverActive]);

  // Disparar Flash Feedback Efêmero
  const triggerFlashFeedback = (msg: string) => {
    setFlashReward(msg);
    setTimeout(() => setFlashReward(null), 1200);
  };

  // Controles do Cronômetro com Eventos Operacionais
  const handleStartStopwatch = () => {
    const now = Date.now();
    const startTs = now - stopwatchSeconds * 1000;
    setStopwatchStartTs(startTs);
    setStopwatchActive(true);
    if (!lastLapTimestamp) setLastLapTimestamp(now);

    const event: OperationalEvent = {
      id: `evt_${Date.now()}`,
      timestamp: now,
      tipo: 'RETOMADA',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: 0,
      volumesDelta: 0
    };

    const updatedEvents = [...eventHistory, event];
    setEventHistory(updatedEvents);

    pdtAudio.playStartTimer();
    persistState(addressCount, volumeCount, true, stopwatchSeconds, startTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
    onAddToast(`Cronômetro iniciado: ${effectiveStreet}`, 'var(--color-terminal-accent)');
  };

  const handlePauseStopwatch = () => {
    setStopwatchActive(false);
    const now = Date.now();

    const event: OperationalEvent = {
      id: `evt_${Date.now()}`,
      timestamp: now,
      tipo: 'PAUSA',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: 0,
      volumesDelta: 0
    };

    const updatedEvents = [...eventHistory, event];
    setEventHistory(updatedEvents);

    pdtAudio.playPauseTimer();
    persistState(addressCount, volumeCount, false, stopwatchSeconds, stopwatchStartTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
    onAddToast('Pausa operacional registrada.', 'var(--color-terminal-accent)');
  };

  const handleResetStopwatch = () => {
    setStopwatchActive(false);
    setStopwatchSeconds(0);
    setStopwatchStartTs(null);
    setLastLapDuration(null);
    setLastLapTimestamp(null);
    setCurrentAddressSeconds(0);
    pdtAudio.playUndoTone();
    persistState(addressCount, volumeCount, false, 0, null, eventHistory, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
  };

  // EVENTO OPERACIONAL MESTRE: "+1 ENDEREÇO CONCLUÍDO"
  const handleQuickAddAddress = useCallback(() => {
    const now = Date.now();
    
    // Auto-inicia o cronômetro se estiver parado
    let nextStartTs = stopwatchStartTs;
    let nextSwActive = stopwatchActive;
    if (!stopwatchActive && timeMode === 'cronometro') {
      nextStartTs = now - stopwatchSeconds * 1000;
      setStopwatchStartTs(nextStartTs);
      setStopwatchActive(true);
      nextSwActive = true;
    }

    // Cálculo do Lap
    let lap = stopwatchSeconds;
    if (lastLapTimestamp) {
      lap = Math.floor((now - lastLapTimestamp) / 1000);
      setLastLapDuration(lap);
    } else if (stopwatchSeconds > 0) {
      setLastLapDuration(stopwatchSeconds);
    }
    setLastLapTimestamp(now);
    setCurrentAddressSeconds(0);

    const deltaAddr = 1;
    const deltaVol = defaultVolPerAddress > 0 ? defaultVolPerAddress : 0;

    const nextAddr = addressCount + deltaAddr;
    const nextVol = volumeCount + deltaVol;

    const event: OperationalEvent = {
      id: `evt_${Date.now()}`,
      timestamp: now,
      tipo: 'ENDERECO_CONCLUIDO',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: deltaAddr,
      volumesDelta: deltaVol,
      lapDurationSeconds: lap,
      previousState: {
        enderecos: addressCount,
        volumes: volumeCount,
        realizado: historicalStreetVolumesToday + volumeCount
      }
    };

    const updatedEvents = [...eventHistory, event];

    // Atualiza estados
    setAddressCount(nextAddr);
    setVolumeCount(nextVol);
    setEventHistory(updatedEvents);

    // Persistência imediata no IndexedDB
    persistState(nextAddr, nextVol, nextSwActive, stopwatchSeconds, nextStartTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);

    // Feedback visual e acústico
    pdtAudio.playClickBeep();
    pdtAudio.triggerHaptic(45);
    setTouchPulse(true);
    setTimeout(() => setTouchPulse(false), 200);

    // Gamificação: Feedback efêmero de avanço
    if (isDemandLoaded && isUnitCompatible && demandValue !== null) {
      const prevTotal = historicalStreetVolumesToday + volumeCount;
      const newTotal = historicalStreetVolumesToday + nextVol;
      if (prevTotal < demandValue && newTotal >= demandValue) {
        pdtAudio.playSuccessChime();
        triggerFlashFeedback('✓ DEMANDA ATENDIDA!');
      } else {
        triggerFlashFeedback('✓ ENDEREÇO CONCLUÍDO');
      }
    } else {
      triggerFlashFeedback('✓ ENDEREÇO CONCLUÍDO');
    }
  }, [
    stopwatchActive, 
    timeMode, 
    stopwatchSeconds, 
    stopwatchStartTs, 
    lastLapTimestamp, 
    defaultVolPerAddress, 
    addressCount, 
    volumeCount, 
    eventHistory, 
    effectiveStreet, 
    operationDate, 
    inferredSector, 
    historicalStreetVolumesToday, 
    unidadeRealizado, 
    isDemandLoaded, 
    isUnitCompatible, 
    demandValue, 
    persistState
  ]);

  // DESFAZER ATÔMICO COM RESTAURAÇÃO DE AUDITORIA
  const handleUndoLastEvent = useCallback(() => {
    if (eventHistory.length === 0) {
      if (addressCount > 0) {
        setAddressCount(prev => Math.max(0, prev - 1));
      }
      pdtAudio.playUndoTone();
      return;
    }

    // Localiza o último evento passível de reversão (ENDERECO_CONCLUIDO, AJUSTE_VOLUME, REDUCAO_VOLUME)
    const lastValidIdx = [...eventHistory].reverse().findIndex(
      e => ['ENDERECO_CONCLUIDO', 'AJUSTE_VOLUME', 'REDUCAO_VOLUME'].includes(e.tipo)
    );

    if (lastValidIdx === -1) {
      pdtAudio.playUndoTone();
      return;
    }

    const actualIdx = eventHistory.length - 1 - lastValidIdx;
    const targetEvent = eventHistory[actualIdx];

    const nextAddr = Math.max(0, addressCount - targetEvent.enderecosDelta);
    const nextVol = Math.max(0, volumeCount - targetEvent.volumesDelta);

    const undoEvent: OperationalEvent = {
      id: `evt_undo_${Date.now()}`,
      timestamp: Date.now(),
      tipo: 'DESFAZER',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: -targetEvent.enderecosDelta,
      volumesDelta: -targetEvent.volumesDelta,
      previousState: {
        enderecos: addressCount,
        volumes: volumeCount,
        realizado: historicalStreetVolumesToday + volumeCount
      }
    };

    const updatedEvents = [...eventHistory.slice(0, actualIdx), undoEvent];

    setAddressCount(nextAddr);
    setVolumeCount(nextVol);
    setEventHistory(updatedEvents);

    pdtAudio.playUndoTone();
    pdtAudio.triggerHaptic(60);

    persistState(nextAddr, nextVol, stopwatchActive, stopwatchSeconds, stopwatchStartTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
    onAddToast('Último evento desfeito com sucesso.', 'var(--color-danger)');
  }, [
    eventHistory, 
    addressCount, 
    volumeCount, 
    stopwatchActive, 
    stopwatchSeconds, 
    stopwatchStartTs, 
    inferredSector, 
    effectiveStreet, 
    operationDate, 
    unidadeRealizado, 
    defaultVolPerAddress, 
    historicalStreetVolumesToday, 
    persistState, 
    onAddToast
  ]);

  // Microajustes Positivos de Volume
  const handleAddVolumeDirect = (amt: number) => {
    const nextVol = Math.max(0, volumeCount + amt);
    const event: OperationalEvent = {
      id: `evt_${Date.now()}`,
      timestamp: Date.now(),
      tipo: 'AJUSTE_VOLUME',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: 0,
      volumesDelta: amt
    };

    const updatedEvents = [...eventHistory, event];
    setVolumeCount(nextVol);
    setEventHistory(updatedEvents);
    pdtAudio.playClickBeep();
    pdtAudio.triggerHaptic(35);

    persistState(addressCount, nextVol, stopwatchActive, stopwatchSeconds, stopwatchStartTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
  };

  // Aplica Caixas calculadas pela Calculadora REPRO (PCB x EU)
  const handleApplyCalculatorBoxes = (boxes: number, totalPieces: number, pcbVal: number) => {
    if (boxes > 0) {
      handleAddVolumeDirect(boxes);
      onAddToast(`Calculado: +${boxes} ${unidadeRealizado === 'CAIXAS' ? 'cx' : 'vol'} (${totalPieces} peças @ PCB ${pcbVal})`, 'var(--color-terminal-accent)');
    }
  };

  // Microajuste Negativo com Justificativa Rápida
  const handleConfirmReduction = (justification: string) => {
    if (!reductionPending) return;
    const amt = reductionPending.amount;
    const nextVol = Math.max(0, volumeCount - amt);

    const event: OperationalEvent = {
      id: `evt_${Date.now()}`,
      timestamp: Date.now(),
      tipo: 'REDUCAO_VOLUME',
      sessionId: sessionIdRef.current,
      setor: inferredSector,
      rua: effectiveStreet,
      enderecosDelta: 0,
      volumesDelta: -amt,
      justification
    };

    const updatedEvents = [...eventHistory, event];
    setVolumeCount(nextVol);
    setEventHistory(updatedEvents);
    setReductionPending(null);
    setCustomJustification('');

    pdtAudio.playUndoTone();
    persistState(addressCount, nextVol, stopwatchActive, stopwatchSeconds, stopwatchStartTs, updatedEvents, effectiveStreet, operationDate, unidadeRealizado, defaultVolPerAddress);
    onAddToast(`Redução de -${amt} volume(s) [${justification}]`, 'var(--color-terminal-accent)');
  };

  // Gravar / Salvar Demanda REPRO no IndexedDB
  const handleSaveReproDemand = async () => {
    const parsed = parseFloat(inputDemandValue);
    if (isNaN(parsed) || parsed <= 0) {
      onAddToast('Informe um valor de demanda válido.', 'var(--color-danger)');
      return;
    }

    const updated: Record<string, ReproDemand> = {
      ...reproDemands,
      [currentDemandKey]: {
        id: `dem_${Date.now()}`,
        data: operationDate,
        setor: inferredSector,
        rua: effectiveStreet,
        demandaCalculada: parsed,
        unidade: inputDemandUnit
      }
    };

    setReproDemands(updated);
    try {
      await saveState(STORAGE_DEMANDS_KEY, updated);
      localStorage.setItem(STORAGE_DEMANDS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao salvar demanda no IndexedDB', e);
    }

    setShowDemandModal(false);
    setInputDemandValue('');
    pdtAudio.playSuccessChime();
    onAddToast(`Demanda REPRO de ${parsed} ${inputDemandUnit} carregada para ${effectiveStreet}.`, 'var(--color-success)');
  };

  // Horas Decimais
  const calculatedHours: number = useMemo(() => {
    if (timeMode === 'cronometro') {
      const safeSecs = toSafeNumber(stopwatchSeconds);
      return safeSecs > 0 ? Number((safeSecs / 3600).toFixed(2)) : 0;
    }
    const durationObj = calculateDurationFromTimes(manualStartTime, manualEndTime);
    if (durationObj && typeof durationObj.decimalHours === 'number') {
      const safeDecimal = toSafeNumber(durationObj.decimalHours);
      return Number(safeDecimal.toFixed(2));
    }
    return 0;
  }, [timeMode, stopwatchSeconds, manualStartTime, manualEndTime]);

  // Indicadores de Ritmo
  const currentEPH = useMemo(() => {
    const h = toSafeNumber(calculatedHours);
    const e = toSafeNumber(addressCount);
    if (h > 0 && e > 0) {
      const eph = e / h;
      return isFinite(eph) ? eph.toFixed(1) : '0.0';
    }
    return '0.0';
  }, [calculatedHours, addressCount]);

  const currentVPH = useMemo(() => {
    const h = toSafeNumber(calculatedHours);
    const v = toSafeNumber(volumeCount);
    if (h > 0 && v > 0) {
      const vph = v / h;
      return isFinite(vph) ? vph.toFixed(1) : '0.0';
    }
    return '0.0';
  }, [calculatedHours, volumeCount]);

  const currentTempoPorEnderecoFormatted = useMemo(() => {
    const e = toSafeNumber(addressCount);
    const h = toSafeNumber(calculatedHours);
    if (e > 0 && h > 0) {
      const totalSecs = Math.round((h * 3600) / e);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }
    return '0:00';
  }, [addressCount, calculatedHours]);

  // Nível de Ritmo Gamificado Baseado em Consistência (Não em Corrida Agressiva)
  const rhythmLevel = useMemo(() => {
    if (addressCount === 0) return { level: 1, title: 'Início da Fase', stars: '●○○○○' };
    const ephNum = parseFloat(currentEPH);
    if (ephNum >= 35) return { level: 5, title: 'Excelência Operacional', stars: '●●●●●' };
    if (ephNum >= 28) return { level: 4, title: 'Alta Consistência', stars: '●●●●○' };
    if (ephNum >= 20) return { level: 3, title: 'Ritmo Fluido', stars: '●●●○○' };
    if (ephNum >= 12) return { level: 2, title: 'Ritmo Estável', stars: '●●○○○' };
    return { level: 1, title: 'Ritmo Inicial', stars: '●○○○○' };
  }, [addressCount, currentEPH]);

  // Finalização e Gravação Oficial do Log
  const handleSaveReplenishment = useCallback(async () => {
    if (!effectiveStreet) {
      onAddToast('Por favor, informe ou selecione a rua.', 'var(--color-danger)');
      return;
    }
    if (!activeOperator) {
      onAddToast('Defina o nome do operador no painel superior antes de gravar.', 'var(--color-danger)');
      return;
    }
    if (addressCount <= 0) {
      onAddToast('Adicione pelo menos 1 endereço atendido.', 'var(--color-danger)');
      return;
    }
    if (volumeCount <= 0) {
      onAddToast('Informe a quantidade de volumes abastecidos.', 'var(--color-danger)');
      return;
    }
    if (calculatedHours <= 0) {
      onAddToast('O tempo da atividade deve ser maior que 0 horas.', 'var(--color-danger)');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedDate = parseDateString(operationDate) || new Date();
      const formattedDate = formatDateToBR(parsedDate);
      const diaSemana = getDayOfWeekName(parsedDate);
      const semanaAno = getWeekNumber(parsedDate);

      const hInicio = timeMode === 'cronometro'
        ? (stopwatchStartTs ? formatTimeToHHMM(new Date(stopwatchStartTs)) : undefined)
        : manualStartTime;
      const hFim = timeMode === 'cronometro'
        ? formatTimeToHHMM(new Date())
        : manualEndTime;

      const safeVols = toSafeNumber(volumeCount);
      const safeEnds = toSafeNumber(addressCount);
      const safeHrs = toSafeNumber(calculatedHours);

      const computedVph = safeHrs > 0 ? (safeVols / safeHrs).toFixed(1) : "0.0";
      const computedEph = safeHrs > 0 ? (safeEnds / safeHrs).toFixed(1) : "0.0";
      const computedMedia = safeEnds > 0 ? Number((safeVols / safeEnds).toFixed(1)) : 0;

      const newLog: Log = {
        id: Date.now(),
        data: formattedDate,
        dia: diaSemana,
        semana: semanaAno,
        setor: inferredSector,
        rua: effectiveStreet,
        atividade: `REABASTECIMENTO - ${effectiveStreet}`,
        tipo: 'direta',
        colaborador: activeOperator.toUpperCase(),
        volumes: safeVols,
        horas: safeHrs,
        vph: computedVph,
        eph: computedEph,
        enderecos: safeEnds,
        mediaPorEndereco: computedMedia,
        timestamp: Date.now(),
        horaInicio: hInicio,
        horaFim: hFim,
        synced: false
      };

      await onSaveLog(newLog);

      pdtAudio.playSuccessChime();
      triggerFlashFeedback('★ RUA CONCLUÍDA!');
      onAddToast(`Apontamento de ${effectiveStreet} gravado com sucesso! (${safeEnds} end • ${safeVols} ${unidadeRealizado.toLowerCase()})`, 'var(--color-success)');

      // Limpeza de estado e fechamento de sessão
      setAddressCount(0);
      setVolumeCount(0);
      setEventHistory([]);
      handleResetStopwatch();
      await clearSession();
    } catch (err: any) {
      onAddToast(`Erro ao gravar: ${err?.message || 'Erro inesperado'}`, 'var(--color-danger)');
      pdtAudio.playUndoTone();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    effectiveStreet, 
    inferredSector, 
    activeOperator, 
    addressCount, 
    volumeCount, 
    calculatedHours, 
    operationDate, 
    timeMode, 
    stopwatchStartTs, 
    manualStartTime, 
    manualEndTime, 
    unidadeRealizado,
    onSaveLog, 
    onAddToast, 
    clearSession
  ]);

  // Teclado Físico do Zebra MC300
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.tagName === 'SELECT'
    );

    if (!isInputFocused && !reductionPending && !showDemandModal && !showSearchModal) {
      // ENTER / + : +1 Endereço Concluído
      if (e.key === 'Enter' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        handleQuickAddAddress();
        return;
      }

      // - / Backspace : Desfazer Último Evento
      if (e.key === '-' || e.code === 'NumpadSubtract' || e.key === 'Backspace') {
        e.preventDefault();
        handleUndoLastEvent();
        return;
      }

      // ESPAÇO : Iniciar/Pausar Cronômetro
      if (e.code === 'Space' || e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (stopwatchActive) {
          handlePauseStopwatch();
        } else {
          handleStartStopwatch();
        }
        return;
      }

      // F : Gravar e Finalizar Rua
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (addressCount > 0 && volumeCount > 0 && calculatedHours > 0) {
          handleSaveReplenishment();
        }
        return;
      }
    }
  }, [handleQuickAddAddress, handleUndoLastEvent, stopwatchActive, addressCount, volumeCount, calculatedHours, handleSaveReplenishment, reductionPending, showDemandModal, showSearchModal]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Modo Descanso (Screensaver) - APENAS se estiver ativado globalmente e em descanso
  if (screensaverEnabled && screensaverActive) {
    return (
      <div 
        onClick={() => setScreensaverActive(false)}
        className="fixed inset-0 z-50 bg-black text-emerald-400 flex flex-col items-center justify-center p-6 cursor-pointer font-mono select-none animate-fade-in"
      >
        <div className="text-center space-y-4 max-w-md w-full border border-emerald-500/30 p-8 rounded-3xl bg-slate-950/90 shadow-2xl">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-slate-500">
            <Moon size={16} className="text-emerald-400 animate-pulse" />
            <span>Descanso de Tela Ativo (Coletor Zebra)</span>
          </div>

          <div className="text-5xl font-black tracking-widest text-white">
            {new Date(stopwatchSeconds * 1000).toISOString().substring(11, 19)}
          </div>

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300">
            <p className="font-bold uppercase">Rua: {effectiveStreet} (Setor {inferredSector})</p>
            <p className="text-[0.7rem] text-slate-400 mt-1">
              Endereços: <strong className="text-white">{addressCount}</strong> • Volumes: <strong className="text-white">{volumeCount}</strong>
            </p>
          </div>

          <p className="text-[0.75rem] text-slate-400 pt-2 animate-bounce">
            Toque em qualquer lugar da tela para despertar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full font-mono animate-fade-in space-y-2 box-border select-none pb-28 md:pb-6">
      
      {/* FLASH REWARD EFÊMERO */}
      {flashReward && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-500 text-black font-black text-xs sm:text-sm rounded-full shadow-2xl border-2 border-white animate-bounce flex items-center gap-2">
          <Sparkles size={15} />
          <span>{flashReward}</span>
        </div>
      )}

      {/* 1. BLOCO 1 — CONTEXTO & CONTROLE (SETOR / RUA / TEMPO) */}
      <div className="p-2.5 rounded-2xl bg-slate-950 border border-white/15 shadow-md flex flex-wrap items-center justify-between gap-2">
        
        {/* Setores e Rua */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Seletor Rápido de Setor */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-white/15">
            {['87', '88', '89', '90'].map(sec => (
              <button
                key={sec}
                type="button"
                onClick={() => {
                  setStreetSectorFilter(sec);
                  pdtAudio.playClickBeep();
                }}
                className={`min-h-[32px] px-2 text-[0.65rem] font-black rounded-lg transition-all cursor-pointer ${
                  streetSectorFilter === sec
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          {/* Seletor da Rua Ativa */}
          <div className="relative">
            <select
              value={selectedStreet}
              onChange={(e) => {
                setSelectedStreet(e.target.value);
                pdtAudio.playClickBeep();
              }}
              className="min-h-[34px] bg-slate-900 border border-emerald-500/50 text-emerald-300 text-xs font-black px-2.5 rounded-xl font-mono focus:outline-none cursor-pointer"
            >
              {availableStreets.map(r => (
                <option key={r} value={r} className="bg-slate-950 text-white">
                  Rua {r}
                </option>
              ))}
              <option value="OUTRA" className="bg-slate-950 text-amber-400">+ Outra Rua</option>
            </select>
          </div>

          {selectedStreet === 'OUTRA' && (
            <input
              type="text"
              placeholder="RUA..."
              value={customStreet}
              onChange={(e) => setCustomStreet(e.target.value.toUpperCase())}
              className="w-20 min-h-[34px] bg-slate-900 border border-emerald-500 text-white text-xs px-2 rounded-xl font-mono uppercase font-bold"
            />
          )}
        </div>

        {/* Cronômetro Compacto & Controles */}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-white/15 rounded-xl">
            <Clock size={12} className={stopwatchActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />
            <span className="text-xs font-black tracking-wider text-white">
              {new Date(stopwatchSeconds * 1000).toISOString().substring(11, 19)}
            </span>
          </div>

          {/* Botão Pausar / Iniciar */}
          <button
            type="button"
            onClick={stopwatchActive ? handlePauseStopwatch : handleStartStopwatch}
            className={`min-h-[34px] px-2.5 rounded-xl border text-[0.65rem] font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${
              stopwatchActive 
                ? 'bg-amber-400 text-black border-amber-300' 
                : 'bg-emerald-500 text-black border-emerald-400'
            }`}
          >
            {stopwatchActive ? <Pause size={12} fill="black" /> : <Play size={12} fill="black" />}
            <span>{stopwatchActive ? 'Pausar' : 'Iniciar'}</span>
          </button>

          {/* Toggle Descanso */}
          <button
            type="button"
            onClick={() => {
              updateScreensaverEnabled(!screensaverEnabled, onAddToast);
            }}
            className={`min-h-[34px] px-2 rounded-xl border text-[0.65rem] font-bold flex items-center gap-1 cursor-pointer transition-all ${
              screensaverEnabled 
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                : 'bg-slate-900 text-slate-400 border-white/10'
            }`}
            title="Ligar/Desligar Descanso de Tela"
          >
            <Moon size={12} className={screensaverEnabled ? 'text-purple-400' : 'text-slate-400'} />
            <span className="hidden sm:inline">{screensaverEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Som Bipe */}
          <button
            type="button"
            onClick={() => {
              const next = !soundActive;
              setSoundActive(next);
              pdtAudio.setSoundEnabled(next);
            }}
            className="min-h-[34px] px-2 bg-slate-900 text-slate-300 border border-white/15 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer"
            title="Som do bipe"
          >
            {soundActive ? <Volume2 size={12} className="text-emerald-400" /> : <VolumeX size={12} className="text-slate-500" />}
          </button>
        </div>
      </div>

      {/* 2. BLOCO 2 — DEMANDA REPRO & COBERTURA */}
      <div className="p-2.5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-md space-y-1.5">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet size={13} className="text-emerald-400" />
            <span className="text-[0.68rem] font-black text-white uppercase tracking-wider">
              Demanda REPRO • {effectiveStreet}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCalculatorModal(true)}
              className="px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-[0.6rem] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
              title="Calculadora REPRO: PCB (unid/cx) x EU (qtd caixas)"
            >
              <Calculator size={11} className="text-cyan-400" />
              <span>🧮 Calc REPRO</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputDemandValue(isDemandLoaded ? String(demandValue) : '');
                setInputDemandUnit(demandUnit || 'CAIXAS');
                setShowDemandModal(true);
              }}
              className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[0.6rem] font-bold uppercase transition-all cursor-pointer"
            >
              {isDemandLoaded ? 'Ajustar Demanda' : '+ Carregar Demanda REPRO'}
            </button>
          </div>
        </div>

        {/* Grade de Métricas da Demanda */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="p-1.5 rounded-xl bg-slate-950 border border-white/10">
            <span className="text-[0.55rem] text-slate-400 uppercase font-bold block">Demanda</span>
            <span className="text-xs sm:text-sm font-black text-white font-mono truncate block">
              {isDemandLoaded ? `${demandValue} ${demandUnit === 'CAIXAS' ? 'cx' : 'vol'}` : 'Não carregada'}
            </span>
          </div>

          <div className="p-1.5 rounded-xl bg-slate-950 border border-cyan-500/30">
            <span className="text-[0.55rem] text-cyan-400 uppercase font-bold block">Realizado</span>
            <span className="text-xs sm:text-sm font-black text-cyan-300 font-mono truncate block">
              {totalRealizadoHoje} {unidadeRealizado === 'CAIXAS' ? 'cx' : 'vol'}
            </span>
          </div>

          <div className="p-1.5 rounded-xl bg-slate-950 border border-amber-500/30">
            <span className="text-[0.55rem] text-amber-400 uppercase font-bold block">Pendente</span>
            <span className="text-xs sm:text-sm font-black text-amber-300 font-mono truncate block">
              {!isDemandLoaded 
                ? '---' 
                : !isUnitCompatible 
                  ? 'Incompatível' 
                  : `${saldoPendente} ${demandUnit === 'CAIXAS' ? 'cx' : 'vol'}`}
            </span>
          </div>

          <div className="p-1.5 rounded-xl bg-slate-950 border border-emerald-500/30">
            <span className="text-[0.55rem] text-emerald-400 uppercase font-bold block">Cobertura</span>
            <span className="text-xs sm:text-sm font-black text-emerald-300 font-mono truncate block">
              {!isDemandLoaded 
                ? '---' 
                : !isUnitCompatible 
                  ? 'Unid. Diferente' 
                  : `${coberturaPercent}%`}
            </span>
          </div>
        </div>

        {/* Barra de Progresso de Cobertura */}
        {isDemandLoaded && isUnitCompatible && (
          <div className="space-y-0.5">
            <div className="w-full bg-slate-950 rounded-full h-2 border border-white/10 overflow-hidden p-0.5">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  (coberturaPercent || 0) >= 100 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : 'bg-gradient-to-r from-amber-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(100, coberturaPercent || 0)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[0.58rem] text-slate-400 px-0.5">
              <span>Status: {
                (coberturaPercent || 0) >= 100 
                  ? <strong className="text-emerald-400">Demanda Atendida</strong> 
                  : <strong className="text-amber-400">Em Atendimento</strong>
              }</span>
              {excedente > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                  Excedente: +{excedente} {demandUnit === 'CAIXAS' ? 'cx' : 'vol'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. BLOCO 3 — RITMO & EVOLUÇÃO OPERACIONAL */}
      <div className="p-2 rounded-xl bg-slate-950/90 border border-white/15 flex items-center justify-between flex-wrap gap-2 text-[0.68rem]">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-slate-400 block text-[0.55rem] uppercase">EPH:</span>
            <strong className="text-emerald-400 font-mono font-bold text-xs">{currentEPH}</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[0.55rem] uppercase">VPH:</span>
            <strong className="text-cyan-400 font-mono font-bold text-xs">{currentVPH}</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[0.55rem] uppercase">Tempo/End:</span>
            <strong className="text-amber-300 font-mono font-bold text-xs">{currentTempoPorEnderecoFormatted}</strong>
          </div>
        </div>

        {/* Nível de Consistência Gamificado */}
        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-white/10">
          <Award size={13} className="text-amber-400" />
          <div className="text-right">
            <span className="text-[0.55rem] text-slate-400 uppercase font-bold block">Nível {rhythmLevel.level}</span>
            <span className="text-[0.62rem] text-emerald-300 font-bold">{rhythmLevel.title}</span>
          </div>
        </div>
      </div>

      {/* 4. BLOCO 4 — AÇÃO PRINCIPAL: SUPER BOTÃO HERO */}
      <div className="w-full box-border">
        <button
          type="button"
          onClick={handleQuickAddAddress}
          className={`w-full min-h-[92px] p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer select-none shadow-2xl relative overflow-hidden active:scale-[0.98] ${
            touchPulse 
              ? 'bg-emerald-400 text-black border-white ring-4 ring-emerald-400/50' 
              : 'bg-gradient-to-b from-emerald-500 via-emerald-600 to-teal-700 text-black border-emerald-300 hover:brightness-105'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus size={24} className="stroke-[3]" />
            <span className="text-xl sm:text-2xl font-black uppercase tracking-wider font-mono">
              +1 ENDEREÇO CONCLUÍDO
            </span>
          </div>
          <div className="text-xs sm:text-sm font-bold opacity-90 font-mono">
            {addressCount} endereços atendidos • {volumeCount} {unidadeRealizado === 'CAIXAS' ? 'cx' : 'vol'}
          </div>
        </button>
      </div>

      {/* 5. BLOCO 5 — CARD EXPANDIDO: INCREMENTO INDIVIDUAL & MÚLTIPLOS DE CAIXAS */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-950/95 border-2 border-emerald-500/40 shadow-2xl space-y-3 box-border">
        
        {/* Topo do Card: Título + Unidade + Atalho Calculadora REPRO */}
        <div className="flex items-center justify-between flex-wrap gap-1.5 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/40">
              <Box size={18} />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider block">
                Acréscimo de {unidadeRealizado === 'CAIXAS' ? 'Caixas' : 'Volumes'}
              </span>
              <span className="text-[0.62rem] text-slate-400">
                Toque para somar caixas individuais ou múltiplos à rua
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCalculatorModal(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 text-cyan-300 border border-cyan-500/40 text-[0.68rem] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            title="Abrir Calculadora REPRO (PCB x EU)"
          >
            <Calculator size={14} className="text-cyan-400" />
            <span>🧮 Calc REPRO (PCB × EU)</span>
          </button>
        </div>

        {/* Grade de Botões Grandes de Caixas Individuais e Múltiplos */}
        <div className="grid grid-cols-6 gap-2">
          {[
            { label: '+1', amt: 1, color: 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-300 border-emerald-500/60 font-black' },
            { label: '+2', amt: 2, color: 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border-emerald-500/50' },
            { label: '+3', amt: 3, color: 'bg-teal-500/20 hover:bg-teal-500/35 text-teal-300 border-teal-500/50' },
            { label: '+5', amt: 5, color: 'bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 border-cyan-500/50' },
            { label: '+10', amt: 10, color: 'bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-200 border-cyan-500/60 font-black' },
            { label: '+20', amt: 20, color: 'bg-blue-500/25 hover:bg-blue-500/40 text-blue-200 border-blue-500/60 font-black' },
          ].map(btn => (
            <button
              key={btn.label}
              type="button"
              onClick={() => handleAddVolumeDirect(btn.amt)}
              className={`min-h-[58px] sm:min-h-[64px] rounded-xl border-2 flex flex-col items-center justify-center p-1.5 cursor-pointer transition-all active:scale-95 shadow-lg ${btn.color}`}
            >
              <span className="text-lg sm:text-xl font-black font-mono leading-none">{btn.label}</span>
              <span className="text-[0.58rem] sm:text-[0.62rem] uppercase opacity-80 font-bold mt-0.5">
                {unidadeRealizado === 'CAIXAS' ? 'cx' : 'vol'}
              </span>
            </button>
          ))}
        </div>

        {/* Linha de Ações Secundárias: Redução com Justificativa + Adicionar Qtd Manual */}
        <div className="flex items-center gap-2 pt-1">
          {/* Redução com justificativa */}
          <button
            type="button"
            onClick={() => setReductionPending({ amount: 1 })}
            className="flex-1 min-h-[44px] px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
            title="Reduzir 1 caixa/volume com justificativa"
          >
            <Minus size={14} className="stroke-[3]" />
            <span>-1 {unidadeRealizado === 'CAIXAS' ? 'cx' : 'vol'} (Avaria/Falta)</span>
          </button>

          {/* Adicionar Quantidade Customizada */}
          <button
            type="button"
            onClick={() => {
              const val = prompt(`Digite a quantidade de ${unidadeRealizado === 'CAIXAS' ? 'caixas' : 'volumes'} a adicionar:`, '1');
              if (val) {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                  handleAddVolumeDirect(num);
                }
              }
            }}
            className="px-3.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/20 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
            title="Digitar quantidade exata de caixas"
          >
            <Plus size={14} />
            <span>+Qtd Exata</span>
          </button>
        </div>

      </div>

      {/* 6. BLOCO 6 — BARRA DE CONTROLE & FINALIZAÇÃO */}
      <div className="grid grid-cols-12 gap-2 pt-1 box-border">
        
        {/* Desfazer Último Evento */}
        <button
          type="button"
          onClick={handleUndoLastEvent}
          disabled={eventHistory.length === 0 && addressCount === 0}
          className="col-span-4 min-h-[48px] px-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
        >
          <Undo2 size={15} />
          <span>Desfazer</span>
        </button>

        {/* Buscar / Ajustes */}
        <button
          type="button"
          onClick={() => setShowSearchModal(true)}
          className="col-span-3 min-h-[48px] px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/15 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          title="Buscar rua ou alterar unidade"
        >
          <Search size={14} />
          <span>Opções</span>
        </button>

        {/* Gravar e Finalizar Rua */}
        <button
          type="button"
          onClick={handleSaveReplenishment}
          disabled={isSubmitting || addressCount === 0}
          className="col-span-5 min-h-[48px] px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 disabled:opacity-40 text-black font-black text-xs sm:text-sm uppercase rounded-xl border border-emerald-300 shadow-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
        >
          <CheckCircle2 size={16} className="stroke-[3]" />
          <span>Finalizar Rua</span>
        </button>

      </div>

      {/* MODAL: CARREGAR DEMANDA REPRO */}
      {showDemandModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-emerald-500/40 p-4 rounded-2xl max-w-sm w-full space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-emerald-400" />
                Carregar Demanda REPRO
              </span>
              <button 
                type="button"
                onClick={() => setShowDemandModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="text-[0.68rem] text-slate-400 space-y-1">
              <p>Rua: <strong className="text-white">{effectiveStreet}</strong> (Setor {inferredSector})</p>
              <p>Data: <strong className="text-white">{operationDate}</strong></p>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Unidade da Demanda</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInputDemandUnit('CAIXAS')}
                    className={`p-2 rounded-xl text-xs font-bold uppercase border cursor-pointer ${
                      inputDemandUnit === 'CAIXAS' 
                        ? 'bg-emerald-500 text-black border-emerald-400' 
                        : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    CAIXAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputDemandUnit('VOLUMES')}
                    className={`p-2 rounded-xl text-xs font-bold uppercase border cursor-pointer ${
                      inputDemandUnit === 'VOLUMES' 
                        ? 'bg-emerald-500 text-black border-emerald-400' 
                        : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    VOLUMES
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Quantidade Demandada</label>
                <input
                  type="number"
                  placeholder="Ex: 120"
                  value={inputDemandValue}
                  onChange={(e) => setInputDemandValue(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-900 border border-emerald-500 text-emerald-300 text-sm px-3 rounded-xl font-mono font-bold focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDemandModal(false)}
                className="flex-1 py-2 bg-slate-900 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveReproDemand}
                className="flex-1 py-2 bg-emerald-500 text-black font-black rounded-xl text-xs uppercase shadow-md"
              >
                Salvar Demanda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: JUSTIFICATIVA RÁPIDA DE REDUÇÃO */}
      {reductionPending && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-rose-500/40 p-4 rounded-2xl max-w-sm w-full space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 text-rose-400 font-black text-xs uppercase">
              <span>Justificativa de Redução (-{reductionPending.amount})</span>
              <button type="button" onClick={() => setReductionPending(null)} className="text-slate-400">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['AVARIA', 'FALTA', 'DIVERGÊNCIA', 'OUTRO'].map(just => (
                <button
                  key={just}
                  type="button"
                  onClick={() => {
                    if (just === 'OUTRO') {
                      const reason = prompt('Informe a justificativa:') || 'OUTRO';
                      handleConfirmReduction(reason.toUpperCase());
                    } else {
                      handleConfirmReduction(just);
                    }
                  }}
                  className="p-2.5 bg-slate-900 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold uppercase transition-all"
                >
                  [ {just} ]
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BUSCA & AJUSTE DE UNIDADE */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-white/20 p-4 rounded-2xl max-w-sm w-full space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs font-black text-white uppercase">
              <span>Buscar / Ajustes Operacionais</span>
              <button type="button" onClick={() => setShowSearchModal(false)} className="text-slate-400">✕</button>
            </div>

            <div>
              <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Unidade do Realizado</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUnidadeRealizado('CAIXAS');
                    setShowSearchModal(false);
                    onAddToast('Unidade do realizado definida como CAIXAS', 'var(--color-terminal-accent)');
                  }}
                  className={`p-2 rounded-xl text-xs font-bold uppercase border ${
                    unidadeRealizado === 'CAIXAS' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-slate-900 text-slate-400 border-white/10'
                  }`}
                >
                  CAIXAS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUnidadeRealizado('VOLUMES');
                    setShowSearchModal(false);
                    onAddToast('Unidade do realizado definida como VOLUMES', 'var(--color-terminal-accent)');
                  }}
                  className={`p-2 rounded-xl text-xs font-bold uppercase border ${
                    unidadeRealizado === 'VOLUMES' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-slate-900 text-slate-400 border-white/10'
                  }`}
                >
                  VOLUMES
                </button>
              </div>
            </div>

            <div>
              <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Volumes Padrão por Endereço</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 4, 8].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setDefaultVolPerAddress(n);
                      setShowSearchModal(false);
                      onAddToast(`Padrão: +${n} volume(s) por clique`, 'var(--color-terminal-accent)');
                    }}
                    className={`p-1.5 rounded-lg text-xs font-bold border ${
                      defaultVolPerAddress === n ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CALCULADORA REPRO (PCB x EU) */}
      <ReproCalculatorModal
        isOpen={showCalculatorModal}
        onClose={() => setShowCalculatorModal(false)}
        onApplyBoxes={handleApplyCalculatorBoxes}
        initialUnit={unidadeRealizado}
      />

    </div>
  );
}
