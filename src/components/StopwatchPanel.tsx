import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppTimerState } from '../types';
import { useSectorStore, VALID_SECTORS, SECTOR_OPTIONS, SECTOR_NAMES } from '../stores/sectorStore';
import { validateGoogleSheetUrl, pingGoogleSheetsEndpoint } from '../sheetService';
import { 
  formatTimeToHHMM, 
  calculateDurationFromTimes, 
  adjustTimeMinutes,
  formatDateToBR,
  parseDateString
} from '../utils/dateUtils';
import { pdtAudio } from '../utils/pdtAudio';
import { 
  Clock, 
  Sliders, 
  RotateCcw, 
  CheckCircle2, 
  Zap, 
  Play, 
  Pause, 
  Square, 
  User, 
  Link2, 
  Layers, 
  Plus, 
  Minus,
  Sparkles,
  Smartphone,
  Keyboard,
  Volume2,
  VolumeX,
  Radio,
  Hash,
  Box
} from 'lucide-react';

interface StopwatchPanelProps {
  timerState: AppTimerState;
  colabHistory: string[];
  inputOpen: boolean;
  onStartTimer: (activity: string, btnId: string, tipo: 'direta' | 'indireta') => void;
  onPauseTimer: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  onSaveTimer: (colab: string, volumes: number, customHours?: number, horaInicio?: string, horaFim?: string) => void;
  onSaveManualLog?: (entry: {
    data: string;
    setor: string;
    atividade: string;
    colaborador: string;
    volumes: number;
    horas: number;
    horaInicio?: string;
    horaFim?: string;
    tipo: 'direta' | 'indireta';
  }) => void;
  activeOperator: string;
  onActiveOperatorChange: (op: string) => void;
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
}

