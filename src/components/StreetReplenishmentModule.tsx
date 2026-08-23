/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Log } from '../types';
import { 
  MapPin, 
  Layers, 
  Clock, 
  Zap, 
  TrendingUp, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  Hash, 
  Box, 
  ListOrdered,
  Gauge,
  Plus,
  Minus,
  Undo2,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  Timer,
  BarChart3,
  Calendar,
  Compass,
  ShieldCheck,
  Keyboard,
  Radio,
  Crosshair
} from 'lucide-react';
import { 
  calculateDurationFromTimes, 
  formatDateToBR, 
  parseDateString, 
  getDayOfWeekName, 
  getWeekNumber,
  formatTimeToHHMM 
} from '../utils/dateUtils';
import { 
  VOLUMOSOS_STREETS, 
  SECTOR_87_STREETS, 
  ALL_CONFIGURED_STREETS,
  inferSectorFromStreet
} from '../data/streetData';
import { pdtAudio } from '../utils/pdtAudio';

interface StreetReplenishmentModuleProps {
  logs: Log[];
  activeOperator: string;
  activeSectorId: string;
  onSaveLog: (log: Log) => Promise<void>;
  onAddToast: (msg: string, color?: string) => void;
}

/**
 * Utilitário de conversão ultra-segura para números válidos.
 * Previne erros de tipo (ex: undefined, null, NaN, strings com vírgula).
 */
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

/**
 * Formatação segura para strings com casas decimais fixas
 */
const safeToFixed = (val: any, digits: number = 1): string => {
  const num = toSafeNumber(val);
  return num.toFixed(digits);
};

