import React, { useState, useEffect } from 'react';
import { enqueueOperationalEvent } from '../dbLocal';
import { Coffee, Zap, AlertOctagon, ArrowRight, User } from 'lucide-react';
import { useRuleStore } from '../stores/ruleStore';
import { usePresenceStore } from '../stores/presenceStore';


export const ReabastecimentoGuiado: React.FC = () => {
  const { rules: regras, loadRulesFromDb } = useRuleStore();
  const [etapa, setEtapa] = useState(0); 
  const [input, setInput] = useState('');
  
  const [currentData, setCurrentData] = useState({
    endereco: '',
    ctnPere: '',
    ctnFils: '',
    artigo: '',
    quantidade: ''
  });

  const [colisaoDetectada, setColisaoDetectada] = useState<{ operador: string; endereco: string } | null>(null);
  const checkCollision = usePresenceStore(state => state.checkCollision);


  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
  const [isPaused, setIsPaused] = useState(false);
  const [pauseTimeLeft, setPauseTimeLeft] = useState(300); // 5 minutes

  useEffect(() => {
    loadRulesFromDb();
  }, [loadRulesFromDb]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPaused && pauseTimeLeft > 0) {
      timer = setInterval(() => {
        setPauseTimeLeft(prev => prev - 1);
      }, 1000);
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

  const handleNext = async () => {
    if (isPaused) return;
    if (!input.trim()) return;

    if (etapa === 0 && !colisaoDetectada) {
      // 1. Verifica no Zustand se o Supabase avisou de alguém na rua
      const conflito = checkCollision(input.trim(), 'Operador_X'); // Dummy user for now, in a real app this would be the logged in user

      if (conflito) {
        playSound('error');
        setColisaoDetectada({ operador: conflito.operador, endereco: input.trim() });
        return; // Interrompe o fluxo normal
      }
    }

    avancarParaProximaEtapa(input.trim());
  };

  const avancarParaProximaEtapa = async (inputValue: string) => {
    setColisaoDetectada(null);
    const newData = { ...currentData };

    if (etapa === 0) newData.endereco = inputValue;
    else if (etapa === 1) newData.ctnPere = inputValue;
    else if (etapa === 2) newData.ctnFils = inputValue;
    else if (etapa === 3) newData.artigo = inputValue;
    else if (etapa === 4) newData.quantidade = inputValue;

    if (etapa < 4) {
      setEtapa(prev => prev + 1);
      setCurrentData(newData);
      
      // Auto-preencher a quantidade quando ler o artigo (Etapa 3 para Etapa 4 - zero index)
      if (etapa === 3) {
        // Encontrar regra pra pegar qtd padrão, ou sugerir hardcoded se n achar (simulando 48)
        const rule = regras.find(r => 
          r.enderecoPere === newData.endereco && 
          r.contenantPere === newData.ctnPere && 
          r.contenantFils === newData.ctnFils && 
          r.artigo === newData.artigo
        );
        const qtdSugerida = rule?.quantidadePadrao ? String(rule.quantidadePadrao) : "48";
        setInput(qtdSugerida);
      } else {
        setInput('');
      }
      
      playSound('success');
      setFeedback({ type: 'success', message: 'Etapa concluída. Muito bem!' });
      setTimeout(() => setFeedback({ type: '', message: '' }), 1500);
      
      // If we just advanced from address, log pending task start for realtime
      if (etapa === 0) {
        const startEvent = {
          id: `evt_start_${Date.now()}`,
          timestamp: Date.now(),
          tipo: 'INICIAR_TAREFA',
          sessionId: 'session_offline_1',
          setor: 'G',
          rua: newData.endereco.substring(0,4) || 'UNK',
          enderecosDelta: 0,
          volumesDelta: 0,
          status: 'pending',
          colaborador: 'Operador_X',
          endereco: newData.endereco,
          justification: 'Iniciou reabastecimento'
        };
        await enqueueOperationalEvent(startEvent as any);
      }
    } else {
      const qtdInput = parseInt(newData.quantidade, 10);
      
      // Validação local contra as regras
      const rule = regras.find(r => 
        r.enderecoPere === newData.endereco && 
        r.contenantPere === newData.ctnPere && 
        r.contenantFils === newData.ctnFils && 
        r.artigo === newData.artigo
      );

      let isDivergent = false;
      if (rule && rule.quantidadePadrao !== qtdInput) {
        isDivergent = true;
      }

      if (isDivergent) {
        playSound('error');
        setFeedback({ type: 'error', message: `Divergência: O esperado era ${rule?.quantidadePadrao}. Tudo bem. Vamos corrigir juntos.` });
        
        const event = {
            id: `evt_val_${Date.now()}`,
            timestamp: Date.now(),
            tipo: 'VALIDACAO_QUANTIDADE',
            sessionId: 'session_offline_1',
            setor: 'G', 
            rua: newData.endereco.substring(0,4) || 'UNK',
            enderecosDelta: 0,
            volumesDelta: 0,
            justification: `Divergência Art ${newData.artigo}. Lida: ${qtdInput}, Esperada: ${rule?.quantidadePadrao}`
        };
        await enqueueOperationalEvent(event as any);
        return; // Permite o usuário corrigir o input de quantidade
      } else { 
         playSound('success');
         setFeedback({ type: 'success', message: 'Endereço concluído. Excelente trabalho!' });
         setTimeout(() => setFeedback({ type: '', message: '' }), 2500);

         const event = {
            id: `evt_end_${Date.now()}`,
            timestamp: Date.now(),
            tipo: 'ENDERECO_CONCLUIDO',
            sessionId: 'session_offline_1',
            setor: 'G', 
            rua: newData.endereco.substring(0,4) || 'UNK',
            enderecosDelta: 1,
            volumesDelta: qtdInput || 0,
            status: 'synced', // Tells realtime that this address is done
            endereco: newData.endereco,
            justification: `Fluxo Sequencial: End ${newData.endereco} | Art ${newData.artigo}`
        };
        await enqueueOperationalEvent(event as any);
         
        // O PULO DO GATO: Modo Desmembramento
        setEtapa(2);
        setCurrentData(prev => ({ ...prev, ctnFils: '', artigo: '', quantidade: '' }));
        setInput('');
      }
    }
  };

  const labels = ['Endereço', 'Contenant Pai', 'Contenant Filho', 'Artigo', 'Quantidade'];

  if (isPaused) {
    const minutes = Math.floor(pauseTimeLeft / 60);
    const seconds = pauseTimeLeft % 60;
    return (
      <div className="flex flex-col h-full p-4 gap-4 bg-slate-50 items-center justify-center">
        <Coffee size={48} className="text-amber-600 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Pausa Programada</h2>
        <p className="text-lg text-slate-600">Respire, descanse e beba água.</p>
        <div className="text-4xl font-mono font-black text-amber-600 my-6">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <button 
          onClick={() => {
            setIsPaused(false);
            setPauseTimeLeft(300);
          }}
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg"
        >
          Retomar Foco
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 bg-slate-50">
      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Zap size={20} className="text-blue-600" />
          Foco Guiado
        </h2>
        <div className="flex gap-2">
            <button 
              onClick={() => setIsPaused(true)}
              className="p-2 bg-amber-100 hover:bg-amber-200 transition-colors rounded text-amber-800 flex items-center gap-1 text-sm font-bold"
            >
              <Coffee size={16}/> Pausa
            </button>
        </div>
      </div>
      
      {/* TELA DE INTERCEPTAÇÃO: COLISÃO DETECTADA */}
      {colisaoDetectada && (
        <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-6 shadow-xl mb-6 w-full max-w-md mx-auto">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-amber-100 rounded-full">
              <AlertOctagon className="w-12 h-12 text-amber-600" />
            </div>
            <h3 className="text-2xl font-bold text-amber-700">Rua Ocupada!</h3>
            <p className="text-sm text-amber-900">
              O sistema detectou que outro operador está processando o endereço <strong className="font-mono text-black">{colisaoDetectada.endereco}</strong> neste exato momento.
            </p>
            
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-md border border-amber-200 w-full justify-center">
              <User className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-amber-700 font-bold">{colisaoDetectada.operador}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-4">
              <button 
                onClick={() => {
                  setColisaoDetectada(null);
                  setInput('');
                }}
                className="px-4 py-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm font-bold text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => avancarParaProximaEtapa(colisaoDetectada.endereco)}
                className="px-4 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors"
              >
                Assumir Risco <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!colisaoDetectada && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-md mx-auto w-full">
          
          {/* HEADER DE CONTEXTO (Fica visível a partir da etapa 3 para reduzir carga de memória) */}
          {etapa >= 2 && (
            <div className="mb-2 p-3 bg-white border border-slate-200 rounded-lg flex justify-between items-center w-full shadow-sm">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest">Endereço / Pai</div>
                <div className="font-mono text-slate-700 font-bold">{currentData.endereco} / {currentData.ctnPere}</div>
              </div>
              <button 
                onClick={() => {
                  setEtapa(0);
                  setCurrentData({ endereco: '', ctnPere: '', ctnFils: '', artigo: '', quantidade: '' });
                  setInput('');
                }}
                className="flex items-center gap-1 text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors font-bold"
              >
                Trocar Palete
              </button>
            </div>
          )}

          {feedback.message && (
            <div className={`p-4 rounded-xl text-center w-full font-bold ${feedback.type === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {feedback.message}
            </div>
          )}

        <div className="text-center w-full">
            <p className="text-sm text-slate-500 uppercase tracking-wider mb-2">Etapa {etapa + 1} de 5</p>
            <h3 className="text-3xl font-bold text-slate-900 mb-4">{labels[etapa]}</h3>
        </div>
        
        <input 
            type={etapa === 4 ? 'number' : 'text'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNext();
            }}
            autoFocus
            className="w-full text-center text-3xl p-6 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all"
            placeholder={`Inserir ${labels[etapa]}`}
        />

        <button 
            onClick={handleNext}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-bold rounded-xl text-lg shadow-lg"
        >
            Confirmar e Avançar
        </button>
        </div>
      )}
    </div>
  );
};

export default ReabastecimentoGuiado;

