import React, { useState, useRef, useEffect } from 'react';
import { ScanLine, Box, AlertTriangle, CheckCircle, ArrowRight, Save, AlertOctagon, User, Coffee, Zap, Layers, Copy } from 'lucide-react';
import { Log } from '../../types/index';
import { saveLog, saveAuditLog, enqueueOperationalEvent } from '../../services/dbLocal';
import { useCollaboratorStore } from '../../stores/collaboratorStore';
import { useSectorStore } from '../../stores/sectorStore';
import { useRuleStore } from '../../stores/ruleStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUIStore } from '../../stores/uiStore';
import { formatDateToBR } from '../../utils/dateUtils';
import { CtnTraceabilityView } from '../../components/CtnTraceabilityView';

export default function ReabastecimentoGuiado() {
  const { currentUser, activeOperator } = useCollaboratorStore();
  const { activeSectorId } = useSectorStore();
  const { rules: regras, loadRulesFromDb } = useRuleStore();
  const checkCollision = usePresenceStore(state => state.checkCollision);
  const { addToast } = useUIStore();

  // Estados do Fluxo
  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4>(1);
  const [scanInput, setScanInput] = useState('');
  const [modalGenealogiaCtn, setModalGenealogiaCtn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [dados, setDados] = useState({
    endereco: '',
    ctnPai: '',
    caixaInicio: '',
    caixaFim: '',
    artigo: '',
    totalCaixas: 0,
    quantidadePecas: 0,
    scannedArticles: [] as string[]
  });

  // Estados de Exceção e Alertas
  const [alertaFuro, setAlertaFuro] = useState<string | null>(null);
  const [colisaoDetectada, setColisaoDetectada] = useState<{ operador: string; endereco: string } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseTimeLeft, setPauseTimeLeft] = useState(300);

  // Carrega regras no mount
  useEffect(() => {
    loadRulesFromDb();
  }, [loadRulesFromDb]);

  // Mantém o foco sempre no input invisível para leitura contínua com o Zebra (Scanner Focus)
  useEffect(() => {
    const focusTimer = setInterval(() => {
      if (!isPaused && !colisaoDetectada && inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    return () => clearInterval(focusTimer);
  }, [etapa, isPaused, colisaoDetectada]);

  // Gestão de Pausa (Pomodoro/EPH)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPaused && pauseTimeLeft > 0) {
      timer = setInterval(() => setPauseTimeLeft(prev => prev - 1), 1000);
    } else if (pauseTimeLeft === 0 && isPaused) {
      playSound('success');
      setIsPaused(false);
      setPauseTimeLeft(300);
    }
    return () => clearInterval(timer);
  }, [isPaused, pauseTimeLeft]);

  const playSound = (type: 'success' | 'error') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      } else {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      console.error('Audio falhou', e);
    }
  };

  const processarBipe = async (valor: string) => {
    const bipe = valor.trim().toUpperCase();
    if (!bipe) return;

    setAlertaFuro(null);

    switch (etapa) {
      case 1: // Endereço com verificação de Colisão
        const conflito = checkCollision(bipe, activeOperator || 'Operador_X');
        if (conflito) {
          playSound('error');
          setColisaoDetectada({ operador: conflito.operador, endereco: bipe });
        } else {
          setDados(prev => ({ ...prev, endereco: bipe }));
          playSound('success');
          setEtapa(2);
        }
        break;
      
      case 2: // CTN Pai (Palete)
        setDados(prev => ({ ...prev, ctnPai: bipe }));
        playSound('success');
        setEtapa(3);
        break;

      case 3: // COMBO DE 3 BIPES (Lote Pai -> Lote Filho -> Artigo)
        if (!dados.caixaInicio) {
          setDados(prev => ({ ...prev, caixaInicio: bipe }));
          playSound('success');
        } else if (!dados.caixaFim) {
          setDados(prev => ({ ...prev, caixaFim: bipe }));
          playSound('success');
        } else if (!dados.artigo) {
          if (dados.scannedArticles.includes(bipe)) {
            playSound('error');
            addToast("ALERTA: Artigo já bipado neste palete!", "var(--color-danger)");
            return;
          }
          await validarCombo(dados.caixaInicio, dados.caixaFim, bipe);
        }
        break;
    }
    setScanInput('');
  };

  const validarCombo = async (inicio: string, fim: string, artigoBipado: string) => {
    // 1. Busca a regra de vinculação no banco local
    const regraNormal = regras.find(r => r.contenantPere === dados.ctnPai && r.artigo === artigoBipado);
    const regraInvertida = regras.find(r => r.contenantFils === dados.ctnPai && r.contenantPere === inicio);

    if (regraInvertida) {
      playSound('error');
      await saveAuditLog({
        id: `audit_${Date.now()}`, timestamp: Date.now(), tipo: 'INVERSAO_ETIQUETA',
        setor: activeSectorId || '87', rua: dados.endereco.substring(0,4), operador: activeOperator || 'DESCONHECIDO',
        contexto: { ctnPaiBipado: dados.ctnPai, ctnFilhoBipado: inicio, artigoEsperado: regraInvertida.artigo },
        justificativa: '', synced: false
      });
      addToast("INVERSÃO DETECTADA: Você bipou a Caixa no campo do Palete. Leia na ordem correta.", "var(--color-danger)");
      setDados(prev => ({ ...prev, caixaInicio: '', caixaFim: '', artigo: '' }));
      return;
    }

    if (!regraNormal) {
      playSound('error');
      await saveAuditLog({
        id: `audit_${Date.now()}`, timestamp: Date.now(), tipo: 'VINCULACAO_INVALIDA',
        setor: activeSectorId || '87', rua: dados.endereco.substring(0,4), operador: activeOperator || 'DESCONHECIDO',
        contexto: { ctnPaiBipado: dados.ctnPai, ctnFilhoBipado: inicio },
        justificativa: '', synced: false
      });
      addToast("ERRO: O Artigo lido não pertence a este Palete Pai!", "var(--color-danger)");
      setDados(prev => ({ ...prev, caixaInicio: '', caixaFim: '', artigo: '' }));
      return;
    }

    // 2. Extração Numérica e Cálculo de Delta
    const numInicio = parseInt(inicio.replace(/\D/g, ''), 10);
    const numFim = parseInt(fim.replace(/\D/g, ''), 10);

    if (isNaN(numInicio) || isNaN(numFim) || numFim < numInicio) {
      playSound('error');
      addToast("ERRO DE LEITURA LOTE: Verifique a sequência das caixas.", "var(--color-danger)");
      setDados(prev => ({ ...prev, caixaInicio: '', caixaFim: '', artigo: '' }));
      return;
    }

    const totalCaixasCalc = Math.max(1, (numFim - numInicio) + 1);
    const pecasTotal = totalCaixasCalc * (regraNormal.quantidadePadrao || 1);
    const limiteSeguranca = (regraNormal as any).limiteCaixas || 50; 

    if (totalCaixasCalc > limiteSeguranca) {
      playSound('error');
      setAlertaFuro(`ALERTA DE FURO: O intervalo lido (${totalCaixasCalc} cx) excede o limite esperado para este artigo (${limiteSeguranca}). Verifique o lote físico.`);
    } else {
      playSound('success');
    }

    setDados(prev => ({ 
      ...prev, 
      artigo: artigoBipado, 
      totalCaixas: totalCaixasCalc, 
      quantidadePecas: pecasTotal,
      scannedArticles: [...prev.scannedArticles, artigoBipado] 
    }));
    setEtapa(4);
  };

  const handleConfirmar = async () => {
    // Grava UM ÚNICO LOG consolidado respeitando a arquitetura VPH
    const novoLog: Log = {
      id: Date.now(),
      data: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      timestamp: Date.now(),
      atividade: 'REPRO',
      colaborador: activeOperator || currentUser || 'OPERADOR',
      setor: activeSectorId || '87',
      rua: dados.endereco,
      artigo: dados.artigo,
      contenantPai: dados.ctnPai,
      observacoes: `Lote: ${dados.caixaInicio} a ${dados.caixaFim}`,
      volumes: dados.totalCaixas,
      horas: 0.05,
      vph: "0",
      synced: false,
      tipo: 'direta'
    };

    await saveLog(novoLog);
    
    // Atualiza Torre de Controle Realtime
    await enqueueOperationalEvent({
        id: `evt_end_${Date.now()}`, timestamp: Date.now(), tipo: 'ENDERECO_CONCLUIDO',
        sessionId: 'session_offline_1', setor: activeSectorId || 'G', rua: dados.endereco.substring(0,4) || 'UNK',
        enderecosDelta: 1, volumesDelta: dados.totalCaixas, status: 'synced',
        endereco: dados.endereco, justification: `Fluxo Lote: ${dados.caixaInicio}-${dados.caixaFim} | Art ${dados.artigo}`
    } as any);

    addToast(`${dados.totalCaixas} caixas reabastecidas com sucesso!`, "var(--color-success)");
    
    // Reseta ciclo mantendo a rua e o palete pai, mas mantém artigos bipados para controle de duplicidade
    setDados(prev => ({ 
      ...prev,
      caixaInicio: '', 
      caixaFim: '', 
      artigo: '', 
      totalCaixas: 0, 
      quantidadePecas: 0 
    }));
    setEtapa(3); // Volta para a etapa de combo (bipar caixas)
    setAlertaFuro(null);
  };

  const resetarOperacao = () => {
    setDados({ endereco: '', ctnPai: '', caixaInicio: '', caixaFim: '', artigo: '', totalCaixas: 0, quantidadePecas: 0, scannedArticles: [] });
    setEtapa(1);
    setAlertaFuro(null);
  };

  // Renderização da Pausa
  if (isPaused) {
    const minutes = Math.floor(pauseTimeLeft / 60);
    const seconds = pauseTimeLeft % 60;
    return (
      <div className="flex flex-col h-full p-4 gap-4 bg-[#15181e] items-center justify-center rounded-2xl border-panel border border-amber-500/20">
        <Coffee size={48} className="text-amber-500 mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-amber-400 font-mono">Pausa Operacional</h2>
        <p className="text-sm text-slate-400 font-mono">Respire e descanse a visão.</p>
        <div className="text-5xl font-mono font-black text-amber-500 my-6 tracking-widest">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <button 
          onClick={() => { setIsPaused(false); setPauseTimeLeft(300); }}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all"
        >
          Retomar Foco
        </button>
      </div>
    );
  }

  return (
    <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden bg-[#15181e] min-h-[500px] flex flex-col">
      {/* Header Visual */}
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Box size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Reabastecimento Guiado
            </h2>
            <p className="text-[10px] text-emerald-400/70 font-mono flex items-center gap-1">
              <Zap size={10} /> Scanner Focus Ativo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => setModalGenealogiaCtn(dados.ctnPai || '')}
            className="p-2 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors rounded-lg text-purple-300 flex items-center gap-1.5 text-xs font-bold font-mono cursor-pointer"
            title="Consultar Genealogia e Caixas do Palete"
          >
            <Layers size={14}/> RASTREAR CTN
          </button>
          <button 
            onClick={resetarOperacao}
            className="p-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors rounded-lg text-rose-400 flex items-center gap-1.5 text-xs font-bold font-mono"
          >
            <AlertOctagon size={14}/> TROCAR LOCAL
          </button>
          <button 
            onClick={() => setIsPaused(true)}
            className="p-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors rounded-lg text-amber-400 flex items-center gap-1.5 text-xs font-bold font-mono"
          >
            <Coffee size={14}/> PAUSA
          </button>
        </div>
      </div>

      {/* Input Oculto de Captura Rápida (Scanner Focus) */}
      <input
        ref={inputRef}
        type="text"
        className="absolute opacity-0 w-1 h-1 -z-10"
        value={scanInput}
        onChange={e => setScanInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') processarBipe(scanInput);
        }}
        autoFocus
      />

      {/* TELA DE INTERCEPTAÇÃO: COLISÃO DETECTADA */}
      {colisaoDetectada ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 shadow-xl w-full max-w-md mx-auto my-auto backdrop-blur-md">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-amber-500/20 rounded-full border border-amber-500/50">
              <AlertOctagon className="w-10 h-10 text-amber-400 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-amber-400 font-mono uppercase">Rua Ocupada!</h3>
            <p className="text-xs text-amber-200/70 font-mono">
              O sistema detectou que outro operador está processando o endereço <strong className="text-white">{colisaoDetectada.endereco}</strong> neste exato momento.
            </p>
            
            <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-lg border border-amber-500/20 w-full justify-center">
              <User className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-amber-400 font-bold">{colisaoDetectada.operador}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-4">
              <button 
                onClick={() => { setColisaoDetectada(null); setScanInput(''); }}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-colors uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  setColisaoDetectada(null);
                  setDados(prev => ({ ...prev, endereco: colisaoDetectada.endereco }));
                  setEtapa(2);
                }}
                className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
              >
                Assumir Risco <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
          {/* Painel de Instruções (Lado Esquerdo) */}
          <div className="space-y-3">
            <div className={`p-4 rounded-xl border transition-all ${etapa === 1 ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(52,211,153,0.1)]' : 'bg-white/5 border-white/10 opacity-60'}`}>
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xs font-bold text-emerald-400 font-mono uppercase">1. Endereço</h3>
                {etapa === 1 && <ScanLine size={14} className="text-emerald-400 animate-pulse" />}
              </div>
              <p className="text-lg font-mono text-white tracking-widest">{dados.endereco || 'Aguardando bipe...'}</p>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${etapa === 2 ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(52,211,153,0.1)]' : 'bg-white/5 border-white/10 opacity-60'}`}>
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xs font-bold text-emerald-400 font-mono uppercase">2. CTN Pai (Palete)</h3>
                {etapa === 2 && <ScanLine size={14} className="text-emerald-400 animate-pulse" />}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-lg font-mono text-white tracking-widest">{dados.ctnPai || 'Aguardando bipe...'}</p>
                {dados.ctnPai && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setModalGenealogiaCtn(dados.ctnPai); }}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-mono underline font-bold cursor-pointer"
                  >
                    Ver Genealogia
                  </button>
                )}
              </div>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${etapa === 3 ? 'bg-emerald-500/10 border-emerald-400 border-2 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'bg-white/5 border-white/10 opacity-60'}`}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold text-emerald-400 font-mono uppercase">3. Leitura Rápida (Combo)</h3>
                {etapa === 3 && <ScanLine size={18} className="text-emerald-400 animate-pulse" />}
              </div>
              
              <div className="space-y-2 text-xs font-mono tracking-widest">
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className={dados.caixaInicio ? 'text-emerald-500' : 'text-slate-600'} />
                  <span className={dados.caixaInicio ? 'text-white' : 'text-slate-500'}>
                    {dados.caixaInicio ? `Início: ${dados.caixaInicio}` : 'Bipe a 1ª Caixa...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className={dados.caixaFim ? 'text-emerald-500' : 'text-slate-600'} />
                  <span className={dados.caixaFim ? 'text-white' : 'text-slate-500'}>
                    {dados.caixaFim ? `Fim: ${dados.caixaFim}` : 'Bipe a Última Caixa...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className={dados.artigo ? 'text-emerald-500' : 'text-slate-600'} />
                  <span className={dados.artigo ? 'text-white' : 'text-slate-500'}>
                    {dados.artigo ? `Artigo: ${dados.artigo}` : 'Bipe o Artigo...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Painel de Confirmação (Lado Direito) */}
          <div className="h-full flex flex-col justify-center">
            {etapa === 4 ? (
              <div className="bg-slate-900/80 border border-emerald-500/30 p-6 rounded-2xl text-center space-y-5 shadow-2xl">
                <CheckCircle size={48} className="text-emerald-400 mx-auto" />
                
                <div>
                  <p className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-1">Volume Calculado</p>
                  <h3 className="text-4xl font-black text-white font-mono">{dados.totalCaixas} <span className="text-lg text-emerald-500">CXS</span></h3>
                  <div className="flex items-center gap-2 justify-center mt-1">
                    <p className="text-emerald-400/80 text-xs font-mono">Artigo: {dados.artigo}</p>
                    <button 
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(dados.artigo);
                        addToast("Artigo copiado!", "var(--color-success)");
                      }}
                      className="p-1 text-slate-500 hover:text-white transition-colors"
                      title="Copiar código do artigo"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <p className="text-emerald-400/80 text-xs font-mono mt-1">Total: {dados.quantidadePecas} peças</p>
                </div>

                {alertaFuro && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg flex items-start gap-3 text-left">
                    <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-rose-300 font-mono leading-relaxed">{alertaFuro}</p>
                  </div>
                )}

                <button 
                  onClick={handleConfirmar}
                  className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${alertaFuro ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'}`}
                >
                  <Save size={16} />
                  {alertaFuro ? 'Assumir Risco e Gravar' : 'Confirmar Lote'}
                </button>
                
                <button 
                  onClick={() => { setDados({ ...dados, caixaInicio: '', caixaFim: '', artigo: '' }); setEtapa(3); setAlertaFuro(null); }}
                  className="text-[10px] text-slate-400 hover:text-white uppercase font-mono tracking-widest transition-colors"
                >
                  Cancelar e Ler Novamente
                </button>
              </div>
            ) : (
              <div className="h-full border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-slate-500 bg-black/20 opacity-50 p-6 text-center">
                <ScanLine size={40} className="mb-4 opacity-50" />
                <p className="font-mono text-xs uppercase tracking-widest">Aguardando Conclusão<br/>do Lote...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {modalGenealogiaCtn !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <CtnTraceabilityView 
            initialCtn={modalGenealogiaCtn} 
            isModal={true}
            onClose={() => setModalGenealogiaCtn(null)}
            onAddToast={addToast}
          />
        </div>
      )}
    </section>
  );
}