export default function StreetReplenishmentModule({
  logs,
  activeOperator,
  activeSectorId,
  onSaveLog,
  onAddToast
}: StreetReplenishmentModuleProps) {
  // Modo Coletor Zebra PDT (WVGA 800x480 / 480x800)
  const [pdtMode, setPdtMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('repro_zebra_pdt_mode');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Modo Foco para Coletor 800x480 (Oculta históricos/métricas globais e foca exclusivamente no contador e no +1 Endereço)
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('repro_street_focus_mode') === 'true';
    }
    return false;
  });

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('repro_street_focus_mode', String(next));
      }
      pdtAudio.playClickBeep();
      onAddToast(
        next 
          ? '🎯 Modo Foco Ativado! Interface otimizada para 800x480 (apenas contadores e +1 Endereço)' 
          : 'Modo Foco Desativado (Visão analítica completa restaurada)',
        next ? 'var(--color-terminal-accent)' : 'var(--color-info)'
      );
      return next;
    });
  }, [onAddToast]);

  const [soundActive, setSoundActive] = useState<boolean>(() => pdtAudio.isEnabled());

  // Sector filter tab within the Street module (defaults to current activeSector or 'all')
  const [streetSectorFilter, setStreetSectorFilter] = useState<string>(() => {
    if (activeSectorId === '87') return '87';
    if (activeSectorId === '89') return '89';
    if (activeSectorId === '90') return '90';
    if (activeSectorId === '88_89_90') return 'volumosos';
    return '87';
  });

  // Street selection state
  const [selectedStreet, setSelectedStreet] = useState<string>('B4VD');
  const [customStreet, setCustomStreet] = useState('');
  
  // Counters for addresses & volumes
  const [addressCount, setAddressCount] = useState<number>(0);
  const [volumeCount, setVolumeCount] = useState<number>(0);
  const [defaultVolPerAddress, setDefaultVolPerAddress] = useState<number>(3);
  
  // Mobile Quick Mode settings
  const [quickModeEnabled, setQuickModeEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [lastLapDuration, setLastLapDuration] = useState<number | null>(null);
  const [lastLapTimestamp, setLastLapTimestamp] = useState<number | null>(null);
  const [currentAddressSeconds, setCurrentAddressSeconds] = useState<number>(0);

  // Operation Date
  const [operationDate, setOperationDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Mode: stopwatch vs manual time interval
  const [timeMode, setTimeMode] = useState<'cronometro' | 'manual'>('cronometro');
  
  // Stopwatch state
  const [stopwatchActive, setStopwatchActive] = useState(false);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchStartTs, setStopwatchStartTs] = useState<number | null>(null);

  // Manual times
  const [manualStartTime, setManualStartTime] = useState('08:00');
  const [manualEndTime, setManualEndTime] = useState('08:45');

  // Saving state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touchPulse, setTouchPulse] = useState(false);

  // Synchronize street when sector filter changes
  const availableStreets = useMemo(() => {
    if (streetSectorFilter === '87') return SECTOR_87_STREETS;
    if (streetSectorFilter === '89') return ['B5VA', 'B5VB', 'B5VC'];
    if (streetSectorFilter === '90') return ['B5VD', 'B5VE', 'B5VF', 'B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK'];
    if (streetSectorFilter === 'volumosos' || streetSectorFilter === '88_89_90') return VOLUMOSOS_STREETS;
    return ALL_CONFIGURED_STREETS;
  }, [streetSectorFilter]);

  // Active street computed
  const effectiveStreet = (selectedStreet === 'OUTRA' ? customStreet : selectedStreet).trim().toUpperCase();

  const togglePdtMode = () => {
    const next = !pdtMode;
    setPdtMode(next);
    localStorage.setItem('repro_zebra_pdt_mode', String(next));
    pdtAudio.playClickBeep();
  };

  const toggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    pdtAudio.setSoundEnabled(next);
    if (next) pdtAudio.playClickBeep();
  };

  // Stopwatch timer effect
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

  const handleStartStopwatch = () => {
    const now = Date.now();
    setStopwatchStartTs(now - stopwatchSeconds * 1000);
    setStopwatchActive(true);
    if (!lastLapTimestamp) {
      setLastLapTimestamp(now);
    }
    pdtAudio.playStartTimer();
    pdtAudio.triggerHaptic(50);
    onAddToast(`Cronômetro iniciado para ${effectiveStreet || 'Rua'}`, 'var(--color-terminal-accent)');
  };

  const handlePauseStopwatch = () => {
    setStopwatchActive(false);
    pdtAudio.playPauseTimer();
    pdtAudio.triggerHaptic(40);
  };

  const handleResetStopwatch = () => {
    setStopwatchActive(false);
    setStopwatchSeconds(0);
    setStopwatchStartTs(null);
    setLastLapDuration(null);
    setLastLapTimestamp(null);
    setCurrentAddressSeconds(0);
    pdtAudio.playUndoTone();
  };

  // QUICK CLICKER: "+1 Endereço Feito"
  const handleQuickAddAddress = useCallback(() => {
    const now = Date.now();
    
    // Auto start stopwatch on first address if not running
    if (!stopwatchActive && timeMode === 'cronometro') {
      setStopwatchStartTs(now - stopwatchSeconds * 1000);
      setStopwatchActive(true);
    }

    // Calculate lap pacing
    if (lastLapTimestamp) {
      const lapSecs = Math.floor((now - lastLapTimestamp) / 1000);
      setLastLapDuration(lapSecs);
    } else if (stopwatchSeconds > 0) {
      setLastLapDuration(stopwatchSeconds);
    }
    setLastLapTimestamp(now);
    setCurrentAddressSeconds(0);

    // Increment addresses
    setAddressCount(prev => prev + 1);

    // Auto-add estimated/configured volumes per address
    if (defaultVolPerAddress > 0) {
      setVolumeCount(prev => prev + defaultVolPerAddress);
    }

    // Acoustic & Haptic Feedback
    pdtAudio.playClickBeep();
    if (hapticEnabled) pdtAudio.triggerHaptic(45);

    // Visual button flash animation
    setTouchPulse(true);
    setTimeout(() => setTouchPulse(false), 200);
  }, [stopwatchActive, timeMode, stopwatchSeconds, lastLapTimestamp, defaultVolPerAddress, hapticEnabled]);

  // Quick volumes adjustments
  const handleAddVolume = (amt: number) => {
    setVolumeCount(prev => Math.max(0, prev + amt));
    pdtAudio.playClickBeep();
    if (hapticEnabled) pdtAudio.triggerHaptic(35);
  };

  // Quick address adjustment (+ / -)
  const handleAddAddressManual = (amt: number) => {
    setAddressCount(prev => Math.max(0, prev + amt));
    pdtAudio.playClickBeep();
    if (hapticEnabled) pdtAudio.triggerHaptic(35);
  };

  // Undo last action (Safety mechanism against accidental double-clicks)
  const handleUndoAddress = useCallback(() => {
    if (addressCount > 0) {
      setAddressCount(prev => Math.max(0, prev - 1));
      if (defaultVolPerAddress > 0) {
        setVolumeCount(prev => Math.max(0, prev - defaultVolPerAddress));
      }
      pdtAudio.playUndoTone();
      if (hapticEnabled) pdtAudio.triggerHaptic(60);
      onAddToast('Último endereço desfeito (-1).', 'var(--color-danger)');
    }
  }, [addressCount, defaultVolPerAddress, hapticEnabled, onAddToast]);

  // SAFE DURATION CALCULATION (Protegido contra tipos inválidos e NaN)
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

  // Real-time Current KPIs com conversão e proteção rigorosa contra divisão por zero
  const currentMediaPorEndereco = useMemo(() => {
    const e = toSafeNumber(addressCount);
    const v = toSafeNumber(volumeCount);
    if (e > 0 && v > 0) {
      const ratio = v / e;
      return isFinite(ratio) ? ratio.toFixed(1) : '0.0';
    }
    return '0.0';
  }, [addressCount, volumeCount]);

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

  const currentMinPorEndereco = useMemo(() => {
    const e = toSafeNumber(addressCount);
    const h = toSafeNumber(calculatedHours);
    if (e > 0 && h > 0) {
      const totalMinutes = h * 60;
      const minPerEnd = totalMinutes / e;
      return isFinite(minPerEnd) ? minPerEnd.toFixed(1) : '0.0';
    }
    return '0.0';
  }, [addressCount, calculatedHours]);

  // Submit Handler
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
      const inferredSector = inferSectorFromStreet(effectiveStreet);

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
        atividade: `REABASTECIMENTO - RUA ${effectiveStreet}`,
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
      if (hapticEnabled) pdtAudio.triggerHaptic(100);

      onAddToast(`Apontamento da Rua ${effectiveStreet} gravado com sucesso! (${safeEnds} end, ${safeVols} vol, EPH: ${computedEph})`, 'var(--color-success)');

      // Reset state for next street
      setAddressCount(0);
      setVolumeCount(0);
      handleResetStopwatch();
    } catch (err: any) {
      onAddToast(`Erro ao gravar: ${err?.message || 'Erro inesperado'}`, 'var(--color-danger)');
      pdtAudio.playUndoTone();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    effectiveStreet, 
    activeOperator, 
    addressCount, 
    volumeCount, 
    calculatedHours, 
    operationDate, 
    timeMode, 
    stopwatchStartTs, 
    manualStartTime, 
    manualEndTime, 
    onSaveLog, 
    hapticEnabled, 
    onAddToast
  ]);

  // =========================================================================
  // KEYBOARD SHORTCUTS PARA TECLADO FÍSICO DO COLETOR ZEBRA MC3000 / MC3300
  // =========================================================================
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.tagName === 'SELECT'
    );

    if (!isInputFocused) {
      // TECLA ENTER ou + : Incrementa +1 Endereço
      if (e.key === 'Enter' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        handleQuickAddAddress();
        return;
      }

      // TECLA - ou Backspace : Desfazer (-1)
      if (e.key === '-' || e.code === 'NumpadSubtract' || e.key === 'Backspace') {
        e.preventDefault();
        handleUndoAddress();
        return;
      }

      // BARRA DE ESPAÇO ou P : Iniciar / Pausar Cronômetro
      if (e.code === 'Space' || e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (stopwatchActive) {
          handlePauseStopwatch();
        } else {
          handleStartStopwatch();
        }
        return;
      }

      // TECLA O: Alternar Modo Foco
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // TECLA F : Finalizar & Gravar Apontamento
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (addressCount > 0 && volumeCount > 0 && calculatedHours > 0) {
          handleSaveReplenishment();
        }
        return;
      }

      // TECLAS 1, 2, 3, 4: Troca Setor
      if (e.key === '1') {
        e.preventDefault();
        setStreetSectorFilter('87');
        pdtAudio.playClickBeep();
      } else if (e.key === '2') {
        e.preventDefault();
        setStreetSectorFilter('89');
        pdtAudio.playClickBeep();
      } else if (e.key === '3') {
        e.preventDefault();
        setStreetSectorFilter('90');
        pdtAudio.playClickBeep();
      } else if (e.key === '4') {
        e.preventDefault();
        setStreetSectorFilter('volumosos');
        pdtAudio.playClickBeep();
      }
    }
  }, [handleQuickAddAddress, handleUndoAddress, stopwatchActive, addressCount, volumeCount, calculatedHours, handleSaveReplenishment]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Aggregate stats per street from historical logs
  const streetStats = useMemo(() => {
    const streetMap: { [key: string]: { 
      totalEnderecos: number; 
      totalVolumes: number; 
      totalHoras: number;
      count: number;
      setor: string;
    } } = {};

    logs.forEach(l => {
      const act = l.atividade || '';
      if (act.toUpperCase().includes('REABASTECIMENTO - RUA')) {
        const parts = act.toUpperCase().split('REABASTECIMENTO - RUA');
        const rua = parts[1]?.trim() || 'INDEFINIDA';
        if (!streetMap[rua]) {
          streetMap[rua] = {
            totalEnderecos: 0,
            totalVolumes: 0,
            totalHoras: 0,
            count: 0,
            setor: l.setor || inferSectorFromStreet(rua)
          };
        }
        
        const vols = toSafeNumber(l.volumes);
        const hrs = toSafeNumber(l.horas);
        const ends = toSafeNumber(l.eph ? (hrs > 0 ? Math.round(toSafeNumber(l.eph) * hrs) : 0) : 0);

        streetMap[rua].totalVolumes += vols;
        streetMap[rua].totalHoras += hrs;
        streetMap[rua].totalEnderecos += ends > 0 ? ends : Math.round(vols / 3);
        streetMap[rua].count += 1;
      }
    });

    return Object.entries(streetMap).map(([rua, data]) => {
      const safeEnds = toSafeNumber(data.totalEnderecos);
      const safeVols = toSafeNumber(data.totalVolumes);
      const safeHrs = toSafeNumber(data.totalHoras);

      const mediaVolPorEnd = safeEnds > 0 ? (safeVols / safeEnds).toFixed(1) : '0.0';
      const eph = safeHrs > 0 ? (safeEnds / safeHrs).toFixed(1) : '0.0';
      const vph = safeHrs > 0 ? (safeVols / safeHrs).toFixed(1) : '0.0';
      const minPorEnd = safeEnds > 0 && safeHrs > 0 ? ((safeHrs * 60) / safeEnds).toFixed(1) : '0.0';

      return {
        rua,
        ...data,
        mediaVolPorEnd,
        eph,
        vph,
        minPorEnd
      };
    }).sort((a, b) => b.totalVolumes - a.totalVolumes);
  }, [logs]);

  // Overall totals across all streets
  const overallStreetTotals = useMemo(() => {
    let totalEnds = 0;
    let totalVols = 0;
    let totalHrs = 0;

    streetStats.forEach(s => {
      totalEnds += toSafeNumber(s.totalEnderecos);
      totalVols += toSafeNumber(s.totalVolumes);
      totalHrs += toSafeNumber(s.totalHoras);
    });

    return {
      ruasAtendidas: streetStats.length,
      totalEnds,
      totalVols,
      totalHrs: Number(totalHrs.toFixed(2)),
      avgVolPerEnd: totalEnds > 0 ? (totalVols / totalEnds).toFixed(1) : '0.0',
      globalEph: totalHrs > 0 ? (totalEnds / totalHrs).toFixed(1) : '0.0',
      globalVph: totalHrs > 0 ? (totalVols / totalHrs).toFixed(1) : '0.0'
    };
  }, [streetStats]);

  // Selected street history
  const selectedStreetHistory = useMemo(() => {
    if (!effectiveStreet) return null;
    const match = streetStats.find(s => s.rua === effectiveStreet);
    if (!match) {
      return {
        hasHistory: false,
        rua: effectiveStreet,
        totalEnderecos: 0,
        totalVolumes: 0,
        totalHoras: 0,
        count: 0,
        mediaVolPorEnd: '0.0',
        eph: '0.0',
        vph: '0.0',
        minPorEnd: '0.0',
        setor: inferSectorFromStreet(effectiveStreet)
      };
    }
    return {
      hasHistory: true,
      ...match
    };
  }, [streetStats, effectiveStreet]);

  return (
    <div className="space-y-4 font-mono animate-fade-in pb-28 md:pb-6">
      
      {/* BARRA SUPERIOR DE CONTROLE ZEBRA PDT & ATALHOS RÁPIDOS */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-white/10 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <MapPin size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                Reabastecimento por Rua
              </span>
              <span className={`text-[0.62rem] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                pdtMode 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-white/5 text-slate-400 border-white/10'
              }`}>
                {pdtMode ? '📟 Modo PDT (800x480)' : 'Modo Padrão'}
              </span>
            </div>
            <p className="text-[0.62rem] text-slate-400 font-medium hidden sm:block">
              Toque rápido <strong className="text-emerald-400 font-bold">+1 Endereço</strong> com acionamento por teclado físico <strong className="text-white font-bold">[ENTER / +]</strong>.
            </p>
          </div>
        </div>

        {/* Toggles de Som, Modo Foco e Modo PDT */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/80 border border-white/10 px-2.5 py-1 rounded-xl">
            <span className="text-[0.6rem] text-slate-400 uppercase font-bold">Operador:</span>
            <span className="text-xs font-bold text-white uppercase">
              {activeOperator || 'Operador'}
            </span>
          </div>

          {/* BOTÃO MODO FOCO (800x480) */}
          <button
            type="button"
            id="btn-toggle-modo-foco"
            onClick={toggleFocusMode}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              focusMode 
                ? 'bg-amber-400 text-black border-amber-300 font-black shadow-lg shadow-amber-400/20 scale-[1.02]' 
                : 'bg-white/5 text-slate-300 border-white/10 hover:text-white hover:border-amber-400/40'
            }`}
            title="Ativar/Desativar Modo Foco para Coletor 800x480 (Atalho: Tecla O)"
          >
            <Crosshair size={15} className={focusMode ? 'text-black animate-pulse' : 'text-amber-400'} />
            <span>{focusMode ? '🎯 Foco ON' : '🎯 Modo Foco'}</span>
          </button>

          <button
            type="button"
            onClick={toggleSound}
            className="min-h-[38px] px-3 bg-slate-950/80 hover:bg-white/10 text-slate-300 border border-white/15 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            title={soundActive ? 'Som ligado' : 'Som desligado'}
          >
            {soundActive ? <Volume2 size={14} className="text-emerald-400" /> : <VolumeX size={14} className="text-slate-500" />}
            <span className="text-[0.65rem]">{soundActive ? 'Bipe ON' : 'Mudo'}</span>
          </button>

          <button
            type="button"
            onClick={togglePdtMode}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              pdtMode 
                ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md' 
                : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
            }`}
            title="Alternar Modo Coletor de Dados Zebra WVGA"
          >
            <Smartphone size={14} />
            <span>{pdtMode ? 'PDT Compacto' : 'Expandido'}</span>
          </button>
        </div>
      </div>

      {/* GUIA DE TECLAS DE ATALHO PARA O COLETOR ZEBRA */}
      <div className="p-2 px-3.5 rounded-xl bg-slate-950/80 border border-white/10 text-[0.65rem] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
          <Keyboard size={13} />
          <span>Atalhos Teclado Coletor:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-emerald-400">ENTER / [+]</strong>: +1 Endereço</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-rose-400">[-] / Backspace</strong>: Desfazer</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-cyan-400">ESPAÇO</strong>: Cronômetro</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-amber-400">O</strong>: Modo Foco</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-amber-400">1-4</strong>: Setor</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-emerald-400">F</strong>: Gravar</span>
        </div>
      </div>

      {/* PAINEL PRINCIPAL: FORMULÁRIO DE APONTAMENTO E MÉTRICAS EM TEMPO REAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LADO ESQUERDO: CONTROLES & APONTAMENTO (7 COLUNAS OU 12 EM MODO FOCO) */}
        <div className={focusMode ? 'lg:col-span-12 max-w-2xl mx-auto w-full space-y-4' : 'lg:col-span-7 space-y-4'}>
          
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-4">
            
            {/* NO MODO FOCO: BANNER DE DESTAQUE COMPACTO COM KPIS AO VIVO */}
            {focusMode && (
              <div className="p-3 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border border-amber-400/40 rounded-xl space-y-2 text-xs animate-fade-in shadow-inner">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-black font-black text-xs flex items-center gap-1 shadow-sm">
                      <Crosshair size={13} />
                      MODO FOCO ATIVO
                    </span>
                    <span className="text-white font-bold text-sm font-mono">
                      Rua: <strong className="text-amber-300 text-base">{effectiveStreet || 'INDEFINIDA'}</strong>
                    </span>
                    <span className="text-[0.62rem] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-white/10 font-bold">
                      Setor {inferSectorFromStreet(effectiveStreet)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={toggleFocusMode}
                    className="text-[0.65rem] font-bold text-amber-300/90 hover:text-white underline cursor-pointer bg-slate-950/60 px-2.5 py-1 rounded-lg border border-amber-400/20"
                  >
                    Sair do Foco [O]
                  </button>
                </div>

                {/* Strip de Métricas Live da Sessão */}
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[0.65rem] bg-slate-950/90 p-2 rounded-lg border border-white/10">
                  <div>
                    <span className="text-slate-400 block text-[0.58rem] font-bold uppercase">Média</span>
                    <span className="text-emerald-400 font-bold text-xs">{currentMediaPorEndereco} v/e</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[0.58rem] font-bold uppercase">EPH Live</span>
                    <span className="text-cyan-400 font-bold text-xs">{currentEPH}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[0.58rem] font-bold uppercase">VPH Live</span>
                    <span className="text-purple-400 font-bold text-xs">{currentVPH}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[0.58rem] font-bold uppercase">Tempo</span>
                    <span className="text-amber-400 font-bold text-xs">{safeToFixed(calculatedHours, 2)}h</span>
                  </div>
                </div>
              </div>
            )}

            {/* TOPO: SELEÇÃO DE RUA & MODO */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Layers size={14} />
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  1. Rua em Operação
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Seletor de Modo de Tempo */}
                <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-white/10 font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeMode('cronometro');
                      pdtAudio.playClickBeep();
                    }}
                    className={`px-3 py-1 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer min-h-[34px] flex items-center gap-1.5 ${
                      timeMode === 'cronometro'
                        ? 'bg-emerald-500 text-black font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>⏱️ Cronômetro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeMode('manual');
                      pdtAudio.playClickBeep();
                    }}
                    className={`px-3 py-1 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer min-h-[34px] flex items-center gap-1.5 ${
                      timeMode === 'manual'
                        ? 'bg-emerald-500 text-black font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>📝 Manual</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SELEÇÃO DO SETOR & CORREDOR (TOUCH-FRIENDLY) */}
            <div className="space-y-2.5">
              <label className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold block">
                Selecione o Setor da Atividade:
              </label>

              {/* Botões de Setor Grandes com área de toque confortável */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStreetSectorFilter('87');
                    if (!SECTOR_87_STREETS.includes(selectedStreet)) setSelectedStreet(SECTOR_87_STREETS[0]);
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[44px] py-2 px-2 text-xs sm:text-sm font-bold uppercase rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center ${
                    streetSectorFilter === '87'
                      ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  Setor 87 [1]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStreetSectorFilter('89');
                    setSelectedStreet('B5VA');
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[44px] py-2 px-2 text-xs sm:text-sm font-bold uppercase rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center ${
                    streetSectorFilter === '89'
                      ? 'bg-cyan-500 text-black border-cyan-400 font-black shadow-md'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  Setor 89 [2]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStreetSectorFilter('90');
                    setSelectedStreet('B5VD');
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[44px] py-2 px-2 text-xs sm:text-sm font-bold uppercase rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center ${
                    streetSectorFilter === '90'
                      ? 'bg-purple-500 text-black border-purple-400 font-black shadow-md'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  Setor 90 [3]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStreetSectorFilter('volumosos');
                    if (!VOLUMOSOS_STREETS.includes(selectedStreet)) setSelectedStreet(VOLUMOSOS_STREETS[0]);
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[44px] py-2 px-2 text-xs sm:text-sm font-bold uppercase rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center ${
                    streetSectorFilter === 'volumosos'
                      ? 'bg-amber-400 text-black border-amber-300 font-black shadow-md'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  Volumosos [4]
                </button>
              </div>

              {/* Chips de Ruas Específicas do Setor em Grid Amplo para Toque com Luvas */}
              <div className="pt-1">
                <label className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
                  Escolha a Rua (Corredor):
                </label>
                
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                  {availableStreets.map(rua => (
                    <button
                      key={rua}
                      type="button"
                      onClick={() => {
                        setSelectedStreet(rua);
                        setCustomStreet('');
                        pdtAudio.playClickBeep();
                      }}
                      className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border transition-all cursor-pointer text-center select-none ${
                        selectedStreet === rua
                          ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md'
                          : 'bg-slate-950/70 border-white/15 text-slate-200 hover:text-white hover:border-emerald-500/40 hover:bg-white/10'
                      }`}
                    >
                      {rua}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStreet('OUTRA');
                      pdtAudio.playClickBeep();
                    }}
                    className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border transition-all cursor-pointer text-center ${
                      selectedStreet === 'OUTRA'
                        ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md'
                        : 'bg-white/5 border-white/15 text-slate-400 hover:text-white'
                    }`}
                  >
                    + Outra
                  </button>
                </div>

                {/* Opção de Rua Personalizada */}
                {selectedStreet === 'OUTRA' && (
                  <div className="mt-2.5 animate-fade-in">
                    <input
                      type="text"
                      placeholder="DIGITE O NOME DA RUA (EX: B4VD, B5VA, RUA 12)..."
                      value={customStreet}
                      onChange={(e) => setCustomStreet(e.target.value.toUpperCase())}
                      className="w-full min-h-[46px] bg-slate-950/80 border border-emerald-500 text-emerald-400 text-sm px-4 py-2 rounded-xl font-mono focus:outline-none placeholder:text-slate-600 uppercase font-bold"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* BOTÃO HERO MOBILE: "+1 ENDEREÇO FEITO" (AÇÃO PRINCIPAL DE 1 TOQUE) */}
            {/* ========================================================================= */}
            {quickModeEnabled && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-emerald-950/30 via-slate-900/90 to-slate-950 border border-emerald-500/30 shadow-xl space-y-3.5 relative overflow-hidden">
                
                {/* Cabeçalho do Card Mobile */}
                <div className="flex items-center justify-between text-xs text-slate-300 border-b border-white/[0.08] pb-2.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider">
                    <Sparkles size={14} className="text-emerald-400" />
                    <span>Estação 1-Toque • {effectiveStreet || 'RUA'}</span>
                  </div>

                  <span className="text-[0.62rem] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-white/10">
                    Setor {inferSectorFromStreet(effectiveStreet)}
                  </span>
                </div>

                {/* DISPLAY DOS CONTADORES GIGANTES (ENDEREÇOS & VOLUMES) */}
                <div className="grid grid-cols-2 gap-2.5 font-mono">
                  <div className="p-3.5 bg-slate-950/90 border border-cyan-500/30 rounded-xl text-center shadow-inner">
                    <div className="text-[0.65rem] uppercase font-bold text-cyan-400 flex items-center justify-center gap-1">
                      <Hash size={13} className="text-cyan-400 opacity-80" />
                      <span>Endereços Feitos</span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-black text-white my-1 tracking-tight">
                      {addressCount}
                    </div>
                    <div className="text-[0.65rem] text-slate-400 font-medium">
                      posições concluídas
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/90 border border-emerald-500/30 rounded-xl text-center shadow-inner">
                    <div className="text-[0.65rem] uppercase font-bold text-emerald-400 flex items-center justify-center gap-1">
                      <Box size={13} className="text-emerald-400 opacity-80" />
                      <span>Volumes Feitos</span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-black text-emerald-400 my-1 tracking-tight">
                      {volumeCount}
                    </div>
                    <div className="text-[0.65rem] text-slate-400 font-medium">
                      média: <strong className="text-white font-bold">{currentMediaPorEndereco}</strong> vol/end
                    </div>
                  </div>
                </div>

                {/* SUPER BOTÃO MOBILE "+ 1 ENDEREÇO FEITO" */}
                <div className="relative pt-1">
                  <button
                    type="button"
                    onClick={handleQuickAddAddress}
                    className={`w-full min-h-[82px] py-4 px-6 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-300 text-black font-black text-base sm:text-lg uppercase tracking-wider rounded-2xl flex flex-col items-center justify-center gap-1 shadow-2xl shadow-emerald-950/60 cursor-pointer font-mono transition-transform duration-100 select-none border border-emerald-300/40 ${
                      touchPulse ? 'scale-95 ring-4 ring-emerald-300' : 'hover:scale-[1.01]'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center gap-2">
                      <Plus size={24} strokeWidth={3.5} />
                      <span>+ 1 ENDEREÇO FEITO</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-950 opacity-90">
                      (+{defaultVolPerAddress} vol • Tecla [ENTER / +])
                    </span>
                  </button>
                </div>

                {/* CONTROLES DE AJUSTE ESPAÇADOS PARA EVITAR TOQUES ACIDENTAIS */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-white/[0.08]">
                  
                  {/* Botão Desfazer (-1 Endereço) */}
                  <button
                    type="button"
                    onClick={handleUndoAddress}
                    disabled={addressCount === 0}
                    className="min-h-[44px] px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <Undo2 size={15} />
                    <span>Desfazer [-]</span>
                  </button>

                  {/* Micro-ajustes de Volume com espaçamento seguro */}
                  <div className="flex items-center gap-1.5 bg-slate-950/90 p-1.5 rounded-xl border border-white/10">
                    <span className="text-[0.62rem] text-slate-400 uppercase px-1 font-bold">Vol:</span>
                    <button
                      type="button"
                      onClick={() => handleAddVolume(1)}
                      className="min-h-[38px] min-w-[40px] px-2.5 py-1 bg-white/10 hover:bg-emerald-500 hover:text-black text-emerald-300 border border-white/10 rounded-lg text-xs font-black cursor-pointer transition-all"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddVolume(5)}
                      className="min-h-[38px] min-w-[40px] px-2.5 py-1 bg-white/10 hover:bg-emerald-500 hover:text-black text-emerald-300 border border-white/10 rounded-lg text-xs font-black cursor-pointer transition-all"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddVolume(-1)}
                      disabled={volumeCount === 0}
                      className="min-h-[38px] min-w-[40px] px-2.5 py-1 bg-white/10 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 rounded-lg text-xs font-black cursor-pointer disabled:opacity-30 transition-all"
                    >
                      -1
                    </button>
                  </div>

                  {/* Configuração de volumes por clique padrão */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="text-[0.62rem] uppercase font-bold text-slate-400">Padrão:</span>
                    <select
                      value={defaultVolPerAddress}
                      onChange={(e) => setDefaultVolPerAddress(Number(e.target.value))}
                      className="min-h-[42px] bg-slate-950/90 border border-white/20 text-white font-bold rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-400 cursor-pointer"
                    >
                      <option value={0}>0 (Apenas end)</option>
                      <option value={1}>+1 vol</option>
                      <option value={2}>+2 vol</option>
                      <option value={3}>+3 vol</option>
                      <option value={4}>+4 vol</option>
                      <option value={5}>+5 vol</option>
                      <option value={10}>+10 vol</option>
                    </select>
                  </div>

                </div>

                {/* PACING & TEMPO DO ÚLTIMO ENDEREÇO */}
                {stopwatchActive && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Timer size={13} className="text-cyan-400 animate-spin" />
                      <span>Nesta posição: <strong className="text-cyan-300 text-sm font-bold">{currentAddressSeconds}s</strong></span>
                    </div>
                    <div>
                      {lastLapDuration !== null ? (
                        <span>Última posição: <strong className="text-emerald-400 text-sm font-bold">{lastLapDuration}s</strong></span>
                      ) : (
                        <span className="text-slate-500">Aguardando 1º clique</span>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* CONTROLE DE TEMPO: CRONÔMETRO VS APONTAMENTO MANUAL */}
            <div className="border border-white/10 rounded-xl p-4 bg-slate-950/70 space-y-3.5">
              {timeMode === 'cronometro' ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-2">
                      <Clock size={14} className="text-emerald-400 opacity-80" />
                      Tempo de Operação na {effectiveStreet || 'Rua'}
                    </span>
                    <span className={`text-[0.62rem] uppercase font-bold px-2.5 py-0.5 rounded-full border ${
                      stopwatchActive 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse' 
                        : stopwatchSeconds > 0 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                        : 'bg-white/5 text-slate-400 border-white/10'
                    }`}>
                      {stopwatchActive ? 'Em Andamento' : stopwatchSeconds > 0 ? 'Pausado' : 'Pronto'}
                    </span>
                  </div>

                  {/* Display do Cronômetro */}
                  <div className="text-center py-3 bg-slate-950/90 border border-white/10 rounded-xl shadow-inner">
                    <div className="text-4xl sm:text-5xl font-black tracking-widest text-emerald-400 font-mono">
                      {String(Math.floor(stopwatchSeconds / 3600)).padStart(2, '0')}:
                      {String(Math.floor((stopwatchSeconds % 3600) / 60)).padStart(2, '0')}:
                      {String(stopwatchSeconds % 60).padStart(2, '0')}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">
                      Duração Decimal: <strong className="text-white font-bold">{safeToFixed(calculatedHours, 2)}h</strong> ({Math.round(toSafeNumber(calculatedHours) * 60)} min)
                    </div>
                  </div>

                  {/* Botões do Cronômetro Grandes */}
                  <div className="flex gap-2">
                    {!stopwatchActive ? (
                      <button
                        type="button"
                        onClick={handleStartStopwatch}
                        className="flex-1 min-h-[48px] py-3 px-4 bg-emerald-500 text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-emerald-400 active:scale-[0.99] shadow-md transition-all"
                      >
                        <Play size={16} fill="currentColor" />
                        <span>{stopwatchSeconds > 0 ? 'Retomar [ESPAÇO]' : `Iniciar na Rua ${effectiveStreet || ''}`}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePauseStopwatch}
                        className="flex-1 min-h-[48px] py-3 px-4 bg-amber-500 text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-400 active:scale-[0.99] shadow-md transition-all"
                      >
                        <Pause size={16} fill="currentColor" />
                        <span>Pausar Tempo [ESPAÇO]</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleResetStopwatch}
                      disabled={stopwatchSeconds === 0}
                      className="min-h-[48px] min-w-[48px] px-3.5 py-3 bg-white/10 border border-white/15 text-slate-300 hover:text-rose-400 hover:border-rose-500/40 rounded-xl cursor-pointer text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Zerar cronômetro"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-2">
                    <Clock size={14} className="text-cyan-400 opacity-80" />
                    Horário de Início e Término
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[0.62rem] text-slate-400 uppercase block mb-1 font-bold">
                        Hora Início
                      </label>
                      <input
                        type="time"
                        value={manualStartTime}
                        onChange={(e) => setManualStartTime(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-950/80 border border-white/20 focus:border-cyan-400 text-white text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[0.62rem] text-slate-400 uppercase block mb-1 font-bold">
                        Hora Fim
                      </label>
                      <input
                        type="time"
                        value={manualEndTime}
                        onChange={(e) => setManualEndTime(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-950/80 border border-white/20 focus:border-cyan-400 text-white text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 text-right font-medium">
                    Duração Calculada: <strong className="text-white font-bold">{safeToFixed(calculatedHours, 2)}h</strong> ({Math.round(toSafeNumber(calculatedHours) * 60)} min)
                  </div>
                </div>
              )}
            </div>

            {/* BOTÃO DE CONFIRMAÇÃO & GRAVAÇÃO (EXTRA GRANDE E DESTACADO) */}
            <button
              type="button"
              onClick={handleSaveReplenishment}
              disabled={isSubmitting || calculatedHours <= 0 || addressCount <= 0 || volumeCount <= 0}
              className="w-full min-h-[54px] py-3.5 px-6 bg-emerald-500 text-black font-black text-sm uppercase tracking-widest rounded-xl flex items-center justify-center gap-2.5 cursor-pointer hover:bg-emerald-400 shadow-xl transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-300/40"
            >
              <CheckCircle2 size={20} strokeWidth={2.5} />
              <span>Finalizar & Gravar Apontamento [F]</span>
            </button>

          </div>

        </div>

        {/* LADO DIREITO: DASHBOARD EM TEMPO REAL & KPIS CALCULADOS (5 COLUNAS) - OCULTO NO MODO FOCO */}
        {!focusMode && (
          <div className="lg:col-span-5 space-y-4">
            
            {/* ========================================================================= */}
            {/* CARD 1: INDICADORES EM TEMPO REAL DESTA SESSÃO (EM ANDAMENTO) */}
            {/* ========================================================================= */}
            <div className="p-4 sm:p-5 rounded-2xl relative overflow-hidden bg-slate-900/90 border border-white/10 shadow-lg space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Gauge size={14} />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    2. Em Andamento ({effectiveStreet || 'RUA'})
                  </h3>
                </div>
                <span className="text-[0.62rem] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-bold tracking-wide">
                  Ao Vivo
                </span>
              </div>

              <div className="space-y-3">
                
                {/* Média de Itens por Endereço Atual */}
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-center relative overflow-hidden">
                  <div className="text-[0.65rem] uppercase font-bold text-slate-300 flex items-center justify-center gap-1.5">
                    <Box size={13} className="text-emerald-400 opacity-80" />
                    <span>Média Atual de Itens / Endereço</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-emerald-400 my-1 tracking-tight">
                    {currentMediaPorEndereco} <span className="text-xs font-normal text-emerald-300">vol/end</span>
                  </div>
                  <p className="text-[0.65rem] text-slate-400">
                    {volumeCount} volumes em {addressCount} posições na {effectiveStreet}
                  </p>
                </div>

                {/* EPH & VPH Atual */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-center">
                    <div className="text-[0.65rem] uppercase font-bold text-slate-300 flex items-center justify-center gap-1">
                      <Zap size={13} className="text-cyan-400 opacity-80" />
                      <span>EPH Atual</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-cyan-400 my-1 tracking-tight">
                      {currentEPH}
                    </div>
                    <div className="text-[0.6rem] text-slate-400">
                      endereços / hora
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-center">
                    <div className="text-[0.65rem] uppercase font-bold text-slate-300 flex items-center justify-center gap-1">
                      <TrendingUp size={13} className="text-purple-400 opacity-80" />
                      <span>VPH Atual</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-purple-400 my-1 tracking-tight">
                      {currentVPH}
                    </div>
                    <div className="text-[0.6rem] text-slate-400">
                      volumes / hora
                    </div>
                  </div>
                </div>

                {/* Tempo Médio por Posição */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/10 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-300 flex items-center gap-2">
                    <Clock size={13} className="text-amber-400 opacity-80" />
                    Tempo Médio por Posição:
                  </span>
                  <strong className="text-amber-400 text-xs sm:text-sm font-bold">
                    {currentMinPorEndereco} min / end
                  </strong>
                </div>

              </div>
            </div>

            {/* ========================================================================= */}
            {/* CARD 2: MÉTRICAS HISTÓRICAS ESPECÍFICAS DA RUA SELECIONADA */}
            {/* ========================================================================= */}
            <div className="p-4 sm:p-5 rounded-2xl relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950 border border-cyan-500/20 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    <BarChart3 size={14} />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                      Histórico da Rua: {effectiveStreet || 'N/A'}
                    </h3>
                  </div>
                </div>

                <span className="text-[0.62rem] px-2.5 py-0.5 rounded-lg bg-slate-950/80 text-cyan-300 border border-white/10 font-bold">
                  {selectedStreetHistory?.count || 0}x Lançamentos
                </span>
              </div>

              {selectedStreetHistory && selectedStreetHistory.count > 0 ? (
                <div className="space-y-2.5">
                  
                  {/* Comparativo Média Volumes / Endereço */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs uppercase font-bold text-slate-300 flex items-center gap-1.5">
                        <Box size={13} className="text-emerald-400 opacity-80" />
                        Média Histórica:
                      </span>
                      <span className="text-[0.62rem] text-slate-400">
                        {selectedStreetHistory.totalVolumes} vols em {selectedStreetHistory.totalEnderecos} endereços
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-bold text-emerald-400">
                        {selectedStreetHistory.mediaVolPorEnd} <span className="text-xs font-normal opacity-80">v/e</span>
                      </div>
                    </div>
                  </div>

                  {/* EPH Histórico vs VPH Histórico */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-center">
                      <span className="text-[0.65rem] uppercase font-bold text-slate-300 block">
                        EPH Histórico
                      </span>
                      <div className="text-lg sm:text-xl font-bold text-cyan-300 my-0.5">
                        {selectedStreetHistory.eph}
                      </div>
                      <span className="text-[0.6rem] text-slate-400">end / hora</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-center">
                      <span className="text-[0.65rem] uppercase font-bold text-slate-300 block">
                        VPH Histórico
                      </span>
                      <div className="text-lg sm:text-xl font-bold text-purple-300 my-0.5">
                        {selectedStreetHistory.vph}
                      </div>
                      <span className="text-[0.6rem] text-slate-400">vol / hora</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/10 flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                      <Clock size={12} className="text-amber-400 opacity-80" />
                      Tempo Médio Histórico:
                    </span>
                    <strong className="text-amber-400 font-bold">
                      {selectedStreetHistory.minPorEnd} min / end
                    </strong>
                  </div>

                </div>
              ) : (
                <div className="text-center py-5 px-3 bg-slate-950/60 border border-dashed border-white/15 rounded-xl space-y-1.5">
                  <ShieldCheck size={22} className="mx-auto text-cyan-400/60" />
                  <p className="text-xs text-slate-300 font-bold">
                    Primeiro apontamento para a {effectiveStreet || 'Rua'}
                  </p>
                  <p className="text-[0.62rem] text-slate-400">
                    Os indicadores históricos serão consolidados automaticamente ao finalizar este registro.
                  </p>
                </div>
              )}
            </div>

            {/* CARD 3: CONSOLIDAÇÃO GERAL DA SESSÃO */}
            <div className="p-4 sm:p-5 rounded-2xl relative overflow-hidden bg-slate-900/90 border border-white/10 shadow-lg space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ListOrdered size={13} />
                  </div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Consolidação Global (Ruas)
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {overallStreetTotals.ruasAtendidas} ruas registadas
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-slate-950/80 border border-white/10">
                  <div className="text-[0.6rem] text-slate-400 uppercase font-bold">Endereços</div>
                  <div className="text-base font-bold text-cyan-400">{overallStreetTotals.totalEnds}</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-white/10">
                  <div className="text-[0.6rem] text-slate-400 uppercase font-bold">Média</div>
                  <div className="text-base font-bold text-emerald-400">{overallStreetTotals.avgVolPerEnd} v/e</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-white/10">
                  <div className="text-[0.6rem] text-slate-400 uppercase font-bold">VPH Global</div>
                  <div className="text-base font-bold text-purple-400">{overallStreetTotals.globalVph}</div>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* SEÇÃO INFERIOR: HISTÓRICO COMPARATIVO E RANKING POR RUA - OCULTO NO MODO FOCO */}
      {!focusMode && (
        <div className="p-4 sm:p-5 rounded-2xl relative overflow-hidden bg-slate-900/90 border border-white/10 shadow-lg space-y-3.5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <TrendingUp size={14} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  Desempenho Consolidado por Rua
                </h3>
              </div>
            </div>

            <span className="text-xs text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-3 py-0.5 rounded-full font-bold">
              {streetStats.length} Ruas com Apontamento
            </span>
          </div>

          {streetStats.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-white/15 rounded-xl space-y-1.5">
              <p className="font-bold text-slate-400">Nenhum reabastecimento por rua registrado ainda.</p>
              <p className="text-[0.65rem]">Utilize o botão "+ 1 Endereço Feito" ou o formulário acima para registrar sua primeira rua!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[0.62rem] text-slate-400 uppercase bg-white/[0.02]">
                    <th className="p-2.5 font-bold">Rua / Corredor</th>
                    <th className="p-2.5 text-center font-bold">Setor</th>
                    <th className="p-2.5 text-center font-bold">Lançamentos</th>
                    <th className="p-2.5 text-right font-bold">Endereços</th>
                    <th className="p-2.5 text-right font-bold">Volumes</th>
                    <th className="p-2.5 text-right font-bold">Horas</th>
                    <th className="p-2.5 text-right text-emerald-400 font-bold">Média (v/e)</th>
                    <th className="p-2.5 text-right text-cyan-400 font-bold">EPH</th>
                    <th className="p-2.5 text-right text-purple-400 font-bold">VPH</th>
                    <th className="p-2.5 text-right text-amber-400 font-bold">Tempo/Pos</th>
                    <th className="p-2.5 text-center font-bold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {streetStats.map((item, idx) => (
                    <tr 
                      key={item.rua} 
                      className={`hover:bg-white/[0.04] transition-colors ${
                        item.rua === effectiveStreet ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="p-2.5 font-bold text-white flex items-center gap-1.5">
                        <span className="text-[0.6rem] text-slate-500 font-normal">#{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded-lg border font-mono font-bold ${
                          item.rua === effectiveStreet 
                            ? 'bg-emerald-500 text-black border-emerald-400 font-black' 
                            : 'bg-white/10 text-emerald-300 border-white/15'
                        }`}>
                          {item.rua}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[0.6rem] px-2 py-0.5 rounded-lg bg-slate-950/80 text-slate-300 border border-white/10 font-bold">
                          Setor {item.setor}
                        </span>
                      </td>
                      <td className="p-2.5 text-center text-slate-300 font-medium">{item.count}x</td>
                      <td className="p-2.5 text-right font-bold text-cyan-300">{item.totalEnderecos}</td>
                      <td className="p-2.5 text-right font-bold text-white">{item.totalVolumes}</td>
                      <td className="p-2.5 text-right text-slate-300 font-medium">{safeToFixed(item.totalHoras, 2)}h</td>
                      <td className="p-2.5 text-right font-bold text-emerald-400">
                        {item.mediaVolPorEnd}
                      </td>
                      <td className="p-2.5 text-right text-cyan-400 font-bold">{item.eph}</td>
                      <td className="p-2.5 text-right text-purple-400 font-bold">{item.vph}</td>
                      <td className="p-2.5 text-right text-amber-400 font-medium">{item.minPorEnd}m</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStreet(item.rua);
                            setCustomStreet('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            pdtAudio.playClickBeep();
                            onAddToast(`Rua ${item.rua} selecionada para novo apontamento`, 'var(--color-terminal-accent)');
                          }}
                          className="min-h-[34px] px-2.5 py-1 bg-slate-950/80 hover:bg-emerald-500 hover:text-black text-slate-200 border border-white/20 rounded-xl text-xs uppercase font-bold transition-all cursor-pointer shadow-sm"
                        >
                          Lançar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* BOTÃO FLUTUANTE STICKY PARA PDT ZEBRA & MOBILE - OCULTO NO MODO FOCO */}
      {/* ========================================================================= */}
      {!focusMode && (
        <div className="fixed bottom-3 left-3 right-3 z-40 animate-fade-in font-mono max-w-lg mx-auto">
          <div className="bg-slate-950/95 backdrop-blur-md border border-emerald-500/50 p-2.5 rounded-2xl shadow-2xl shadow-black/90 space-y-2">
            
            {/* Barra de Status Superior do HUD Flutuante */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-mono uppercase bg-white/10 px-2 py-0.5 rounded-lg border border-white/15 font-bold">
                  {effectiveStreet || 'RUA'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-cyan-400 font-bold">{addressCount} end</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 font-bold">{volumeCount} vol</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold">{currentMediaPorEndereco} v/e</span>
              </div>
            </div>

            {/* Botão de Ação Primário Flutuante (+1 Endereço) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuickAddAddress}
                className="flex-1 min-h-[52px] bg-emerald-500 active:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95 select-none border border-emerald-300/40"
                style={{ touchAction: 'manipulation' }}
              >
                <Plus size={20} strokeWidth={3} />
                <span>+1 ENDEREÇO [ENTER]</span>
                <span className="text-[0.65rem] bg-emerald-950/30 text-emerald-950 px-2 py-0.5 rounded-lg font-bold">
                  +{defaultVolPerAddress} vol
                </span>
              </button>

              {/* Botão Desfazer Flutuante Rápido */}
              <button
                type="button"
                onClick={handleUndoAddress}
                disabled={addressCount === 0}
                className="min-h-[52px] min-w-[52px] bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"
                title="Desfazer último endereço [-]"
              >
                <Undo2 size={18} />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
