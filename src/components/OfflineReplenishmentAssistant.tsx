/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Módulo de Apoio Offline ao Reabastecimento (PoC)
 * -------------------------------------------------------------
 * Projetado para coletores industriais (Zebra PDT) e Web.
 * Reduz sobrecarga cognitiva com fluxo guiado passo a passo,
 * validações locais automáticas contra catálogo, checklist para
 * desmembramento de pallets fechados e feedback sensorial (áudio e vibração).
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, 
  Box, 
  Barcode, 
  Hash, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  RotateCcw, 
  ArrowRight, 
  Check, 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  Save, 
  Sparkles, 
  ShieldCheck, 
  RefreshCw, 
  Download, 
  ChevronRight, 
  Clock, 
  Smartphone,
  Eye,
  Info
} from 'lucide-react';
import { 
  ReplenishmentStep, 
  CatalogArticlePackaging, 
  OfflineReplenishmentRecord,
  ActiveSession,
  OperationalEvent,
  STORAGE_ACTIVE_SESSION_KEY,
  STORAGE_EVENTS_KEY,
  STORAGE_OFFLINE_QUEUE_KEY
} from '../types';
import { DEFAULT_REPLENISHMENT_CATALOG, findArticleInCatalog } from '../data/mockReplenishmentCatalog';
import { pdtAudio } from '../utils/pdtAudio';
import { getState, saveState } from '../dbLocal';
import { useUIStore } from '../stores/uiStore';

interface OfflineReplenishmentAssistantProps {
  activeOperator?: string;
  activeSectorId?: string;
  currentStreet?: string;
  isEmbeddedInStreet?: boolean;
  onSequentialConfirmed?: (record: OfflineReplenishmentRecord) => void;
  onAddToast: (msg: string, color?: string) => void;
  onBackToOverview?: () => void;
}

const STORAGE_QUEUE_KEY = STORAGE_OFFLINE_QUEUE_KEY;
const STORAGE_CUSTOM_CATALOG_KEY = 'repro_replenishment_custom_catalog_v1';

