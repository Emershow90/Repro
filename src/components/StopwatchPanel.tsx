import { useState, useEffect } from 'react';
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
import { 
  Clock, 
  Sliders, 
  RotateCcw, 
  Calendar, 
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
  ArrowRight
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
    }
  }, [inputOpen, timerState.cronometro?.segundos]);

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
    const qty = parseInt(inpVol) || 0;
    if (activeSessionHours > 0 && qty > 0) {
      return (qty / activeSessionHours).toFixed(1);
    }
    return '0.0';
  };

  // Duration calculation for direct manual entry
  const manualEntryDuration = calculateDurationFromTimes(manualStartTime, manualEndTime);
  const manualEntryHours = manualEntryDuration.isValid ? manualEntryDuration.decimalHours : 0;
  const manualEntryVph = () => {
    const qty = parseInt(manualVolumes) || 0;
    if (manualEntryHours > 0 && qty > 0 && manualActivityType === 'direta') {
      return (qty / manualEntryHours).toFixed(1);
    }
    return '0.0';
  };

  const isIndireta = timerState.cronometro?.tipo === 'indireta';

  // Handle direct manual save
  const handleDirectManualSubmit = () => {
    if (!onSaveManualLog) return;
    const actName = manualActivityType === 'direta' ? manualDirectAct : manualIndirectAct;
    const vols = manualActivityType === 'direta' ? (parseInt(manualVolumes) || 0) : 0;
    
    const parsedD = parseDateString(manualDate) || new Date();
    const formattedDate = formatDateToBR(parsedD);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* PAINEL 1: OPERADOR & LIGAÇÕES */}
      <section className="border-panel p-6 rounded-2xl flex flex-col justify-between space-y-6 relative overflow-hidden">
        <div className="space-y-6">
          
          {/* OPERADOR ATIVO */}
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <User size={14} />
                </div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  1. Operador Ativo
                </h2>
              </div>
              {activeOperator && (
                <span className="text-[0.6rem] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  PRONTO
                </span>
              )}
            </div>

            <div>
              <label className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-medium block mb-1.5">
                Nome do Colaborador
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={activeOperator}
                  onChange={(e) => onActiveOperatorChange(e.target.value)}
                  list="colab-datalist-global"
                  className="w-full bg-black/40 border border-white/10 text-emerald-400 text-sm font-bold focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 p-2.5 rounded-xl uppercase font-mono transition-all shadow-inner"
                  placeholder="DIGITE OU SELECIONE O NOME..."
                />
              </div>
              <datalist id="colab-datalist-global">
                {colabHistory.map((col, idx) => (
                  <option key={idx} value={col} />
                ))}
              </datalist>
            </div>

            {/* SELETOR DE SETOR RÁPIDO */}
            <div className="mt-3 pt-2.5 border-t border-white/10">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-medium font-mono">
                  Setor da Operação
                </span>
                <span className="text-[0.6rem] text-emerald-400 font-bold font-mono">
                  {SECTOR_NAMES[activeSectorId] || `Setor ${activeSectorId}`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 font-mono">
                {SECTOR_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateActiveSector(opt.id)}
                    className={`py-1.5 px-1 text-[0.6rem] font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                      activeSectorId === opt.id
                        ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                    }`}
                    title={opt.description}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* LIGAÇÃO À PLANILHA GOOGLE SHEETS */}
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Link2 size={14} />
                </div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  2. Ligação à Planilha
                </h2>
              </div>
            </div>

            {(() => {
              const urlVal = validateGoogleSheetUrl(apiUrl);
              return (
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-medium font-mono">
                      Link / WebApp Apps Script
                    </label>
                    {!apiUrl ? (
                      <span className="text-[0.55rem] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                        Não Configurado
                      </span>
                    ) : !urlVal.isValid ? (
                      <span 
                        onClick={() => pingGoogleSheetsEndpoint(apiUrl)}
                        className="text-[0.55rem] text-rose-400 bg-rose-500/10 border border-rose-500/40 px-2 py-0.5 rounded-full font-mono uppercase font-bold flex items-center gap-1 cursor-pointer hover:bg-rose-500/20 transition-colors"
                        title="Clique para testar conexão"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                        <span>URL Inválida (Testar)</span>
                      </span>
                    ) : (
                      <span 
                        onClick={() => pingGoogleSheetsEndpoint(apiUrl)}
                        className="text-[0.55rem] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-500/20 transition-colors"
                        title="Clique para testar conectividade"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Conectado (Ping OK)</span>
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => onApiUrlChange(e.target.value)}
                      className={`flex-1 bg-black/40 border ${!apiUrl ? 'border-white/10' : !urlVal.isValid ? 'border-rose-500/60 text-rose-300' : 'border-emerald-500/60 text-emerald-400'} text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30 p-2.5 rounded-xl transition-all shadow-inner`}
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                    {apiUrl && (
                      <button
                        type="button"
                        onClick={() => onApiUrlChange('')}
                        className="px-3 py-1.5 text-[0.62rem] font-bold uppercase font-mono border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 rounded-xl cursor-pointer transition-all bg-white/5"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  
                  {apiUrl.length > 0 && !urlVal.isValid && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[0.62rem] font-mono rounded-xl flex items-center gap-2">
                      <span className="font-bold">⚠️</span>
                      <span>{urlVal.message}</span>
                    </div>
                  )}

                  <p className="text-[0.58rem] text-slate-500 font-mono">
                    Aceita URL do Apps Script (/macros/s/.../exec) ou Link da Planilha Publicada.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Rodapé informativo sutil */}
        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[0.58rem] text-slate-500 font-mono">
          <span>Sistema Seguro</span>
          <span>IndexedDB + Supabase + Sheets</span>
        </div>
      </section>

      {/* PAINEL 2: REGISTO DE ATIVIDADE & CRONÔMETRO */}
      <section className="border-panel p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden">
        <div>
          {/* HEADER COM SELETOR DE MODO ORGÂNICO */}
          <div className="flex flex-wrap justify-between items-center mb-4 gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Layers size={14} />
              </div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                3. Registo de Atividade
              </h2>
            </div>

            {/* SELETOR DE MODO COM PILL ORGÂNICA */}
            <div className="flex items-center bg-black/50 border border-white/10 rounded-xl p-1 font-mono shadow-inner">
              <button
                type="button"
                onClick={() => setPanelMode('cronometro')}
                className={`px-3 py-1 text-[0.62rem] font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  panelMode === 'cronometro'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock size={12} />
                <span>Cronômetro</span>
              </button>
              <button
                type="button"
                onClick={() => setPanelMode('manual')}
                className={`px-3 py-1 text-[0.62rem] font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  panelMode === 'manual'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders size={12} />
                <span>Ajuste Manual</span>
              </button>
            </div>
          </div>

          {/* BADGE DE CRONÔMETRO ATIVO */}
          {timerState.cronometro?.ativo && (
            <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent border border-emerald-500/30 flex items-center justify-between animate-fade-in shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-mono font-bold text-white">
                  EM EXECUÇÃO: <strong className="text-emerald-400">{timerState.cronometro?.atividade}</strong>
                </span>
              </div>
              <span className="text-sm font-mono font-black text-emerald-400 bg-black/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                {formatTime(timerState.cronometro?.segundos || 0)}
              </span>
            </div>
          )}

          {/* SELEÇÃO DO SETOR ORGÂNICA (87, 88, 89, 90) */}
          <div className="mb-4 bg-black/40 p-3 rounded-xl border border-white/10">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[0.6rem] uppercase tracking-wider text-emerald-400 font-bold font-mono">
                Setor de Operação
              </label>
              <span className="text-[0.58rem] font-mono text-slate-400">
                Ativo: <strong>Setor {activeSectorId}</strong>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {VALID_SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => updateActiveSector(sec)}
                  className={`py-2 text-xs font-bold font-mono uppercase rounded-lg border transition-all cursor-pointer ${
                    activeSectorId === sec
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-black border-emerald-400 font-black shadow-md shadow-emerald-500/20 scale-[1.02]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-emerald-500/40 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Setor {sec}
                </button>
              ))}
            </div>
          </div>
          
          {/* ========================================================= */}
          {/* MODO 1: CRONÔMETRO AO VIVO */}
          {/* ========================================================= */}
          {panelMode === 'cronometro' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <p className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-medium block mb-2 font-mono">
                  Atividades Diretas (Produção - Setor {activeSectorId})
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    onClick={() => onStartTimer('REPRO', 'repro', 'direta')}
                    className={`btn-term py-3 text-xs font-bold tracking-wider uppercase rounded-xl cursor-pointer ${
                      timerState.cronometro?.botaoId === 'repro' && !isIndireta ? 'btn-term-active' : ''
                    }`}
                  >
                    REPRO
                  </button>
                  <button
                    onClick={() => onStartTimer('ELOG', 'elog', 'direta')}
                    className={`btn-term py-3 text-xs font-bold tracking-wider uppercase rounded-xl cursor-pointer ${
                      timerState.cronometro?.botaoId === 'elog' && !isIndireta ? 'btn-term-active' : ''
                    }`}
                  >
                    ELOG
                  </button>
                  <button
                    onClick={() => onStartTimer('DIVERSOS', 'pendencias', 'direta')}
                    className={`btn-term py-3 text-xs font-bold tracking-wider uppercase rounded-xl cursor-pointer ${
                      timerState.cronometro?.botaoId === 'pendencias' && !isIndireta ? 'btn-term-active' : ''
                    }`}
                  >
                    DIV
                  </button>
                </div>
              </div>

              <div>
                <p className="text-[0.6rem] uppercase tracking-wider text-slate-400 font-medium block mb-2 mt-3 font-mono">
                  Atividades Indiretas
                </p>
                <div className="flex gap-2">
                  <select
                    value={selectedIndirectAct}
                    onChange={(e) => setSelectedIndirectAct(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl text-white select border border-white/10 bg-black/40"
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
                    onClick={() => onStartTimer(selectedIndirectAct, 'indireta', 'indireta')}
                    className={`px-4 py-2.5 text-xs font-bold tracking-wider uppercase rounded-xl cursor-pointer transition-all border ${
                      isIndireta 
                        ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-400/20' 
                        : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    INICIAR
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-4 mt-5">
                <button
                  onClick={onPauseTimer}
                  disabled={!timerState.cronometro?.ativo}
                  className="py-2.5 text-xs font-bold tracking-wider uppercase rounded-xl transition-all border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer disabled:opacity-30 flex items-center justify-center gap-1.5"
                >
                  <Pause size={13} />
                  <span>PAUSAR</span>
                </button>
                <button
                  onClick={onStopTimer}
                  disabled={timerState.cronometro?.segundos === 0}
                  className="py-2.5 text-xs font-bold tracking-wider uppercase rounded-xl transition-all border border-white/20 text-white hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-30 flex items-center justify-center gap-1.5"
                >
                  <Square size={13} />
                  <span>FINALIZAR</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODO 2: LANÇAMENTO MANUAL DE HORÁRIOS */}
          {/* ========================================================= */}
          {panelMode === 'manual' && (
            <div className="space-y-4 bg-black/40 p-4 border border-white/10 rounded-xl animate-fade-in font-mono">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={14} />
                  <span>Lançamento Direto de Horários</span>
                </span>
                <span className="text-[0.6rem] text-slate-400">
                  Sem cronômetro
                </span>
              </div>

              {/* Data & Tipo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                    Data do Registo
                  </label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-white text-xs p-2 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                    Tipo de Atividade
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setManualActivityType('direta')}
                      className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg border transition-all ${
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
                      className={`py-1.5 text-[0.62rem] font-bold uppercase rounded-lg border transition-all ${
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
                  <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                    Atividade Direta (Produção)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['REPRO', 'ELOG', 'DIVERSOS'].map((act) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => setManualDirectAct(act)}
                        className={`py-2 text-xs font-bold uppercase rounded-lg border cursor-pointer transition-all ${
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
                  <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                    Atividade Indireta
                  </label>
                  <select
                    value={manualIndirectAct}
                    onChange={(e) => setManualIndirectAct(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg text-white select border border-white/10 bg-black/50"
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

              {/* AJUSTE MANUAL: HORA INÍCIO E HORA FIM */}
              <div className="bg-black/60 p-3.5 border border-emerald-500/30 rounded-xl space-y-3 shadow-inner">
                <div className="flex justify-between items-center">
                  <span className="text-[0.62rem] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                    <Clock size={13} />
                    <span>Intervalo de Horas</span>
                  </span>
                  <span className="text-[0.62rem] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                    {manualEntryDuration.formattedDuration} ({manualEntryHours.toFixed(2)}h)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[0.55rem] uppercase tracking-wider text-slate-400 block mb-1">
                      Hora Início
                    </label>
                    <input
                      type="time"
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      className="w-full bg-black/80 border border-white/15 text-white text-xs font-mono p-2 rounded-lg focus:outline-none focus:border-emerald-500 text-center font-bold"
                    />
                    <div className="flex justify-between gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setManualStartTime(adjustTimeMinutes(manualStartTime, -15))}
                        className="flex-1 text-[0.55rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                      >
                        -15m
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualStartTime(adjustTimeMinutes(manualStartTime, 15))}
                        className="flex-1 text-[0.55rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                      >
                        +15m
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.55rem] uppercase tracking-wider text-slate-400 block mb-1">
                      Hora Término
                    </label>
                    <input
                      type="time"
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      className="w-full bg-black/80 border border-white/15 text-white text-xs font-mono p-2 rounded-lg focus:outline-none focus:border-emerald-500 text-center font-bold"
                    />
                    <div className="flex justify-between gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setManualEndTime(adjustTimeMinutes(manualEndTime, -15))}
                        className="flex-1 text-[0.55rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                      >
                        -15m
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualEndTime(adjustTimeMinutes(manualEndTime, 15))}
                        className="flex-1 text-[0.55rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                      >
                        +15m
                      </button>
                    </div>
                  </div>
                </div>

                {/* Presets Rápidos */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/10">
                  <span className="text-[0.52rem] text-slate-500 uppercase tracking-wider w-full">
                    Atalhos Rápidos de Turno:
                  </span>
                  {[
                    { label: '08:00 - 12:00 (4h)', start: '08:00', end: '12:00' },
                    { label: '13:00 - 17:00 (4h)', start: '13:00', end: '17:00' },
                    { label: '08:00 - 17:00 (9h)', start: '08:00', end: '17:00' },
                    { label: '1h', start: '08:00', end: '09:00' },
                    { label: '2h', start: '08:00', end: '10:00' },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setManualStartTime(p.start);
                        setManualEndTime(p.end);
                      }}
                      className="px-2 py-1 text-[0.55rem] bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 rounded-md cursor-pointer transition-all"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volumes & VPH para atividade direta */}
              {manualActivityType === 'direta' && (
                <div className="grid grid-cols-2 gap-3 bg-white/5 p-3 border border-white/10 rounded-xl items-center">
                  <div>
                    <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                      QTD Volumes
                    </label>
                    <input
                      type="number"
                      value={manualVolumes}
                      onChange={(e) => setManualVolumes(e.target.value)}
                      placeholder="0"
                      className="w-full bg-black/60 border border-white/15 text-emerald-400 text-sm font-bold p-1.5 rounded-lg focus:outline-none focus:border-emerald-500 text-center font-mono"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-[0.55rem] text-slate-400 uppercase tracking-wider block">
                      VPH Calculado
                    </span>
                    <span className="text-base font-black font-mono text-emerald-400">
                      {manualEntryVph()}{' '}
                      <span className="text-[0.6rem] text-slate-500 font-normal">VOL/H</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Botão de Gravar Manual */}
              <button
                type="button"
                onClick={handleDirectManualSubmit}
                disabled={!activeOperator || manualEntryHours <= 0}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 font-mono"
              >
                <CheckCircle2 size={15} />
                <span>Gravar Registo Manual ({manualEntryHours.toFixed(2)}h)</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* FORMULÁRIO DE FINALIZAÇÃO DO CRONÔMETRO (COM AJUSTE OPCIONAL) */}
        {/* ========================================================= */}
        {inputOpen && panelMode === 'cronometro' && (
          <div className="flex flex-col gap-4 mt-4 p-5 border border-emerald-500/40 bg-black/90 backdrop-blur-md rounded-xl shadow-2xl animate-fade-in font-mono">
            <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>Finalizar: {timerState.cronometro?.atividade}</span>
              </span>
              <span className="text-[0.62rem] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
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
              <span className="text-slate-400 text-[0.62rem] uppercase tracking-wider">
                Tempo Cronometrado:
              </span>
              <span className="text-white font-bold font-mono">
                {formatTime(timerState.cronometro?.segundos || 0)} ({((timerState.cronometro?.segundos || 0) / 3600).toFixed(2)}h)
              </span>
            </div>

            {/* OPCIONAL: AJUSTE MANUAL HORA DE INÍCIO E FINAL */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableManualAdjust}
                    onChange={(e) => setEnableManualAdjust(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-[0.65rem] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders size={13} className={enableManualAdjust ? 'text-emerald-400' : 'opacity-40'} />
                    <span>Ajuste manual de início e final (Opcional)</span>
                  </span>
                </label>

                {enableManualAdjust && (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const secs = timerState.cronometro?.segundos || 0;
                      const start = new Date(now.getTime() - secs * 1000);
                      setCustomStartTime(formatTimeToHHMM(start));
                      setCustomEndTime(formatTimeToHHMM(now));
                    }}
                    className="text-[0.55rem] text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer font-mono"
                    title="Restaurar horários originais calculados"
                  >
                    <RotateCcw size={11} />
                    <span>Restaurar</span>
                  </button>
                )}
              </div>

              {enableManualAdjust && (
                <div className="space-y-2.5 pt-2.5 border-t border-white/10 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[0.55rem] uppercase tracking-wider text-slate-400 block mb-1">
                        Hora Início
                      </label>
                      <input
                        type="time"
                        value={customStartTime}
                        onChange={(e) => setCustomStartTime(e.target.value)}
                        className="w-full bg-black/80 border border-white/15 text-white text-xs font-mono p-1.5 rounded-lg focus:outline-none focus:border-emerald-500 text-center font-bold"
                      />
                      <div className="flex justify-between gap-1.5 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomStartTime(adjustTimeMinutes(customStartTime, -5))}
                          className="flex-1 text-[0.52rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                        >
                          -5m
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomStartTime(adjustTimeMinutes(customStartTime, 5))}
                          className="flex-1 text-[0.52rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                        >
                          +5m
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[0.55rem] uppercase tracking-wider text-slate-400 block mb-1">
                        Hora Final
                      </label>
                      <input
                        type="time"
                        value={customEndTime}
                        onChange={(e) => setCustomEndTime(e.target.value)}
                        className="w-full bg-black/80 border border-white/15 text-white text-xs font-mono p-1.5 rounded-lg focus:outline-none focus:border-emerald-500 text-center font-bold"
                      />
                      <div className="flex justify-between gap-1.5 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomEndTime(adjustTimeMinutes(customEndTime, -5))}
                          className="flex-1 text-[0.52rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                        >
                          -5m
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomEndTime(adjustTimeMinutes(customEndTime, 5))}
                          className="flex-1 text-[0.52rem] py-1 bg-white/5 hover:bg-white/15 text-slate-300 rounded-md cursor-pointer transition-colors"
                        >
                          +5m
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Feedback de duração calculada */}
                  <div className="bg-black/60 p-2 rounded-lg border border-white/10 flex justify-between items-center text-[0.6rem]">
                    <span className="text-slate-400">Duração Ajustada:</span>
                    <span className="text-emerald-400 font-bold font-mono">
                      {liveManualDuration.formattedDuration} ({liveManualDuration.decimalHours.toFixed(2)}h)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* QTD Volumes (se atividade direta) */}
            {!isIndireta ? (
              <div className="flex gap-4 items-center bg-white/5 p-3 border border-white/10 rounded-xl">
                <div className="flex-1">
                  <label className="text-[0.58rem] uppercase tracking-wider text-slate-400 block mb-1">
                    QTD Volumes (Endereços)
                  </label>
                  <input
                    type="number"
                    value={inpVol}
                    onChange={(e) => setInpVol(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 text-emerald-400 text-sm font-bold focus:outline-none focus:border-emerald-500 p-1.5 rounded-lg text-center"
                    placeholder="0"
                  />
                </div>
                <div className="flex-1 text-center flex flex-col justify-end">
                  <p className="text-[0.55rem] text-slate-400 uppercase tracking-wider">
                    Projeção VPH
                  </p>
                  <p className="text-sm font-bold text-emerald-400">
                    {getProjecao()}{' '}
                    <span className="text-[0.55rem] text-slate-500">VOL/H</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[0.58rem] text-slate-500 tracking-wider uppercase text-center my-1">
                Nenhum volume é necessário para horas indiretas.
              </p>
            )}
            
            {/* BOTÕES GRAVAR / CANCELAR */}
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                onClick={() => {
                  const vols = isIndireta ? 0 : (parseInt(inpVol) || 0);
                  const customHrs = enableManualAdjust ? liveManualDuration.decimalHours : undefined;
                  const hIni = enableManualAdjust ? customStartTime : undefined;
                  const hFim = enableManualAdjust ? customEndTime : undefined;
                  onSaveTimer(activeOperator, vols, customHrs, hIni, hFim);
                }}
                disabled={!activeOperator || activeSessionHours <= 0}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-black py-3 text-xs font-bold tracking-wider uppercase hover:opacity-95 active:scale-[0.98] rounded-xl cursor-pointer disabled:opacity-30 shadow-lg shadow-emerald-500/25 font-mono"
              >
                GRAVAR REGISTO ({activeSessionHours.toFixed(2)}h)
              </button>
              <button
                onClick={onCancelTimer}
                className="border border-rose-500/30 text-rose-400 py-3 text-xs font-medium tracking-wider uppercase hover:bg-rose-500/10 rounded-xl cursor-pointer font-mono transition-colors"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )}
      </section>
      
    </div>
  );
}
