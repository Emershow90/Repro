import { useState, useEffect } from 'react';
import { AppTimerState } from '../types';
import { useSectorStore, VALID_SECTORS } from '../stores/sectorStore';

interface StopwatchPanelProps {
  timerState: AppTimerState;
  colabHistory: string[];
  inputOpen: boolean;
  onStartTimer: (activity: string, btnId: string, tipo: 'direta' | 'indireta') => void;
  onPauseTimer: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  onSaveTimer: (colab: string, volumes: number) => void;
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
  activeOperator,
  onActiveOperatorChange,
  apiUrl,
  onApiUrlChange
}: StopwatchPanelProps) {
  const [inpVol, setInpVol] = useState(timerState.rascunhoVol || '');
  const [selectedIndirectAct, setSelectedIndirectAct] = useState('Treinamentos / formações');

  const { activeSectorId, updateActiveSector } = useSectorStore();

  useEffect(() => {
    if (timerState.rascunhoVol) setInpVol(timerState.rascunhoVol);
  }, [timerState.rascunhoVol]);

  const formatTime = (secs: number) => {
    const hoursVal = Math.floor(secs / 3600);
    const minutesVal = Math.floor((secs % 3600) / 60);
    const secondsVal = secs % 60;
    
    const hStr = hoursVal < 10 ? `0${hoursVal}` : `${hoursVal}`;
    const mStr = minutesVal < 10 ? `0${minutesVal}` : `${minutesVal}`;
    const sStr = secondsVal < 10 ? `0${secondsVal}` : `${secondsVal}`;
    
    return `${hStr}:${mStr}:${sStr}`;
  };

  const getProjecao = () => {
    const qty = parseInt(inpVol) || 0;
    const hDec = timerState.cronometro?.segundos / 3600;
    if (hDec > 0 && qty > 0) {
      return (qty / hDec).toFixed(1);
    }
    return '0.0';
  };

  const isIndireta = timerState.cronometro?.tipo === 'indireta';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* PAINEL DE CONTROLE / INFORMAÇÕES */}
      <section className="border-panel p-6 rounded-sm flex flex-col justify-between space-y-4">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/40 pb-2 opacity-60 mb-4">
            [1. OPERADOR ATIVO]
          </h2>
          <div>
            <label className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 block mb-1">
              Nome do Colaborador
            </label>
            <input
              type="text"
              value={activeOperator}
              onChange={(e) => onActiveOperatorChange(e.target.value)}
              list="colab-datalist-global"
              className="w-full bg-terminal-bg border border-terminal-border text-terminal-accent text-sm font-bold focus:outline-none focus:border-terminal-accent p-2 rounded-sm uppercase"
              placeholder="Digite o nome..."
            />
            <datalist id="colab-datalist-global">
              {colabHistory.map((col, idx) => (
                <option key={idx} value={col} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/40 pb-2 opacity-60 mb-4 mt-6">
            [2. LIGAÇÃO À PLANILHA]
          </h2>
          <div>
            <label className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 block mb-1">
              Link de Integração (API URL - Aba: Controle de horas - Repro)
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => onApiUrlChange(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border text-terminal-accent text-xs font-mono focus:outline-none focus:border-terminal-accent p-2 rounded-sm"
              placeholder="Colar link da sua planilha..."
            />
            <p className="text-[0.45rem] text-terminal-text opacity-30 leading-normal mt-1">
              Sincronização em tempo real com a aba 'Controle de horas - Repro'.
            </p>
          </div>
        </div>
      </section>

      {/* CRONÔMETRO DE ATIVIDADE */}
      <section className="border-panel p-6 rounded-sm flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
              [3. REGISTO DE ATIVIDADE]
            </h2>
            {timerState.cronometro?.ativo && (
              <span className={`text-[0.5rem] px-1.5 py-0.5 rounded-sm font-bold pulse-dot ${
                isIndireta 
                  ? 'bg-warning/10 border border-warning text-warning'
                  : 'bg-terminal-accent/10 border border-terminal-accent text-terminal-accent'
              }`}>
                ATIVO: {timerState.cronometro?.atividade} [{formatTime(timerState.cronometro?.segundos)}]
              </span>
            )}
          </div>

          {/* SELEÇÃO DO SETOR (87, 88, 89, 90) */}
          <div className="mb-4 bg-terminal-bg/60 p-3 border border-terminal-border/50 rounded-sm">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[0.55rem] uppercase tracking-widest text-terminal-accent font-bold">
                Setor de Operação (Controle Repro)
              </label>
              <span className="text-[0.5rem] font-mono text-white/60">
                Ativo: Setor {activeSectorId}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {VALID_SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => updateActiveSector(sec)}
                  className={`py-1.5 text-xs font-bold font-mono uppercase rounded-sm border transition-all cursor-pointer ${
                    activeSectorId === sec
                      ? 'bg-terminal-accent text-terminal-bg border-terminal-accent font-black shadow-sm'
                      : 'bg-terminal-panel/30 border-terminal-border/60 text-terminal-text hover:border-terminal-accent/50 hover:text-white'
                  }`}
                >
                  Setor {sec}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 block mb-2">
                Atividades Diretas (Produção - Setor {activeSectorId})
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onStartTimer('REPRO', 'repro', 'direta')}
                  className={`btn-term py-2.5 text-[0.6rem] font-bold tracking-widest uppercase rounded-sm cursor-pointer ${
                    timerState.cronometro?.botaoId === 'repro' && !isIndireta ? 'btn-term-active' : ''
                  }`}
                >
                  REPRO
                </button>
                <button
                  onClick={() => onStartTimer('ELOG', 'elog', 'direta')}
                  className={`btn-term py-2.5 text-[0.6rem] font-bold tracking-widest uppercase rounded-sm cursor-pointer ${
                    timerState.cronometro?.botaoId === 'elog' && !isIndireta ? 'btn-term-active' : ''
                  }`}
                >
                  ELOG
                </button>
                <button
                  onClick={() => onStartTimer('DIVERSOS', 'pendencias', 'direta')}
                  className={`btn-term py-2.5 text-[0.6rem] font-bold tracking-widest uppercase rounded-sm cursor-pointer ${
                    timerState.cronometro?.botaoId === 'pendencias' && !isIndireta ? 'btn-term-active' : ''
                  }`}
                >
                  DIV
                </button>
              </div>
            </div>

            <div>
              <p className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 block mb-2 mt-4">
                Atividades Indiretas
              </p>
              <div className="flex gap-2">
                <select
                  value={selectedIndirectAct}
                  onChange={(e) => setSelectedIndirectAct(e.target.value)}
                  className="flex-1 text-xs p-2 rounded-sm text-white select border border-terminal-border/60 bg-[#111318]"
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
                  className={`btn-term px-4 text-[0.6rem] font-bold tracking-widest uppercase rounded-sm cursor-pointer ${
                    isIndireta ? 'bg-warning text-black' : 'border-warning text-warning hover:bg-warning/5'
                  }`}
                >
                  INICIAR
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-terminal-border/20 pt-4 mt-6">
            <button
              onClick={onPauseTimer}
              disabled={!timerState.cronometro?.ativo}
              className="btn-term py-2 text-[0.6rem] font-bold tracking-widest uppercase text-warning border-warning/10 hover:border-warning/40 hover:bg-warning/5 rounded-sm cursor-pointer disabled:opacity-30"
            >
              PAUSAR
            </button>
            <button
              onClick={onStopTimer}
              disabled={timerState.cronometro?.segundos === 0}
              className="btn-term py-2 text-[0.6rem] font-bold tracking-widest uppercase text-white border-terminal-border hover:border-terminal-accent/40 rounded-sm cursor-pointer disabled:opacity-30"
            >
              FINALIZAR
            </button>
          </div>
        </div>

        {/* Formulário de finalização */}
        {inputOpen && (
          <div className="flex flex-col gap-4 mt-4 p-4 border border-terminal-border bg-terminal-bg/40 rounded-sm">
            {!activeOperator && (
              <p className="text-xs text-danger uppercase font-bold tracking-wider mb-2">
                ⚠️ Defina um operador ativo primeiro!
              </p>
            )}

            <div className="bg-terminal-bg/70 p-2 border border-terminal-border/40 rounded-sm flex justify-between items-center text-xs">
              <span className="text-terminal-text opacity-60 text-[0.6rem] uppercase tracking-wider">Setor do Registo:</span>
              <span className="text-terminal-accent font-mono font-bold">SETOR {activeSectorId}</span>
            </div>

            {!isIndireta ? (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 block mb-0.5">
                    QTD Volumes (Endereços)
                  </label>
                  <input
                    type="number"
                    value={inpVol}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInpVol(val);
                    }}
                    className="w-full bg-transparent border-b border-terminal-border text-terminal-accent text-sm font-bold focus:outline-none focus:border-terminal-accent py-0.5 text-center"
                    placeholder="0"
                  />
                </div>
                <div className="flex-1 text-center flex flex-col justify-end">
                  <p className="text-[0.5rem] text-terminal-text opacity-40 uppercase tracking-widest">
                    Projeção
                  </p>
                  <p className="text-sm font-bold text-terminal-accent">
                    {getProjecao()}{' '}
                    <span className="text-[0.5rem] text-terminal-text opacity-40">VOL/H</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[0.5rem] text-terminal-text opacity-40 tracking-widest uppercase text-center my-2">
                Nenhum volume é necessário para horas indiretas.
              </p>
            )}
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => onSaveTimer(activeOperator, isIndireta ? 0 : (parseInt(inpVol) || 0))}
                disabled={!activeOperator}
                className="bg-terminal-accent text-terminal-bg py-2 text-[0.6rem] font-bold tracking-widest uppercase hover:opacity-90 rounded-sm cursor-pointer disabled:opacity-30"
              >
                GRAVAR
              </button>
              <button
                onClick={onCancelTimer}
                className="btn-term border-danger/30 text-danger/80 py-2 text-[0.55rem] font-medium tracking-widest uppercase hover:border-danger hover:bg-danger/5 rounded-sm cursor-pointer"
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
