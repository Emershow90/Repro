/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  ShieldCheck, 
  ArrowRight, 
  RotateCcw, 
  Award, 
  Trash2, 
  FolderSync, 
  Eye, 
  ThumbsUp, 
  CheckSquare, 
  Square,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  Share2
} from 'lucide-react';

export interface FiveSSense {
  id: 'seiri' | 'seiton' | 'seiso' | 'seiketsu' | 'shitsuke';
  num: string;
  name: string;
  kanji: string;
  translation: string;
  gradient: string;
  badgeBg: string;
  borderGlow: string;
  motto: string;
  description: string;
  checklistItems: string[];
  alertWarning: string;
  iconName: string;
}

export const FIVE_S_SENSES: FiveSSense[] = [
  {
    id: 'seiri',
    num: '1S',
    name: 'SEIRI',
    kanji: '整理',
    translation: 'Senso de Utilização & Descarte',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    borderGlow: 'hover:border-emerald-500/50 hover:shadow-emerald-500/20',
    motto: 'O que não serve para o reabastecimento agora, sai do corredor!',
    description: 'Eliminar caixas vazias, paletes quebrados, fitas cortadas e materiais que obstruem a movimentação.',
    checklistItems: [
      'Corredor livre de caixas de papelão vazias e plástico no chão',
      'Paletes danificados ou vazios retirados da via de trânsito',
      'Apenas caixas com demanda ativa presentes na rua'
    ],
    alertWarning: 'Atenção: Caixas vazias no solo geram tropeços e travam os carrinhos de reabastecimento.',
    iconName: 'Trash2'
  },
  {
    id: 'seiton',
    num: '2S',
    name: 'SEITON',
    kanji: '整頓',
    translation: 'Senso de Organização & Ordenação',
    gradient: 'from-blue-600 via-indigo-600 to-violet-700',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    borderGlow: 'hover:border-blue-500/50 hover:shadow-blue-500/20',
    motto: 'Um lugar para cada artigo, cada artigo em seu endereço!',
    description: 'Posicionar cada caixa exatamente na baia correta com etiquetas de código de barras voltadas para o operador.',
    checklistItems: [
      'Etiquetas de código de barras visíveis e voltadas para frente',
      'Nenhuma caixa invadindo o endereço vizinho',
      'Artigos organizados conforme o fluxo de numeração da baia'
    ],
    alertWarning: 'Atenção: Caixa com etiqueta virada para trás atrasa a conferência e o picking do CD.',
    iconName: 'Layers'
  },
  {
    id: 'seiso',
    num: '3S',
    name: 'SEISO',
    kanji: '清掃',
    translation: 'Senso de Limpeza & Inspeção',
    gradient: 'from-violet-600 via-purple-600 to-fuchsia-700',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    borderGlow: 'hover:border-purple-500/50 hover:shadow-purple-500/20',
    motto: 'Limpar enquanto opera e inspecionar a estrutura da rua!',
    description: 'Manter a rua varrida, descarte contínuo de sobras e verificação visual das longarinas e solo.',
    checklistItems: [
      'Piso do corredor varrido e sem resíduos escorregadios',
      'Estrutura de porta-paletes e solo sem avarias visíveis',
      'Área de coleta de lixo da rua utilizada corretamente'
    ],
    alertWarning: 'Atenção: Fita adesiva colada no chão prende rodízios de carrinhos e acumula poeira.',
    iconName: 'Sparkles'
  },
  {
    id: 'seiketsu',
    num: '4S',
    name: 'SEIKETSU',
    kanji: '清潔',
    translation: 'Senso de Padronização & Saúde',
    gradient: 'from-amber-600 via-orange-600 to-rose-700',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    borderGlow: 'hover:border-amber-500/50 hover:shadow-amber-500/20',
    motto: 'Manter o padrão visual de excelência em todas as ruas!',
    description: 'Padronizar a altura máxima de empilhamento de CTN, alinhamento de solo e ergonomia do operador.',
    checklistItems: [
      'Empilhamento dentro da altura de segurança recomendada',
      'Nomenclatura uniforme e visível dos endereços',
      'Uso correto de EPI e postura ergonômica nas caixas pesadas'
    ],
    alertWarning: 'Atenção: Empilhamento excessivo pode tombar caixas e danificar mercadorias valiosas.',
    iconName: 'ShieldCheck'
  },
  {
    id: 'shitsuke',
    num: '5S',
    name: 'SHITSUKE',
    kanji: '躾',
    translation: 'Senso de Disciplina & Autogestão',
    gradient: 'from-rose-600 via-pink-600 to-indigo-800',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    borderGlow: 'hover:border-rose-500/50 hover:shadow-rose-500/20',
    motto: 'Fazer o correto sempre, mesmo quando ninguém estiver olhando!',
    description: 'Bipar cada endereço no momento exato, preencher o CTN fielmente e fechar a rua com excelência.',
    checklistItems: [
      '100% dos bipes e CTNs conferidos e sem pular endereços',
      'Rotina de início e fim de rua registrada com exatidão',
      'Compromisso diário com a produtividade e qualidade do REPRO'
    ],
    alertWarning: 'Atenção: A disciplina de registrar os dados em tempo real garante a precisão do estoque do CD.',
    iconName: 'Award'
  }
];