export default function StopwatchPanel({
  timerState,
  colabHistory,
  inputOpen,
  onStartTimer,
  onPauseTimer,
  onStopTimer,
  onCancelTimer,
  onSaveTimer,
  onSaveManualLog,
  activeOperator,
  onActiveOperatorChange,
  apiUrl,
  onApiUrlChange
}: StopwatchPanelProps) {
  const [inpVol, setInpVol] = useState(timerState.rascunhoVol || '');
  const [selectedIndirectAct, setSelectedIndirectAct] = useState('Treinamentos / formações');
  
  // Panel mode: 'cronometro' or 'manual'
  const [panelMode, setPanelMode] = useState<'cronometro' | 'manual'>('cronometro');

  // Modo Coletor Zebra PDT (WVGA 800x480 / 480x800)
  const [pdtMode, setPdtMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('repro_zebra_pdt_mode');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const [soundActive, setSoundActive] = useState<boolean>(() => pdtAudio.isEnabled());

  // Optional manual time adjustment during stopwatch finalization
  const [enableManualAdjust, setEnableManualAdjust] = useState(false);
  const [customStartTime, setCustomStartTime] = useState('08:00');
  const [customEndTime, setCustomEndTime] = useState('09:00');

  // Direct manual entry state
  const [manualDate, setManualDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [manualActivityType, setManualActivityType] = useState<'direta' | 'indireta'>('direta');
  const [manualDirectAct, setManualDirectAct] = useState('REPRO');
  const [manualIndirectAct, setManualIndirectAct] = useState('Treinamentos / formações');
  const [manualStartTime, setManualStartTime] = useState('08:00');
  const [manualEndTime, setManualEndTime] = useState('12:00');
  const [manualVolumes, setManualVolumes] = useState('');

  // Sheet URL collapse toggle (salva espaço vertical no Zebra 800x480)
  const [sheetSectionExpanded, setSheetSectionExpanded] = useState(false);

  const { activeSectorId, updateActiveSector } = useSectorStore();

  useEffect(() => {
    if (timerState.rascunhoVol) setInpVol(timerState.rascunhoVol);
  }, [timerState.rascunhoVol]);

  // Sync initial start and end times when stopwatch is finalized
  useEffect(() => {
    if (inputOpen) {
      const now = new Date();
      const secs = timerState.cronometro?.segundos || 0;
      const start = new Date(now.getTime() - secs * 1000);
      setCustomStartTime(formatTimeToHHMM(start));
      setCustomEndTime(formatTimeToHHMM(now));
      setEnableManualAdjust(false);
      pdtAudio.playClickBeep();
    }
  }, [inputOpen, timerState.cronometro?.segundos]);

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

  const formatTime = (secs: number) => {
    const hoursVal = Math.floor(secs / 3600);
    const minutesVal = Math.floor((secs % 3600) / 60);
    const secondsVal = secs % 60;
    
    const hStr = hoursVal < 10 ? `0${hoursVal}` : `${hoursVal}`;
    const mStr = minutesVal < 10 ? `0${minutesVal}` : `${minutesVal}`;
    const sStr = secondsVal < 10 ? `0${secondsVal}` : `${secondsVal}`;
    
    return `${hStr}:${mStr}:${sStr}`;
  };

  // Duration calculation for live stopwatch completion
  const liveManualDuration = calculateDurationFromTimes(customStartTime, customEndTime);
  const activeSessionHours = enableManualAdjust && liveManualDuration.isValid
    ? liveManualDuration.decimalHours
    : ((timerState.cronometro?.segundos || 0) / 3600);

  const getProjecao = () => {
    const qty = parseInt(inpVol, 10) || 0;
    if (activeSessionHours > 0 && qty > 0) {
      return (qty / activeSessionHours).toFixed(1);
    }
    return '0.0';
  };

  // Duration calculation for direct manual entry
  const manualEntryDuration = calculateDurationFromTimes(manualStartTime, manualEndTime);
  const manualEntryHours = manualEntryDuration.isValid ? manualEntryDuration.decimalHours : 0;
  const manualEntryVph = () => {
    const qty = parseInt(manualVolumes, 10) || 0;
    if (manualEntryHours > 0 && qty > 0 && manualActivityType === 'direta') {
      return (qty / manualEntryHours).toFixed(1);
    }
    return '0.0';
  };

  const isIndireta = timerState.cronometro?.tipo === 'indireta';

  // Wrapping action handlers with acoustic feedback
  const handleStartWithSound = (activity: string, btnId: string, tipo: 'direta' | 'indireta') => {
    pdtAudio.playStartTimer();
    pdtAudio.triggerHaptic(50);
    onStartTimer(activity, btnId, tipo);
  };

  const handlePauseWithSound = () => {
    pdtAudio.playPauseTimer();
    pdtAudio.triggerHaptic(40);
    onPauseTimer();
  };

  const handleStopWithSound = () => {
    pdtAudio.playClickBeep();
    pdtAudio.triggerHaptic(50);
    onStopTimer();
  };

  const handleSaveTimerWithSound = () => {
    const vols = isIndireta ? 0 : (parseInt(inpVol, 10) || 0);
    const customHrs = enableManualAdjust ? liveManualDuration.decimalHours : undefined;
    const hIni = enableManualAdjust ? customStartTime : undefined;
    const hFim = enableManualAdjust ? customEndTime : undefined;
    pdtAudio.playSuccessChime();
    pdtAudio.triggerHaptic(80);
    onSaveTimer(activeOperator, vols, customHrs, hIni, hFim);
  };

  // Handle direct manual save
  const handleDirectManualSubmit = () => {
    if (!onSaveManualLog) return;
    const actName = manualActivityType === 'direta' ? manualDirectAct : manualIndirectAct;
    const vols = manualActivityType === 'direta' ? (parseInt(manualVolumes, 10) || 0) : 0;
    
    const parsedD = parseDateString(manualDate) || new Date();
    const formattedDate = formatDateToBR(parsedD);

    pdtAudio.playSuccessChime();
    pdtAudio.triggerHaptic(80);

    onSaveManualLog({
      data: formattedDate,
      setor: activeSectorId,
      atividade: actName,
      colaborador: activeOperator,
      volumes: vols,
      horas: manualEntryHours,
      horaInicio: manualStartTime,
      horaFim: manualEndTime,
      tipo: manualActivityType
    });

    setManualVolumes('');
  };

  // Quick volume additions
  const handleQuickAddVolume = (qty: number) => {
    const current = parseInt(inpVol, 10) || 0;
    const nextVal = Math.max(0, current + qty);
    setInpVol(String(nextVal));
    pdtAudio.playClickBeep();
    pdtAudio.triggerHaptic(30);
  };

  // =========================================================================
  // KEYBOARD SHORTCUTS PARA TECLADO FÍSICO DO COLETOR ZEBRA MC3000 / MC3300
  // =========================================================================
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Se o operador estiver digitando em um input de texto/time/date, não intercepta teclas normais
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.tagName === 'SELECT'
    );

    // Tecla ESC: Fecha modal de finalização
    if (e.key === 'Escape' && inputOpen) {
      e.preventDefault();
      onCancelTimer();
      pdtAudio.playUndoTone();
      return;
    }

    // Tecla ENTER no modal de finalização: Salva o apontamento
    if (e.key === 'Enter' && inputOpen) {
      if (activeOperator && activeSessionHours > 0) {
        e.preventDefault();
        handleSaveTimerWithSound();
      }
      return;
    }

    // Atalhos que funcionam quando não está digitando texto
    if (!isInputFocused) {
      // BARRA DE ESPAÇO: Alterna Play / Pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (timerState.cronometro?.ativo) {
          handlePauseWithSound();
        } else if (timerState.cronometro?.atividade) {
          handleStartWithSound(
            timerState.cronometro.atividade,
            timerState.cronometro.botaoId || 'repro',
            timerState.cronometro.tipo || 'direta'
          );
        } else {
          handleStartWithSound('REPRO', 'repro', 'direta');
        }
        return;
      }

      // Teclas 1, 2, 3: Inicia atividades diretas
      if (e.key === '1') {
        e.preventDefault();
        handleStartWithSound('REPRO', 'repro', 'direta');
      } else if (e.key === '2') {
        e.preventDefault();
        handleStartWithSound('ELOG', 'elog', 'direta');
      } else if (e.key === '3') {
        e.preventDefault();
        handleStartWithSound('DIVERSOS', 'pendencias', 'direta');
      }

      // Teclas 8, 9, 0: Seleciona Setores (87, 88, 89, 90)
      if (e.key === '8') {
        e.preventDefault();
        updateActiveSector('87');
        pdtAudio.playClickBeep();
      } else if (e.key === '9') {
        e.preventDefault();
        updateActiveSector('89');
        pdtAudio.playClickBeep();
      } else if (e.key === '0') {
        e.preventDefault();
        updateActiveSector('90');
        pdtAudio.playClickBeep();
      }

      // Tecla F ou Enter fora do input: Finalizar se cronômetro tiver tempo
      if ((e.key === 'f' || e.key === 'F' || e.key === 'Enter') && !inputOpen && (timerState.cronometro?.segundos || 0) > 0) {
        e.preventDefault();
        handleStopWithSound();
      }
    }
  }, [inputOpen, activeOperator, activeSessionHours, timerState.cronometro, onCancelTimer, updateActiveSector]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const urlVal = validateGoogleSheetUrl(apiUrl);

  return (
    <div className="space-y-4 font-mono animate-fade-in">
      
      {/* BARRA SUPERIOR DE CONTROLE ZEBRA PDT & ATALHOS RÁPIDOS */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-white/10 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Radio size={16} className="text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                Cronômetro Geral
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
              Otimizado para coletor Zebra MC3000 / MC3300 com suporte a teclado físico e luvas.
            </p>
          </div>
        </div>

        {/* Toggles de Modo PDT, Som e Feedback */}
        <div className="flex items-center gap-2">
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
          <span>Atalhos Teclado Físico:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-emerald-400">ESPAÇO</strong>: Play/Pause</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-cyan-400">1</strong>: Repro</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-cyan-400">2</strong>: Elog</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-cyan-400">3</strong>: Div</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-amber-400">8/9/0</strong>: Setores</span>
          <span className="bg-white/10 px-2 py-0.5 rounded border border-white/15 font-bold"><strong className="text-emerald-400">ENTER</strong>: Gravar</span>
        </div>
      </div>

      {/* GRID PRINCIPAL: 2 COLUNAS COMPATÍVEIS COM WVGA 800x480 E MOBILE 480x800 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* ========================================================================= */}
        {/* PAINEL 1: OPERADOR, SETOR & CONFIGURAÇÃO */}
        {/* ========================================================================= */}
        <section className={`border-panel p-4 sm:p-5 rounded-2xl flex flex-col justify-between ${pdtMode ? 'space-y-3.5' : 'space-y-5'} relative overflow-hidden bg-slate-900/90 shadow-lg`}>
          <div className={`${pdtMode ? 'space-y-3' : 'space-y-4'}`}>
            
            {/* OPERADOR ATIVO */}
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <User size={14} />
                  </div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                    1. Operador Ativo
                  </h2>
                </div>
                {activeOperator ? (
                  <span className="text-[0.62rem] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    ✓ PRONTO
                  </span>
                ) : (
                  <span className="text-[0.62rem] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">
                    DIGITE O NOME
                  </span>
                )}
              </div>

              <div>
                <label className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
                  Nome do Colaborador:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={activeOperator}
                    onChange={(e) => onActiveOperatorChange(e.target.value)}
                    list="colab-datalist-global"
                    className="w-full min-h-[46px] bg-slate-950/80 border border-white/15 text-emerald-400 text-sm font-bold focus:outline-none focus:border-emerald-500 p-2.5 rounded-xl uppercase transition-all shadow-inner"
                    placeholder="DIGITE OU SELECIONE O NOME..."
                  />
                </div>
                <datalist id="colab-datalist-global">
                  {colabHistory.map((col, idx) => (
                    <option key={idx} value={col} />
                  ))}
                </datalist>
              </div>

              {/* SELETOR DE SETOR RÁPIDO COM BOTÕES TOUCH-FRIENDLY */}
              <div className="mt-3 pt-2.5 border-t border-white/10">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold">
                    Setor de Operação:
                  </span>
                  <span className="text-xs text-emerald-400 font-bold">
                    {SECTOR_NAMES[activeSectorId] || `Setor ${activeSectorId}`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {VALID_SECTORS.map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        updateActiveSector(sec);
                        pdtAudio.playClickBeep();
                      }}
                      className={`min-h-[44px] py-2 px-1 text-xs font-bold uppercase rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                        activeSectorId === sec
                          ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-md'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                      }`}
                    >
                      Setor {sec}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* LIGAÇÃO À PLANILHA GOOGLE SHEETS (COLAPSÁVEL PARA POUPAR ALTURA NO ZEBRA) */}
            <div className="border border-white/10 rounded-xl p-3 bg-slate-950/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Link2 size={13} />
                  </div>
                  <span className="text-[0.65rem] font-bold text-white uppercase tracking-wider">
                    Conexão Google Sheets
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {!apiUrl ? (
                    <span className="text-[0.55rem] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase font-bold">
                      Não configurado
                    </span>
                  ) : urlVal.isValid ? (
                    <span className="text-[0.55rem] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Conectado</span>
                    </span>
                  ) : (
                    <span className="text-[0.55rem] text-rose-400 bg-rose-500/10 border border-rose-500/40 px-2 py-0.5 rounded-full uppercase font-bold">
                      Ajustar URL
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setSheetSectionExpanded(!sheetSectionExpanded)}
                    className="text-[0.6rem] text-slate-400 hover:text-white px-2 py-1 bg-white/5 rounded-lg border border-white/10 cursor-pointer"
                  >
                    {sheetSectionExpanded ? 'Ocultar' : 'Editar'}
                  </button>
                </div>
              </div>

              {sheetSectionExpanded && (
                <div className="space-y-2.5 mt-3 pt-2.5 border-t border-white/10 animate-fade-in">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => onApiUrlChange(e.target.value)}
                      className={`flex-1 bg-black/60 border ${!apiUrl ? 'border-white/10' : !urlVal.isValid ? 'border-rose-500/60 text-rose-300' : 'border-emerald-500/60 text-emerald-400'} text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30 p-2.5 rounded-xl transition-all shadow-inner`}
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                    {apiUrl && (
                      <button
                        type="button"
                        onClick={() => onApiUrlChange('')}
                        className="px-3 py-1.5 text-[0.62rem] font-bold uppercase border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 rounded-xl cursor-pointer transition-all bg-white/5"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  
                  {apiUrl.length > 0 && !urlVal.isValid && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[0.62rem] rounded-xl flex items-center gap-2">
                      <span className="font-bold">⚠️</span>
                      <span>{urlVal.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rodapé informativo do painel */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[0.6rem] text-slate-500 font-mono">
            <span>Zebra MC3000 / MC3300 Engine</span>
            <span>Setor Ativo: <strong className="text-emerald-400">{activeSectorId}</strong></span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PAINEL 2: REGISTO DE ATIVIDADE & DISPLAY DO CRONÔMETRO */}
        {/* ========================================================================= */}
        <section className={`border-panel p-4 sm:p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden bg-slate-900/90 shadow-lg ${pdtMode ? 'space-y-3.5' : 'space-y-5'}`}>
          <div>
            {/* HEADER COM SELETOR DE MODO */}
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Layers size={14} />
                </div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  2. Registo de Atividade
                </h2>
              </div>

              {/* SELETOR DE MODO TOUCH-FRIENDLY */}
              <div className="flex items-center bg-slate-950/90 border border-white/10 rounded-xl p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('cronometro');
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[34px] px-3 py-1 text-xs font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    panelMode === 'cronometro'
                      ? 'bg-emerald-500 text-black shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock size={13} />
                  <span>Cronômetro</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('manual');
                    pdtAudio.playClickBeep();
                  }}
                  className={`min-h-[34px] px-3 py-1 text-xs font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    panelMode === 'manual'
                      ? 'bg-emerald-500 text-black shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders size={13} />
                  <span>Manual</span>
                </button>
              </div>
            </div>

            {/* DISPLAY HERO DO CRONÔMETRO COM ALTO CONTRASTE */}
            {panelMode === 'cronometro' && (
              <div className="space-y-3.5 animate-fade-in">
                
                {/* DISPLAY DIGITAL GIGANTE */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-center shadow-inner relative overflow-hidden">
                  <div className="flex justify-between items-center text-[0.65rem] uppercase font-bold text-slate-400 mb-1 border-b border-white/10 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className={timerState.cronometro?.ativo ? 'text-emerald-400 animate-spin' : 'text-slate-500'} />
                      <span>{timerState.cronometro?.ativo ? `EM EXECUÇÃO: ${timerState.cronometro?.atividade}` : timerState.cronometro?.segundos ? `PAUSADO: ${timerState.cronometro?.atividade}` : 'CRONÔMETRO PRONTO'}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border ${
                      timerState.cronometro?.ativo 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse font-black' 
                        : (timerState.cronometro?.segundos || 0) > 0 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                        : 'bg-white/5 text-slate-400 border-white/10'
                    }`}>
                      {timerState.cronometro?.ativo ? 'ATIVO' : (timerState.cronometro?.segundos || 0) > 0 ? 'PAUSADO' : 'PARADO'}
                    </span>
                  </div>

                  <div className="text-4xl sm:text-5xl font-black tracking-widest text-emerald-400 font-mono py-1 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                    {formatTime(timerState.cronometro?.segundos || 0)}
                  </div>

                  <div className="text-[0.68rem] text-slate-400 mt-1">
                    Duração Decimal: <strong className="text-white font-bold">{((timerState.cronometro?.segundos || 0) / 3600).toFixed(2)}h</strong>
                  </div>
                </div>

                {/* ATIVIDADES DIRETAS (BOTÕES GRANDES PARA TOQUE COM LUVAS OU TECLADO 1, 2, 3) */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold">
                      Atividades Diretas (Produção):
                    </p>
                    <span className="text-[0.58rem] text-emerald-400 font-bold">
                      Teclas [1] [2] [3]
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartWithSound('REPRO', 'repro', 'direta')}
                      className={`min-h-[48px] py-3 text-xs sm:text-sm font-black tracking-wider uppercase rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                        timerState.cronometro?.botaoId === 'repro' && !isIndireta 
                          ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/30' 
                          : 'bg-white/5 border-white/15 text-white hover:border-emerald-500/50 hover:bg-white/10'
                      }`}
                    >
                      <span>REPRO</span>
                      <span className="text-[0.55rem] opacity-75 font-normal">[1]</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartWithSound('ELOG', 'elog', 'direta')}
                      className={`min-h-[48px] py-3 text-xs sm:text-sm font-black tracking-wider uppercase rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                        timerState.cronometro?.botaoId === 'elog' && !isIndireta 
                          ? 'bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/30' 
                          : 'bg-white/5 border-white/15 text-white hover:border-cyan-500/50 hover:bg-white/10'
                      }`}
                    >
                      <span>ELOG</span>
                      <span className="text-[0.55rem] opacity-75 font-normal">[2]</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartWithSound('DIVERSOS', 'pendencias', 'direta')}
                      className={`min-h-[48px] py-3 text-xs sm:text-sm font-black tracking-wider uppercase rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                        timerState.cronometro?.botaoId === 'pendencias' && !isIndireta 
                          ? 'bg-purple-500 text-black border-purple-400 shadow-lg shadow-purple-500/30' 
                          : 'bg-white/5 border-white/15 text-white hover:border-purple-500/50 hover:bg-white/10'
                      }`}
                    >
                      <span>DIVERSOS</span>
                      <span className="text-[0.55rem] opacity-75 font-normal">[3]</span>
                    </button>
                  </div>
                </div>

                {/* ATIVIDADES INDIRETAS */}
                <div>
                  <p className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-bold mb-1.5">
                    Atividades Indiretas (Apoio / Treinamentos):
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={selectedIndirectAct}
                      onChange={(e) => setSelectedIndirectAct(e.target.value)}
                      className="flex-1 min-h-[44px] text-xs p-2.5 rounded-xl text-white border border-white/15 bg-slate-950/80 focus:outline-none focus:border-amber-400"
                    >
                      <option value="Treinamentos / formações">Treinamentos / formações</option>
                      <option value="Referentes / mesa">Referentes / mesa</option>
                      <option value="Inventário">Inventário</option>
                      <option value="Gerenciamento de estoque">Gerenciamento de estoque</option>
                      <option value="Reuniões de equipe">Reuniões de equipe</option>
                      <option value="EID">EID</option>
                      <option value="Missões do setor">Missões do setor</option>
                      <option value="Outros">Outros</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleStartWithSound(selectedIndirectAct, 'indireta', 'indireta')}
                      className={`min-h-[44px] px-4 py-2.5 text-xs font-bold uppercase rounded-xl cursor-pointer transition-all border ${
                        isIndireta 
                          ? 'bg-amber-400 text-black border-amber-300 font-black shadow-md' 
                          : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                      }`}
                    >
                      INICIAR
                    </button>
                  </div>
                </div>

                {/* CONTROLES DE PAUSA & FINALIZAR COM ÁREA DE TOQUE MASSIVA */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handlePauseWithSound}
                    disabled={!timerState.cronometro?.ativo}
                    className="min-h-[48px] py-3 text-xs font-black uppercase rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Pause size={16} />
                    <span>PAUSAR [ESPAÇO]</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopWithSound}
                    disabled={(timerState.cronometro?.segundos || 0) === 0}
                    className="min-h-[48px] py-3 text-xs font-black uppercase rounded-xl border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Square size={16} />
                    <span>FINALIZAR [F / ENTER]</span>
                  </button>
                </div>

              </div>
            )}

            {/* MODO MANUAL */}
            {panelMode === 'manual' && (
              <div className="space-y-3.5 bg-slate-950/80 p-4 border border-white/10 rounded-xl animate-fade-in font-mono">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders size={14} />
                    <span>Lançamento Direto de Horários</span>
                  </span>
                  <span className="text-[0.62rem] text-slate-400">
                    Sem cronômetro
                  </span>
                </div>

                {/* Data & Tipo */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                      Data do Registo:
                    </label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full min-h-[42px] bg-black/60 border border-white/15 text-white text-xs p-2 rounded-xl focus:outline-none focus:border-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                      Tipo:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setManualActivityType('direta')}
                        className={`min-h-[42px] py-1.5 text-xs font-bold uppercase rounded-xl border transition-all ${
                          manualActivityType === 'direta'
                            ? 'bg-emerald-500 text-black border-emerald-400 font-black'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Direta
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualActivityType('indireta')}
                        className={`min-h-[42px] py-1.5 text-xs font-bold uppercase rounded-xl border transition-all ${
                          manualActivityType === 'indireta'
                            ? 'bg-amber-400 text-black border-amber-300 font-black'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Indireta
                      </button>
                    </div>
                  </div>
                </div>

                {/* Atividade Selecionada */}
                {manualActivityType === 'direta' ? (
                  <div>
                    <label className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                      Atividade Direta:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['REPRO', 'ELOG', 'DIVERSOS'].map((act) => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => setManualDirectAct(act)}
                          className={`min-h-[42px] py-2 text-xs font-bold uppercase rounded-xl border cursor-pointer transition-all ${
                            manualDirectAct === act
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 font-black shadow-sm'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {act}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                      Atividade Indireta:
                    </label>
                    <select
                      value={manualIndirectAct}
                      onChange={(e) => setManualIndirectAct(e.target.value)}
                      className="w-full min-h-[42px] text-xs p-2.5 rounded-xl text-white border border-white/15 bg-black/60"
                    >
                      <option value="Treinamentos / formações">Treinamentos / formações</option>
                      <option value="Referentes / mesa">Referentes / mesa</option>
                      <option value="Inventário">Inventário</option>
                      <option value="Gerenciamento de estoque">Gerenciamento de estoque</option>
                      <option value="Reuniões de equipe">Reuniões de equipe</option>
                      <option value="EID">EID</option>
                      <option value="Missões do setor">Missões do setor</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                )}

                {/* Horários */}
                <div className="bg-slate-950/90 p-3 border border-white/10 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[0.62rem] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                      <Clock size={12} />
                      <span>Intervalo de Horas:</span>
                    </span>
                    <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                      {manualEntryDuration.formattedDuration} ({manualEntryHours.toFixed(2)}h)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[0.58rem] text-slate-400 uppercase block mb-1">Início</label>
                      <input
                        type="time"
                        value={manualStartTime}
                        onChange={(e) => setManualStartTime(e.target.value)}
                        className="w-full min-h-[42px] bg-black/80 border border-white/15 text-white text-xs font-mono p-2 rounded-xl focus:outline-none focus:border-emerald-500 text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[0.58rem] text-slate-400 uppercase block mb-1">Fim</label>
                      <input
                        type="time"
                        value={manualEndTime}
                        onChange={(e) => setManualEndTime(e.target.value)}
                        className="w-full min-h-[42px] bg-black/80 border border-white/15 text-white text-xs font-mono p-2 rounded-xl focus:outline-none focus:border-emerald-500 text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Volumes & VPH */}
                {manualActivityType === 'direta' && (
                  <div className="grid grid-cols-2 gap-2.5 bg-white/5 p-3 border border-white/10 rounded-xl items-center">
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                        QTD Volumes:
                      </label>
                      <input
                        type="number"
                        value={manualVolumes}
                        onChange={(e) => setManualVolumes(e.target.value)}
                        placeholder="0"
                        className="w-full min-h-[42px] bg-black/60 border border-white/15 text-emerald-400 text-base font-black p-1.5 rounded-xl focus:outline-none focus:border-emerald-500 text-center font-mono"
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-[0.58rem] text-slate-400 uppercase tracking-wider block font-bold">
                        VPH Calculado
                      </span>
                      <span className="text-lg font-black font-mono text-emerald-400">
                        {manualEntryVph()}{' '}
                        <span className="text-[0.6rem] text-slate-400 font-normal">VOL/H</span>
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDirectManualSubmit}
                  disabled={!activeOperator || manualEntryHours <= 0}
                  className="w-full min-h-[48px] py-3 bg-emerald-500 text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-emerald-400 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                >
                  <CheckCircle2 size={16} />
                  <span>Gravar Registo Manual ({manualEntryHours.toFixed(2)}h)</span>
                </button>
              </div>
            )}

          </div>

          {/* ========================================================================= */}
          {/* MODAL / FORMULÁRIO DE FINALIZAÇÃO DO CRONÔMETRO (TOUCH-FRIENDLY & PDT) */}
          {/* ========================================================================= */}
          {inputOpen && panelMode === 'cronometro' && (
            <div className="flex flex-col gap-3.5 mt-3 p-4 sm:p-5 border border-emerald-500/50 bg-black/95 backdrop-blur-md rounded-2xl shadow-2xl animate-fade-in font-mono">
              <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <span>Finalizar: {timerState.cronometro?.atividade}</span>
                </span>
                <span className="text-xs font-bold text-emerald-400 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full">
                  SETOR {activeSectorId}
                </span>
              </div>

              {!activeOperator && (
                <p className="text-xs text-rose-400 uppercase font-bold tracking-wider">
                  ⚠️ Defina um operador ativo primeiro!
                </p>
              )}

              {/* DURAÇÃO CRONOMETRADA BASE */}
              <div className="bg-white/5 p-3 border border-white/10 rounded-xl flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[0.65rem] uppercase tracking-wider font-bold">
                  Tempo Cronometrado:
                </span>
                <span className="text-white font-black font-mono text-sm">
                  {formatTime(timerState.cronometro?.segundos || 0)} ({((timerState.cronometro?.segundos || 0) / 3600).toFixed(2)}h)
                </span>
              </div>

              {/* AJUSTE MANUAL OPCIONAL */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableManualAdjust}
                      onChange={(e) => setEnableManualAdjust(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                    <span className="text-[0.65rem] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders size={13} className={enableManualAdjust ? 'text-emerald-400' : 'opacity-40'} />
                      <span>Ajustar horários manualmente</span>
                    </span>
                  </label>
                </div>

                {enableManualAdjust && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 animate-fade-in">
                    <div>
                      <label className="text-[0.58rem] uppercase text-slate-400 block mb-1">Início</label>
                      <input
                        type="time"
                        value={customStartTime}
                        onChange={(e) => setCustomStartTime(e.target.value)}
                        className="w-full min-h-[38px] bg-black/80 border border-white/15 text-white text-xs font-mono p-1.5 rounded-lg text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[0.58rem] uppercase text-slate-400 block mb-1">Fim</label>
                      <input
                        type="time"
                        value={customEndTime}
                        onChange={(e) => setCustomEndTime(e.target.value)}
                        className="w-full min-h-[38px] bg-black/80 border border-white/15 text-white text-xs font-mono p-1.5 rounded-lg text-center font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* QTD Volumes (se atividade direta) com BOTÕES PRESET PARA COLETOR ZEBRA */}
              {!isIndireta ? (
                <div className="bg-white/5 p-3.5 border border-white/10 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[0.65rem] uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                      <Box size={14} className="text-emerald-400" />
                      <span>Quantidade de Volumes:</span>
                    </label>
                    <div className="text-xs font-bold text-emerald-400">
                      Projeção: <strong>{getProjecao()} VOL/H</strong>
                    </div>
                  </div>

                  <input
                    type="number"
                    value={inpVol}
                    onChange={(e) => setInpVol(e.target.value)}
                    className="w-full min-h-[48px] bg-black/80 border border-emerald-500/50 text-emerald-400 text-xl font-black focus:outline-none focus:border-emerald-400 p-2 rounded-xl text-center shadow-inner"
                    placeholder="0"
                    autoFocus
                  />

                  {/* PRESETS DE VOLUMES RÁPIDOS PARA ZEBRA / LUVA */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: '+10', val: 10 },
                      { label: '+50', val: 50 },
                      { label: '+100', val: 100 },
                      { label: '+250', val: 250 },
                      { label: '+500', val: 500 },
                    ].map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handleQuickAddVolume(p.val)}
                        className="min-h-[36px] flex-1 px-2 bg-slate-950/80 hover:bg-emerald-500 hover:text-black text-emerald-300 border border-white/15 rounded-lg text-xs font-bold transition-all cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setInpVol('')}
                      className="min-h-[36px] px-3 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[0.62rem] text-slate-400 tracking-wider uppercase text-center my-1">
                  Atividade Indireta: Nenhuma contagem de volume é necessária.
                </p>
              )}
              
              {/* BOTÕES GRAVAR / CANCELAR GRANDES PARA TOQUE COM LUVAS */}
              <div className="grid grid-cols-2 gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={handleSaveTimerWithSound}
                  disabled={!activeOperator || activeSessionHours <= 0}
                  className="min-h-[52px] bg-emerald-500 hover:bg-emerald-400 text-black py-3 px-4 text-xs sm:text-sm font-black tracking-wider uppercase rounded-xl cursor-pointer disabled:opacity-30 shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 border border-emerald-300/40"
                >
                  <CheckCircle2 size={18} />
                  <span>GRAVAR [ENTER]</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pdtAudio.playUndoTone();
                    onCancelTimer();
                  }}
                  className="min-h-[52px] border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 py-3 px-4 text-xs font-bold tracking-wider uppercase rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>CANCELAR [ESC]</span>
                </button>
              </div>
            </div>
          )}
        </section>
        
      </div>

    </div>
  );
}