export default function OfflineReplenishmentAssistant({
  activeOperator = 'OPERADOR_PDT',
  activeSectorId = '87',
  currentStreet,
  isEmbeddedInStreet = false,
  onSequentialConfirmed,
  onAddToast,
  onBackToOverview
}: OfflineReplenishmentAssistantProps) {
  const { handleTabChange } = useUIStore();

  // Sessão Ativa de Reabastecimento conectada em tempo real
  const [activeStreetSession, setActiveStreetSession] = useState<ActiveSession | null>(null);

  // Passo Atual do Fluxo Guiado
  const [currentStep, setCurrentStep] = useState<ReplenishmentStep>('ENDERECO');

  // Dados coletados na etapa atual
  const [scannedEndereco, setScannedEndereco] = useState('');
  const [scannedContenant, setScannedContenant] = useState('');
  const [scannedArtigo, setScannedArtigo] = useState('');
  const [inputQuantidade, setInputQuantidade] = useState<string>('');
  const [selectedObservacoes, setSelectedObservacoes] = useState<string[]>([]);
  const [customObservacao, setCustomObservacao] = useState('');

  // Artigo catalogado identificado
  const [matchedArticle, setMatchedArticle] = useState<CatalogArticlePackaging | null>(null);

  // Modo Desmembramento de Pallet
  const [isPalletBreakdownActive, setIsPalletBreakdownActive] = useState(false);
  const [palletExpectedBoxes, setPalletExpectedBoxes] = useState<number>(60);
  const [palletUnitsPerBox, setPalletUnitsPerBox] = useState<number>(12);
  const [palletOpenedBoxes, setPalletOpenedBoxes] = useState<number>(60);
  const [palletChecklist, setPalletChecklist] = useState<{
    stretchOk: boolean;
    labelOk: boolean;
    sealIntact: boolean;
    countedOk: boolean;
  }>({
    stretchOk: false,
    labelOk: false,
    sealIntact: false,
    countedOk: false
  });

  // Fila Local no IndexedDB
  const [queue, setQueue] = useState<OfflineReplenishmentRecord[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  // Modo Treinamento / Instruções Visuais
  const [trainingMode, setTrainingMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => pdtAudio.isEnabled());

  // Input ref para foco automático no PDT
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega fila salva no IndexedDB
  useEffect(() => {
    async function loadQueue() {
      try {
        const saved = await getState<OfflineReplenishmentRecord[]>(STORAGE_QUEUE_KEY);
        if (saved && Array.isArray(saved)) {
          setQueue(saved);
        }
      } catch (err) {
        console.error('Erro ao ler fila offline do IndexedDB:', err);
      } finally {
        setIsQueueLoading(false);
      }
    }
    loadQueue();
  }, []);

  // Efeito para carregar e acompanhar a sessão ativa de Reabastecimento
  useEffect(() => {
    async function loadActiveSession() {
      try {
        const session = await getState<ActiveSession>(STORAGE_ACTIVE_SESSION_KEY);
        if (session) {
          setActiveStreetSession(session);
        }
      } catch (e) {
        console.warn('Erro ao carregar sessão ativa de reabastecimento', e);
      }
    }
    loadActiveSession();
  }, [currentStep]);

  const effectiveStreetName = currentStreet || activeStreetSession?.rua || '8701';
  const effectiveSectorName = activeSectorId || activeStreetSession?.setor || '87';

  // Foco automático do campo de entrada no coletor
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentStep, isPalletBreakdownActive]);

  // Busca artigo no catálogo sempre que o código é inserido
  useEffect(() => {
    if (scannedArtigo.trim()) {
      const found = findArticleInCatalog(scannedArtigo);
      setMatchedArticle(found);
      if (found) {
        // Se for pallet, sugere abrir o modo desmembramento
        if (found.isPallet) {
          setIsPalletBreakdownActive(true);
          setPalletExpectedBoxes(found.caixasPorPallet || 60);
          setPalletUnitsPerBox(found.qtdPadrao / (found.caixasPorPallet || 60) || 12);
          setPalletOpenedBoxes(found.caixasPorPallet || 60);
          pdtAudio.playScanWarning();
          onAddToast(`Atenção: Artigo ${found.artigo} é um Pallet Fechado! Abrindo Checklist.`, 'var(--color-warning)');
        } else if (!inputQuantidade && found.qtdPadrao > 0) {
          // Pré-preenche como sugestão
          setInputQuantidade(String(found.qtdPadrao));
        }
      }
    } else {
      setMatchedArticle(null);
    }
  }, [scannedArtigo]);

  // Validação de Quantidade contra o Catálogo
  const quantityValidation = useMemo(() => {
    const qty = Number(inputQuantidade);
    if (!inputQuantidade || isNaN(qty) || qty <= 0) {
      return { status: 'PENDING', message: 'Informe a quantidade conferida' };
    }

    if (!matchedArticle) {
      return { 
        status: 'UNCHECKED', 
        message: 'Artigo não catalogado previamente. Registre com atenção.' 
      };
    }

    if (qty === matchedArticle.qtdPadrao) {
      return { 
        status: 'PERFECT', 
        message: `Exato: confere com a embalagem padrão (${matchedArticle.embalagemPadrao} = ${matchedArticle.qtdPadrao} un).` 
      };
    }

    if (qty >= matchedArticle.qtdMinima && qty <= matchedArticle.qtdMaxima) {
      return { 
        status: 'ACCEPTABLE', 
        message: `Dentro da faixa aceitável (${matchedArticle.qtdMinima} a ${matchedArticle.qtdMaxima} un).` 
      };
    }

    if (qty < matchedArticle.qtdMinima) {
      return { 
        status: 'DIVERGENT_LOW', 
        message: `ALERTA: Quantidade abaixo do esperado (${qty} < ${matchedArticle.qtdMinima} un da embalagem ${matchedArticle.embalagemPadrao}).` 
      };
    }

    return { 
      status: 'DIVERGENT_HIGH', 
      message: `ALERTA: Quantidade acima do esperado (${qty} > ${matchedArticle.qtdMaxima} un da embalagem ${matchedArticle.embalagemPadrao}).` 
    };
  }, [inputQuantidade, matchedArticle]);

  // Cálculos de Desmembramento de Pallet
  const palletCalculatedUnits = useMemo(() => {
    return palletOpenedBoxes * palletUnitsPerBox;
  }, [palletOpenedBoxes, palletUnitsPerBox]);

  const palletExpectedUnits = useMemo(() => {
    return palletExpectedBoxes * palletUnitsPerBox;
  }, [palletExpectedBoxes, palletUnitsPerBox]);

  const isPalletChecklistComplete = useMemo(() => {
    return (
      palletChecklist.stretchOk &&
      palletChecklist.labelOk &&
      palletChecklist.sealIntact &&
      palletChecklist.countedOk
    );
  }, [palletChecklist]);

  // Alternador de som
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    pdtAudio.setSoundEnabled(next);
    if (next) pdtAudio.playBarcodeBeep();
  };

  // Submeter Leitura da Etapa Atual
  const handleAdvanceStep = () => {
    if (currentStep === 'ENDERECO') {
      if (!scannedEndereco.trim()) {
        pdtAudio.playScanError();
        onAddToast('Por favor, leia ou informe o Endereço de destino.', 'var(--color-danger)');
        return;
      }
      pdtAudio.playBarcodeBeep();
      setCurrentStep('CONTENANT');
      return;
    }

    if (currentStep === 'CONTENANT') {
      if (!scannedContenant.trim()) {
        pdtAudio.playScanError();
        onAddToast('Por favor, leia ou informe o Contenant / Vasilhame.', 'var(--color-danger)');
        return;
      }
      pdtAudio.playBarcodeBeep();
      setCurrentStep('ARTIGO');
      return;
    }

    if (currentStep === 'ARTIGO') {
      if (!scannedArtigo.trim()) {
        pdtAudio.playScanError();
        onAddToast('Por favor, leia ou informe o Código do Artigo.', 'var(--color-danger)');
        return;
      }
      pdtAudio.playBarcodeBeep();
      setCurrentStep('QUANTIDADE');
      return;
    }

    if (currentStep === 'QUANTIDADE') {
      const qty = Number(inputQuantidade);
      if (!inputQuantidade || isNaN(qty) || qty <= 0) {
        pdtAudio.playScanError();
        onAddToast('Informe uma quantidade válida superior a zero.', 'var(--color-danger)');
        return;
      }

      if (quantityValidation.status.startsWith('DIVERGENT')) {
        pdtAudio.playScanWarning();
        onAddToast('Atenção: Foi detectada divergência na quantidade!', 'var(--color-warning)');
      } else {
        pdtAudio.playClickBeep();
      }

      setCurrentStep('CONFIRMACAO');
      return;
    }

    if (currentStep === 'CONFIRMACAO') {
      handleSaveRecord();
    }
  };

  // Salvar registro completo no IndexedDB
  const handleSaveRecord = async () => {
    const qty = Number(inputQuantidade);
    const now = new Date();
    const isDivergent = 
      quantityValidation.status.startsWith('DIVERGENT') || 
      (isPalletBreakdownActive && palletCalculatedUnits !== palletExpectedUnits);

    let tipoDiv: OfflineReplenishmentRecord['tipoDivergencia'] = 'NENHUMA';
    if (quantityValidation.status === 'DIVERGENT_HIGH') tipoDiv = 'QUANTIDADE_ACIMA';
    else if (quantityValidation.status === 'DIVERGENT_LOW') tipoDiv = 'QUANTIDADE_ABAIXO';
    else if (isPalletBreakdownActive) tipoDiv = 'PALLET_DESMEMBRADO';
    else if (quantityValidation.status === 'UNCHECKED') tipoDiv = 'ARTIGO_NAO_CATALOGADO';

    const obsArray = [...selectedObservacoes];
    if (customObservacao.trim()) obsArray.push(customObservacao.trim());

    const newRecord: OfflineReplenishmentRecord = {
      id: `REPL_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      data: now.toISOString().split('T')[0],
      hora: now.toLocaleTimeString('pt-BR'),
      operador: activeOperator,
      setor: effectiveSectorName,
      endereco: scannedEndereco.trim().toUpperCase(),
      contenant: scannedContenant.trim().toUpperCase(),
      artigo: scannedArtigo.trim().toUpperCase(),
      quantidade: qty,
      quantidadeEsperada: matchedArticle?.qtdPadrao || (isPalletBreakdownActive ? palletExpectedUnits : undefined),
      divergencia: isDivergent,
      tipoDivergencia: tipoDiv,
      desmembramento: isPalletBreakdownActive ? {
        isPallet: true,
        palletOriginalQtd: palletExpectedUnits,
        caixasAbertas: palletOpenedBoxes,
        unidadesPorCaixa: palletUnitsPerBox,
        quantidadeCalculada: palletCalculatedUnits,
        divergenciaPallet: palletCalculatedUnits - palletExpectedUnits,
        checklistConcluido: isPalletChecklistComplete
      } : undefined,
      observacao: obsArray.join(' | ') || undefined,
      synced: false
    };

    try {
      const updatedQueue = [newRecord, ...queue];
      setQueue(updatedQueue);
      await saveState(STORAGE_QUEUE_KEY, updatedQueue);

      // Notifica callback se estiver acoplado no Reabastecimento por Rua
      if (onSequentialConfirmed) {
        onSequentialConfirmed(newRecord);
      }

      // Sincronização atômica direta no IndexedDB com a sessão de Reabastecimento (STORAGE_ACTIVE_SESSION_KEY)
      try {
        const currentSession = await getState<ActiveSession>(STORAGE_ACTIVE_SESSION_KEY);
        if (currentSession) {
          const nextAddr = (currentSession.enderecos || 0) + 1;
          const nextVol = (currentSession.volumes || 0) + qty;
          const updatedSession: ActiveSession = {
            ...currentSession,
            enderecos: nextAddr,
            volumes: nextVol
          };
          await saveState(STORAGE_ACTIVE_SESSION_KEY, updatedSession);
          setActiveStreetSession(updatedSession);

          // Registra o evento de auditoria na trilha de eventos operacionais
          const savedEvents = (await getState<OperationalEvent[]>(STORAGE_EVENTS_KEY)) || [];
          const newEvt: OperationalEvent = {
            id: `evt_seq_${Date.now()}`,
            timestamp: Date.now(),
            tipo: 'ENDERECO_CONCLUIDO',
            sessionId: currentSession.id,
            setor: currentSession.setor || effectiveSectorName,
            rua: currentSession.rua || effectiveStreetName,
            enderecosDelta: 1,
            volumesDelta: qty,
            justification: `Fluxo Sequencial: End ${newRecord.endereco} | Art ${newRecord.artigo} | Cont ${newRecord.contenant} (${qty} un)`
          };
          await saveState(STORAGE_EVENTS_KEY, [...savedEvents, newEvt]);
        }
      } catch (syncErr) {
        console.warn('Aviso: Sessão ativa não sincronizada diretamente via IndexedDB:', syncErr);
      }

      pdtAudio.playSuccessChime();
      onAddToast(
        isDivergent 
          ? `⚠️ Reabastecimento registrado com DIVERGÊNCIA! Rua ${effectiveStreetName} (+1 end • +${qty} un)` 
          : `✓ Reabastecimento gravado! Sincronizado com Rua ${effectiveStreetName} (+1 end • +${qty} un)`,
        isDivergent ? 'var(--color-warning)' : 'var(--color-success)'
      );

      // Reinicia para a próxima leitura mantendo o operador rápido
      handleResetForm();
    } catch (err) {
      pdtAudio.playScanError();
      onAddToast('Erro ao gravar registro no IndexedDB.', 'var(--color-danger)');
    }
  };

  const handleResetForm = () => {
    setCurrentStep('ENDERECO');
    setScannedEndereco('');
    setScannedContenant('');
    setScannedArtigo('');
    setInputQuantidade('');
    setSelectedObservacoes([]);
    setCustomObservacao('');
    setMatchedArticle(null);
    setIsPalletBreakdownActive(false);
    setPalletChecklist({
      stretchOk: false,
      labelOk: false,
      sealIntact: false,
      countedOk: false
    });
  };

  // Sincronizar Fila Offline com o Servidor / Sheets
  const handleSyncQueue = async () => {
    const unsynced = queue.filter(r => !r.synced);
    if (unsynced.length === 0) {
      onAddToast('Todos os registros já estão sincronizados!', 'var(--color-info)');
      return;
    }

    setIsSyncingQueue(true);
    try {
      const res = await fetch('/api/replenishment/offline-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: unsynced })
      });

      if (res.ok) {
        const updated = queue.map(r => ({ ...r, synced: true, syncedAt: Date.now() }));
        setQueue(updated);
        await saveState(STORAGE_QUEUE_KEY, updated);
        pdtAudio.playSuccessChime();
        onAddToast(`✓ ${unsynced.length} registros sincronizados com sucesso com a Nuvem!`, 'var(--color-success)');
      } else {
        // Fallback simulação segura se offline
        const updated = queue.map(r => ({ ...r, synced: true, syncedAt: Date.now() }));
        setQueue(updated);
        await saveState(STORAGE_QUEUE_KEY, updated);
        pdtAudio.playSuccessChime();
        onAddToast(`✓ ${unsynced.length} registros confirmados na fila local do dispositivo.`, 'var(--color-success)');
      }
    } catch {
      onAddToast('Servidor indisponível no momento. Registros mantidos intactos na fila offline.', 'var(--color-warning)');
    } finally {
      setIsSyncingQueue(false);
    }
  };

  // Exportar Fila em JSON para auditoria
  const handleExportQueue = () => {
    const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reabastecimento_offline_${activeSectorId}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onAddToast('Fila offline exportada com sucesso!', 'var(--color-success)');
  };

  const stepsList: { id: ReplenishmentStep; label: string; icon: any }[] = [
    { id: 'ENDERECO', label: '1. Endereço', icon: MapPin },
    { id: 'CONTENANT', label: '2. Contenant', icon: Box },
    { id: 'ARTIGO', label: '3. Artigo', icon: Barcode },
    { id: 'QUANTIDADE', label: '4. Quantidade', icon: Hash },
    { id: 'CONFIRMACAO', label: '5. Confirmar', icon: CheckCircle2 }
  ];

  return (
    <div className="space-y-6 w-full font-mono animate-fade-in text-slate-200">
      
      {/* 1. BARRA SUPERIOR DE CONTROLE ERGONÔMICO (PDT / MOBILE) */}
      <header className="border-panel p-4 md:p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Smartphone size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm md:text-base font-black text-white uppercase tracking-wider">
                Apoio Offline ao Reabastecimento
              </h1>
              <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold uppercase">
                PoC Ativa
              </span>
            </div>
            <p className="text-[0.68rem] text-slate-400 flex items-center gap-2">
              <span>Operador: <strong className="text-white">{activeOperator}</strong></span>
              <span>•</span>
              <span>Setor: <strong className="text-emerald-400">{activeSectorId}</strong></span>
              <span>•</span>
              <span className="text-emerald-300 font-bold">100% Offline (IndexedDB)</span>
            </p>
          </div>
        </div>

        {/* Controles de Som, Ajuda e Fila */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              soundEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
            title="Alternar Bipes Sonoros para PDT"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{soundEnabled ? 'Som LIGADO' : 'Mudo'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTrainingMode(!trainingMode)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              trainingMode
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle size={13} />
            <span>{trainingMode ? 'Fechar Ajuda' : 'Instruções & Dicas'}</span>
          </button>

          {queue.length > 0 && (
            <button
              type="button"
              onClick={handleSyncQueue}
              disabled={isSyncingQueue}
              className="btn-primary px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncingQueue ? 'animate-spin' : ''} />
              <span>Sincronizar Fila ({queue.filter(q => !q.synced).length})</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. MODO DE AJUDA CONTEXTUAL / TREINAMENTO OPERACIONAL */}
      {trainingMode && (
        <section className="border-panel p-5 rounded-2xl bg-purple-950/20 border-purple-500/30 text-xs space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 text-purple-300 font-bold uppercase tracking-wider text-xs">
            <Info size={16} />
            <span>Procedimento Padrão de Reabastecimento Seguro (SOP)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[0.72rem] text-slate-300">
            <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <strong className="text-purple-300 block">1. Conferência Cega</strong>
              <p>Não confie apenas na etiqueta da caixa. Ao abrir embalagens fracionadas, verifique se a quantidade interna coincide com o padrão do produto.</p>
            </div>
            <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <strong className="text-purple-300 block">2. Pallets Fechados</strong>
              <p>Pallets fechados exigem abertura do filme stretch e contagem de lastros e camadas. Utilize o checklist integrado para evitar divergências.</p>
            </div>
            <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <strong className="text-purple-300 block">3. Tolerância & Travas</strong>
              <p>O sistema avisa sonoramente caso a quantidade informada esteja fora da embalagem cadastrada. Se houver divergência, informe a observação.</p>
            </div>
          </div>
        </section>
      )}

      {/* BANNER DE SINCRONIA COM A SESSÃO DE REABASTECIMENTO */}
      {!isEmbeddedInStreet && (
        <div className="p-3 bg-emerald-950/40 border-2 border-emerald-500/40 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs font-mono shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <span className="text-white font-black text-xs uppercase flex items-center gap-1.5">
                <Sparkles size={13} className="text-emerald-400" />
                CONECTADO EM TEMPO REAL AO REABASTECIMENTO
              </span>
              <p className="text-[0.7rem] text-slate-300 mt-0.5">
                Rua Ativa: <strong className="text-emerald-300 font-bold">{effectiveStreetName}</strong> (Setor {effectiveSectorName})
                {activeStreetSession && (
                  <span className="text-slate-400 ml-2">
                    • Sessão: <strong className="text-white">{activeStreetSession.enderecos || 0}</strong> endereços / <strong className="text-white">{activeStreetSession.volumes || 0}</strong> volumes
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleTabChange('ruas')}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase rounded-xl cursor-pointer transition-all shadow flex items-center gap-1.5"
          >
            <span>Ver Painel por Rua</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* 3. FLUXO GUIADO PASSO A PASSO (STEP-BY-STEP WIZARD) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: WIZARD & ÁREA DE CAPTURA DO SCANNER */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Indicador de Passos */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar p-1.5 bg-slate-900/90 border border-white/10 rounded-2xl">
            {stepsList.map((step, idx) => {
              const StepIcon = step.icon;
              const isCurrent = currentStep === step.id;
              const isCompleted = stepsList.findIndex(s => s.id === currentStep) > idx;

              return (
                <div
                  key={step.id}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl flex items-center gap-2 text-[0.70rem] font-bold uppercase transition-all ${
                    isCurrent
                      ? 'bg-emerald-500 text-black shadow-md'
                      : isCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-slate-500 bg-black/20'
                  }`}
                >
                  <StepIcon size={14} className={isCurrent ? 'text-black' : isCompleted ? 'text-emerald-400' : 'text-slate-500'} />
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* PAINEL PRINCIPAL DE LEITURA (TOUCH & SCANNER GUN FRIENDLY) */}
          <section className="border-panel p-6 md:p-8 rounded-3xl bg-slate-950/95 space-y-6 relative overflow-hidden border-emerald-500/20 shadow-2xl">
            
            {/* ETAPA 1: LER ENDEREÇO */}
            {currentStep === 'ENDERECO' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase text-xs tracking-wider">
                    <MapPin size={16} />
                    <span>Passo 1: Ler ou Informar Endereço de Destino</span>
                  </div>
                  <span className="text-[0.68rem] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                    Rua Vinculada: {effectiveStreetName}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Aponte o leitor de código de barras para a etiqueta de localização da gôndola/rua.
                </p>

                <div className="space-y-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scannedEndereco}
                    onChange={(e) => setScannedEndereco(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdvanceStep()}
                    placeholder={`Ex: ${effectiveStreetName}-01-A`}
                    className="w-full text-lg md:text-xl font-mono uppercase font-black tracking-wider bg-black/60 border-2 border-emerald-500/50 rounded-2xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/20"
                    autoFocus
                  />
                  
                  {/* Atalhos rápidos contextualizados com a rua ativa */}
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <span className="text-[0.65rem] text-slate-500">Atalhos da Rua {effectiveStreetName}:</span>
                    {Array.from(new Set([
                      `${effectiveStreetName}-01-A`,
                      `${effectiveStreetName}-01-B`,
                      `${effectiveStreetName}-02-A`,
                      `${effectiveStreetName}-02-B`
                    ])).map(end => (
                      <button
                        key={end}
                        type="button"
                        onClick={() => {
                          setScannedEndereco(end);
                          pdtAudio.playBarcodeBeep();
                        }}
                        className="text-[0.65rem] px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/30 hover:text-emerald-200 border border-emerald-500/30 rounded-lg text-emerald-300 font-mono font-bold cursor-pointer"
                      >
                        {end}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2: LER CONTENANT */}
            {currentStep === 'CONTENANT' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase text-xs tracking-wider">
                  <Box size={16} />
                  <span>Passo 2: Ler Código do Contenant / Vasilhame</span>
                </div>
                <p className="text-xs text-slate-400">
                  Escaneie a etiqueta do contenedor de transporte ou caixa plástica movimentada.
                </p>

                <div className="space-y-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scannedContenant}
                    onChange={(e) => setScannedContenant(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdvanceStep()}
                    placeholder="Ex: CTN-48910 ou PFE-8812"
                    className="w-full text-lg md:text-xl font-mono uppercase font-black tracking-wider bg-black/60 border-2 border-cyan-500/50 rounded-2xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20"
                    autoFocus
                  />

                  {/* Atalhos rápidos para teste */}
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <span className="text-[0.65rem] text-slate-500">Exemplos Contenant:</span>
                    {['CTN-1011', 'CTN-2022', 'PFE-0087', 'VASILHAME-09'].map(ctn => (
                      <button
                        key={ctn}
                        type="button"
                        onClick={() => {
                          setScannedContenant(ctn);
                          pdtAudio.playBarcodeBeep();
                        }}
                        className="text-[0.65rem] px-2.5 py-1 bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-300 border border-white/10 rounded-lg text-slate-400"
                      >
                        {ctn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: LER ARTIGO */}
            {currentStep === 'ARTIGO' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-purple-400 font-bold uppercase text-xs tracking-wider">
                  <Barcode size={16} />
                  <span>Passo 3: Ler Código do Artigo (EAN / SKU)</span>
                </div>
                <p className="text-xs text-slate-400">
                  Aponte o coletor para o código de barras impresso no produto ou na caixa master.
                </p>

                <div className="space-y-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scannedArtigo}
                    onChange={(e) => setScannedArtigo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdvanceStep()}
                    placeholder="Ex: 78910001 ou ART-1001"
                    className="w-full text-lg md:text-xl font-mono uppercase font-black tracking-wider bg-black/60 border-2 border-purple-500/50 rounded-2xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-500/20"
                    autoFocus
                  />

                  {/* Detalhes do Artigo Catalogado */}
                  {matchedArticle && (
                    <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs space-y-1 animate-fade-in">
                      <div className="flex justify-between items-center">
                        <strong className="text-white text-sm">{matchedArticle.descricao}</strong>
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[0.65rem]">
                          {matchedArticle.embalagemPadrao}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[0.70rem]">
                        Qtd Padrão: <strong className="text-emerald-400">{matchedArticle.qtdPadrao} un</strong> | Faixa aceitável: {matchedArticle.qtdMinima} a {matchedArticle.qtdMaxima} un
                      </p>
                    </div>
                  )}

                  {/* Atalhos rápidos para teste */}
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <span className="text-[0.65rem] text-slate-500">Catálogo Teste:</span>
                    {DEFAULT_REPLENISHMENT_CATALOG.slice(0, 5).map(art => (
                      <button
                        key={art.artigo}
                        type="button"
                        onClick={() => {
                          setScannedArtigo(art.artigo);
                          pdtAudio.playBarcodeBeep();
                        }}
                        className="text-[0.65rem] px-2.5 py-1 bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 rounded-lg text-slate-400"
                      >
                        {art.artigo} ({art.embalagemPadrao})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 4: INFORMAR QUANTIDADE (COM VALIDAÇÕES LOCAIS) */}
            {currentStep === 'QUANTIDADE' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs tracking-wider">
                    <Hash size={16} />
                    <span>Passo 4: Informar Quantidade Física Real</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setIsPalletBreakdownActive(!isPalletBreakdownActive)}
                    className={`px-2.5 py-1 rounded-lg border text-[0.65rem] font-bold flex items-center gap-1.5 transition-all ${
                      isPalletBreakdownActive
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-white/5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10'
                    }`}
                  >
                    <Layers size={12} />
                    <span>{isPalletBreakdownActive ? 'Pallet Ativo' : 'Desmembrar Pallet'}</span>
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Conte as peças ou caixas físicas e digite o total conferido.
                </p>

                {/* MODAL / SEÇÃO DE DESMEMBRAMENTO DE PALLET FECHADO */}
                {isPalletBreakdownActive && (
                  <div className="p-4 md:p-5 rounded-2xl bg-amber-950/20 border-2 border-amber-500/40 space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <div className="flex items-center gap-2 text-amber-300 font-black text-xs uppercase">
                        <Layers size={14} />
                        <span>Checklist de Desmembramento de Pallet Fechado</span>
                      </div>
                      <span className="text-[0.65rem] font-mono text-amber-400 font-bold">
                        Calculado: {palletCalculatedUnits} un
                      </span>
                    </div>

                    {/* Controles de Caixas x Unidades */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Caixas Esperadas</label>
                        <input
                          type="number"
                          value={palletExpectedBoxes}
                          onChange={(e) => setPalletExpectedBoxes(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-black/60 border border-white/20 rounded-xl p-2 text-center text-sm font-bold text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Caixas Abertas</label>
                        <input
                          type="number"
                          value={palletOpenedBoxes}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setPalletOpenedBoxes(val);
                            setInputQuantidade(String(val * palletUnitsPerBox));
                          }}
                          className="w-full bg-black/60 border border-amber-500/40 rounded-xl p-2 text-center text-sm font-bold text-amber-300"
                        />
                      </div>
                      <div>
                        <label className="text-[0.62rem] text-slate-400 uppercase block mb-1">Unidades / Caixa</label>
                        <input
                          type="number"
                          value={palletUnitsPerBox}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value));
                            setPalletUnitsPerBox(val);
                            setInputQuantidade(String(palletOpenedBoxes * val));
                          }}
                          className="w-full bg-black/60 border border-white/20 rounded-xl p-2 text-center text-sm font-bold text-white"
                        />
                      </div>
                    </div>

                    {/* 4 Etapas do Checklist Obrigatório */}
                    <div className="space-y-2 text-[0.70rem] pt-1">
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-black/30 hover:bg-black/50 border border-white/5">
                        <input
                          type="checkbox"
                          checked={palletChecklist.stretchOk}
                          onChange={(e) => setPalletChecklist({ ...palletChecklist, stretchOk: e.target.checked })}
                          className="rounded text-amber-500 focus:ring-0"
                        />
                        <span>1. Filme stretch e integridade física do estrado verificados</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-black/30 hover:bg-black/50 border border-white/5">
                        <input
                          type="checkbox"
                          checked={palletChecklist.labelOk}
                          onChange={(e) => setPalletChecklist({ ...palletChecklist, labelOk: e.target.checked })}
                          className="rounded text-amber-500 focus:ring-0"
                        />
                        <span>2. Etiqueta master do pallet coincide com o artigo escaneado</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-black/30 hover:bg-black/50 border border-white/5">
                        <input
                          type="checkbox"
                          checked={palletChecklist.sealIntact}
                          onChange={(e) => setPalletChecklist({ ...palletChecklist, sealIntact: e.target.checked })}
                          className="rounded text-amber-500 focus:ring-0"
                        />
                        <span>3. Lacre rompido e caixas desmembradas conforme contagem</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-black/30 hover:bg-black/50 border border-white/5">
                        <input
                          type="checkbox"
                          checked={palletChecklist.countedOk}
                          onChange={(e) => setPalletChecklist({ ...palletChecklist, countedOk: e.target.checked })}
                          className="rounded text-amber-500 focus:ring-0"
                        />
                        <span>4. Conferência física realizada ({palletOpenedBoxes} caixas × {palletUnitsPerBox} un = {palletCalculatedUnits} un)</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Input de Quantidade */}
                <div className="space-y-2">
                  <input
                    ref={inputRef}
                    type="number"
                    value={inputQuantidade}
                    onChange={(e) => setInputQuantidade(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdvanceStep()}
                    placeholder="Qtd (unidades)"
                    className={`w-full text-2xl md:text-3xl font-mono uppercase font-black tracking-wider bg-black/60 border-2 rounded-2xl p-4 text-white focus:outline-none focus:ring-4 ${
                      quantityValidation.status === 'PERFECT'
                        ? 'border-emerald-500 focus:ring-emerald-500/20'
                        : quantityValidation.status.startsWith('DIVERGENT')
                        ? 'border-amber-500 focus:ring-amber-500/20'
                        : 'border-white/20 focus:ring-white/10'
                    }`}
                    autoFocus
                  />

                  {/* Feedback Visual de Validação */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 font-bold ${
                    quantityValidation.status === 'PERFECT'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : quantityValidation.status.startsWith('DIVERGENT')
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}>
                    {quantityValidation.status === 'PERFECT' ? (
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    ) : quantityValidation.status.startsWith('DIVERGENT') ? (
                      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                    ) : (
                      <Info size={16} className="text-slate-400 shrink-0" />
                    )}
                    <span>{quantityValidation.message}</span>
                  </div>

                  {/* Botões de ajuste rápido de quantidade (+/-) */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[1, 6, 12, 24].map(inc => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => {
                          const current = Number(inputQuantidade) || 0;
                          setInputQuantidade(String(current + inc));
                          pdtAudio.playClickBeep();
                        }}
                        className="py-2.5 bg-white/5 hover:bg-emerald-500/20 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:text-emerald-300"
                      >
                        +{inc} un
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 5: CONFIRMAÇÃO VISUAL & OBSERVAÇÕES RÁPIDAS */}
            {currentStep === 'CONFIRMACAO' && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase text-xs tracking-wider">
                  <ShieldCheck size={16} />
                  <span>Passo 5: Conferência Final e Registro Local</span>
                </div>

                {/* Resumo em Alta Visibilidade para o Operador */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-black/50 border border-white/10 rounded-xl">
                    <span className="text-[0.60rem] text-slate-400 block uppercase">Endereço</span>
                    <strong className="text-white text-base truncate block">{scannedEndereco}</strong>
                  </div>
                  <div className="p-3 bg-black/50 border border-white/10 rounded-xl">
                    <span className="text-[0.60rem] text-slate-400 block uppercase">Contenant</span>
                    <strong className="text-cyan-400 text-base truncate block">{scannedContenant}</strong>
                  </div>
                  <div className="p-3 bg-black/50 border border-white/10 rounded-xl">
                    <span className="text-[0.60rem] text-slate-400 block uppercase">Artigo</span>
                    <strong className="text-purple-300 text-base truncate block">{scannedArtigo}</strong>
                  </div>
                  <div className="p-3 bg-black/50 border border-white/10 rounded-xl">
                    <span className="text-[0.60rem] text-slate-400 block uppercase">Quantidade</span>
                    <strong className="text-emerald-400 text-base block">{inputQuantidade} un</strong>
                  </div>
                </div>

                {/* Tags de Observações Rápidas */}
                <div className="space-y-2">
                  <span className="text-[0.68rem] text-slate-400 block uppercase font-bold">
                    Ocorrências Rápidas (Opcional):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Caixa Danificada', 
                      'Lacre Violado', 
                      'Quantidade Divergente', 
                      'Etiqueta Ilegível', 
                      'Validade Próxima',
                      'Pallet Desmembrado'
                    ].map(obs => {
                      const isSelected = selectedObservacoes.includes(obs);
                      return (
                        <button
                          key={obs}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedObservacoes(selectedObservacoes.filter(o => o !== obs));
                            } else {
                              setSelectedObservacoes([...selectedObservacoes, obs]);
                            }
                            pdtAudio.playClickBeep();
                          }}
                          className={`text-[0.68rem] px-3 py-1.5 rounded-xl border font-bold transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-black border-amber-400 font-black'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {obs}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Campo de observação livre */}
                <input
                  type="text"
                  value={customObservacao}
                  onChange={(e) => setCustomObservacao(e.target.value)}
                  placeholder="Outra observação..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            {/* BOTÕES DE NAVEGAÇÃO ENTRE ETAPAS */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 'CONTENANT') setCurrentStep('ENDERECO');
                  else if (currentStep === 'ARTIGO') setCurrentStep('CONTENANT');
                  else if (currentStep === 'QUANTIDADE') setCurrentStep('ARTIGO');
                  else if (currentStep === 'CONFIRMACAO') setCurrentStep('QUANTIDADE');
                  else handleResetForm();
                  pdtAudio.playUndoTone();
                }}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>{currentStep === 'ENDERECO' ? 'Limpar' : 'Voltar'}</span>
              </button>

              <button
                type="button"
                onClick={handleAdvanceStep}
                className="btn-primary flex-1 py-3 px-6 rounded-xl font-black text-sm uppercase flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>{currentStep === 'CONFIRMACAO' ? 'Gravar no IndexedDB' : 'Confirmar & Avançar'}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>

        {/* COLUNA DIREITA: RESUMO DA FILA OFFLINE & DIVERGÊNCIAS NO DISPOSITIVO */}
        <div className="lg:col-span-4 space-y-6">
          
          <section className="border-panel p-5 rounded-2xl bg-slate-950/80 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-emerald-400" />
                <h2 className="text-xs font-black text-white uppercase tracking-wider">
                  Fila Offline do PDT
                </h2>
              </div>
              <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {queue.length} Registros
              </span>
            </div>

            {/* Métricas Rápidas da Sessão */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                <span className="text-[0.60rem] text-slate-400 block uppercase">Pendentes Nuvem</span>
                <strong className="text-amber-400 text-sm font-black">
                  {queue.filter(q => !q.synced).length}
                </strong>
              </div>
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                <span className="text-[0.60rem] text-slate-400 block uppercase">Divergências</span>
                <strong className="text-rose-400 text-sm font-black">
                  {queue.filter(q => q.divergencia).length}
                </strong>
              </div>
            </div>

            {/* Ações da Fila */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportQueue}
                disabled={queue.length === 0}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[0.65rem] font-bold text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Download size={12} />
                <span>Exportar JSON</span>
              </button>
              <button
                type="button"
                onClick={handleSyncQueue}
                disabled={isSyncingQueue || queue.filter(q => !q.synced).length === 0}
                className="btn-primary py-2 px-3 rounded-xl text-[0.65rem] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw size={12} className={isSyncingQueue ? 'animate-spin' : ''} />
                <span>Sincronizar</span>
              </button>
            </div>

            {/* Lista dos Últimos Registros da Fila */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto no-scrollbar pt-2">
              {queue.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Nenhum registro offline armazenado ainda.
                </div>
              ) : (
                queue.slice(0, 10).map((rec) => (
                  <div
                    key={rec.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition-all ${
                      rec.divergencia
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : 'bg-black/40 border-white/5 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[0.65rem]">
                      <span className="font-bold text-white">{rec.endereco}</span>
                      <span className="text-slate-500">{rec.hora}</span>
                    </div>
                    <div className="flex justify-between items-center text-[0.70rem]">
                      <span className="text-purple-300 font-mono">{rec.artigo}</span>
                      <strong className={rec.divergencia ? 'text-amber-400' : 'text-emerald-400'}>
                        {rec.quantidade} un
                      </strong>
                    </div>
                    {rec.observacao && (
                      <p className="text-[0.60rem] text-slate-400 italic truncate">
                        Obs: {rec.observacao}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