interface FiveSVisualReminderProps {
  activeStreet?: string;
  activeSector?: string;
  mode?: 'banner' | 'card' | 'full';
  onAuditComplete?: (score: number, street: string) => void;
  onNotify?: (msg: string, color?: string) => void;
}

export function FiveSVisualReminder({
  activeStreet = 'B4VD',
  activeSector = '87',
  mode = 'banner',
  onAuditComplete,
  onNotify
}: FiveSVisualReminderProps) {
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [selectedSenseIndex, setSelectedSenseIndex] = useState(0);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [savedAudits, setSavedAudits] = useState<Record<string, { score: number; date: string }>>({});
  const [tipIndex, setTipIndex] = useState(0);

  // Carrega histórico de auditorias de 5S salvas localmente
  useEffect(() => {
    try {
      const raw = localStorage.getItem('repro_5s_audits_v1');
      if (raw) {
        setSavedAudits(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  // Rotação suave da Dica 5S do Dia
  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex(prev => (prev + 1) % FIVE_S_SENSES.length);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  // Alterna item do checklist
  const toggleItem = (senseId: string, itemIdx: number) => {
    const key = `${activeStreet}_${senseId}_${itemIdx}`;
    setChecklistState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Calcula pontuação da auditoria atual para a rua ativa
  const currentAuditScore = React.useMemo(() => {
    let totalItems = 0;
    let checkedItems = 0;

    FIVE_S_SENSES.forEach(sense => {
      sense.checklistItems.forEach((_, idx) => {
        totalItems++;
        const key = `${activeStreet}_${sense.id}_${idx}`;
        if (checklistState[key]) {
          checkedItems++;
        }
      });
    });

    if (totalItems === 0) return 0;
    return Math.round((checkedItems / totalItems) * 100);
  }, [activeStreet, checklistState]);

  // Salvar Auditoria 5S
  const handleSaveAudit = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newAudits = {
      ...savedAudits,
      [activeStreet]: {
        score: currentAuditScore,
        date: todayStr
      }
    };
    setSavedAudits(newAudits);
    try {
      localStorage.setItem('repro_5s_audits_v1', JSON.stringify(newAudits));
    } catch {
      // ignore
    }

    if (onAuditComplete) {
      onAuditComplete(currentAuditScore, activeStreet);
    }
    if (onNotify) {
      onNotify(`Auditoria 5S da Rua ${activeStreet} concluída com nota ${currentAuditScore}%!`, 'var(--color-success)');
    }
    setIsOpenModal(false);
  };

  // Marcar todos os itens como conformes
  const handleMarkAll = () => {
    const updated: Record<string, boolean> = { ...checklistState };
    FIVE_S_SENSES.forEach(sense => {
      sense.checklistItems.forEach((_, idx) => {
        const key = `${activeStreet}_${sense.id}_${idx}`;
        updated[key] = true;
      });
    });
    setChecklistState(updated);
  };

  // Limpar checklist da rua
  const handleResetChecklist = () => {
    const updated: Record<string, boolean> = { ...checklistState };
    FIVE_S_SENSES.forEach(sense => {
      sense.checklistItems.forEach((_, idx) => {
        const key = `${activeStreet}_${sense.id}_${idx}`;
        delete updated[key];
      });
    });
    setChecklistState(updated);
  };

  const currentSense = FIVE_S_SENSES[selectedSenseIndex];
  const activeStreetAudit = savedAudits[activeStreet];

  return (
    <div className="w-full">
      {/* -----------------------------------------------------------------
          1. BANNER DEGRADÊ VISUAL (COMPACTO, ELEGANTE E INTERATIVO)
          ----------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-white/10 shadow-lg p-3 sm:p-4">
        {/* Fita de Degradê Superior Luminosa Multi-Cor (Os 5 Sensos) */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 via-purple-500 via-amber-500 to-rose-500 animate-pulse opacity-90" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          {/* Lado Esquerdo: Identidade 5S e Lema Rotativo */}
          <div className="flex items-center gap-3">
            {/* Ícone de Destaque com Degradê */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
              <Sparkles size={20} className="animate-spin-slow" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400 uppercase tracking-wider">
                  PROGRAMA 5S LOGÍSTICO REPRO
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono border border-white/10">
                  Rua {activeStreet}
                </span>
                {activeStreetAudit && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeStreetAudit.score >= 80 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    Nota 5S: {activeStreetAudit.score}%
                  </span>
                )}
              </div>

              {/* Mensagem rotativa animada dos 5 sensos */}
              <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-gradient-to-r ${FIVE_S_SENSES[tipIndex].gradient} text-white`}>
                  {FIVE_S_SENSES[tipIndex].num} {FIVE_S_SENSES[tipIndex].name}
                </span>
                <span className="text-slate-400 text-xs italic">
                  "{FIVE_S_SENSES[tipIndex].motto}"
                </span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Micro Barra dos 5 Sensos & Botões de Ação */}
          <div className="flex items-center gap-2 self-end md:self-center">
            {/* 5 Pílulas Degradê Clicáveis */}
            <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              {FIVE_S_SENSES.map((sense, idx) => (
                <button
                  key={sense.id}
                  type="button"
                  onClick={() => {
                    setSelectedSenseIndex(idx);
                    setIsOpenModal(true);
                  }}
                  title={`${sense.num} ${sense.name}: ${sense.translation}`}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer bg-gradient-to-r ${sense.gradient} text-white shadow-sm hover:scale-105 active:scale-95 opacity-85 hover:opacity-100`}
                >
                  {sense.num}
                </button>
              ))}
            </div>

            {/* Botão de Abrir Checklist / Guia 5S */}
            <button
              type="button"
              onClick={() => setIsOpenModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold font-mono bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-md shadow-emerald-900/30 flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              <CheckSquare size={14} />
              <span>CHECKLIST & GUIA 5S</span>
            </button>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          2. MODAL INTERATIVO COMPLETO: GUIA VISUAL & CHECKLIST 5S DA RUA
          ----------------------------------------------------------------- */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-white/15 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
            
            {/* Header com Faixa Degradê Vibrante */}
            <div className="relative p-5 border-b border-white/10 bg-slate-900/70">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 via-purple-500 via-amber-500 to-rose-500" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                    <Award size={22} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white font-mono flex items-center gap-2">
                      <span>AUDITORIA & PADRÃO 5S DA RUA</span>
                      <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono text-xs border border-cyan-500/30">
                        {activeStreet} (Setor {activeSector})
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Excelência operacional no reabastecimento de solo e volumosos
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Score da Auditoria */}
                  <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-white/10 text-right">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Conformidade</div>
                    <div className={`text-base font-mono font-black ${
                      currentAuditScore >= 80 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {currentAuditScore}%
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOpenModal(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Seletor dos 5 Sensos (Abas Estilizadas com Degradê) */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mt-4">
                {FIVE_S_SENSES.map((sense, idx) => {
                  const isSelected = selectedSenseIndex === idx;
                  // Calcula itens marcados deste senso específico
                  let countChecked = 0;
                  sense.checklistItems.forEach((_, itemIdx) => {
                    if (checklistState[`${activeStreet}_${sense.id}_${itemIdx}`]) {
                      countChecked++;
                    }
                  });
                  const isFull = countChecked === sense.checklistItems.length;

                  return (
                    <button
                      key={sense.id}
                      type="button"
                      onClick={() => setSelectedSenseIndex(idx)}
                      className={`relative p-2 rounded-xl text-left transition-all cursor-pointer border ${
                        isSelected 
                          ? `bg-gradient-to-r ${sense.gradient} text-white border-white/30 shadow-lg scale-102` 
                          : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-black">{sense.num}</span>
                        {isFull && <CheckCircle2 size={12} className="text-emerald-300" />}
                      </div>
                      <div className="text-[10px] sm:text-xs font-bold truncate mt-0.5 font-mono">
                        {sense.name}
                      </div>
                      <div className="text-[9px] opacity-75 truncate hidden sm:block">
                        {sense.translation.split('&')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conteúdo do Senso Selecionado */}
            <div className="p-5 space-y-5 flex-1">
              {/* Card Destaque do Senso Selecionado */}
              <div className={`p-5 rounded-2xl bg-gradient-to-br ${currentSense.gradient} text-white shadow-xl relative overflow-hidden`}>
                <div className="absolute top-2 right-3 text-5xl font-black opacity-15 select-none font-mono">
                  {currentSense.kanji}
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-white/20 text-white font-mono text-xs font-black backdrop-blur-sm">
                    {currentSense.num}
                  </span>
                  <h3 className="text-lg font-black font-mono tracking-wide">
                    {currentSense.name} — {currentSense.translation}
                  </h3>
                </div>

                <p className="text-sm font-semibold opacity-95 mt-1 italic">
                  "{currentSense.motto}"
                </p>

                <p className="text-xs opacity-85 mt-2 max-w-2xl leading-relaxed">
                  {currentSense.description}
                </p>

                {/* Alerta de Segurança e Qualidade */}
                <div className="mt-3 p-2.5 rounded-xl bg-black/30 backdrop-blur-md border border-white/15 flex items-start gap-2 text-xs">
                  <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
                  <span className="opacity-95">{currentSense.alertWarning}</span>
                </div>
              </div>

              {/* Checklist Interativo do Senso para a Rua */}
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                  <h4 className="text-xs font-black text-white font-mono uppercase flex items-center gap-2">
                    <CheckSquare size={16} className="text-cyan-400" />
                    <span>Checklist Operacional da Rua {activeStreet}</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    Marque os itens verificados nesta rua
                  </span>
                </div>

                <div className="space-y-2.5">
                  {currentSense.checklistItems.map((item, idx) => {
                    const key = `${activeStreet}_${currentSense.id}_${idx}`;
                    const isChecked = !!checklistState[key];

                    return (
                      <div
                        key={idx}
                        onClick={() => toggleItem(currentSense.id, idx)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                          isChecked
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-950/60 border-white/5 text-slate-300 hover:border-white/15'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-400 text-white'
                            : 'border-slate-600 bg-slate-800 text-transparent'
                        }`}>
                          <CheckCircle2 size={16} />
                        </div>
                        <span className="text-xs font-mono font-medium flex-1">
                          {item}
                        </span>
                        {isChecked && (
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                            CONFORME
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumo Geral dos 5 Sensos */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {FIVE_S_SENSES.map(sense => {
                  let total = sense.checklistItems.length;
                  let checked = 0;
                  sense.checklistItems.forEach((_, i) => {
                    if (checklistState[`${activeStreet}_${sense.id}_${i}`]) checked++;
                  });
                  const pct = Math.round((checked / total) * 100);

                  return (
                    <div key={sense.id} className="bg-slate-900/60 border border-white/5 rounded-xl p-2.5">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="text-slate-400 font-bold">{sense.num}</span>
                        <span className={pct === 100 ? 'text-emerald-400 font-black' : 'text-slate-400'}>
                          {checked}/{total}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${sense.gradient}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer com Botões de Ação */}
            <div className="p-4 bg-slate-900/90 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Marcar Todos Conformes
                </button>
                <button
                  type="button"
                  onClick={handleResetChecklist}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  Limpar
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-300 hover:bg-white/10 transition-all cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAudit}
                  className="px-5 py-2 rounded-xl text-xs font-bold font-mono bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Award size={15} />
                  <span>SALVAR AUDITORIA DA RUA ({currentAuditScore}%)</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default FiveSVisualReminder;
