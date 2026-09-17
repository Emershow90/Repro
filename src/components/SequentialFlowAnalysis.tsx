/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  GitCommit, 
  ArrowRight, 
  ArrowLeft, 
  RotateCcw, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Footprints, 
  Clock, 
  Zap, 
  ShieldAlert, 
  Shuffle, 
  Award, 
  Sparkles,
  Info,
  MapPin,
  ListOrdered
} from 'lucide-react';
import { ArticleAddressRecord } from '../services/articleAddressService';
import { ALL_CONFIGURED_STREETS } from '../data/streetData';

interface SequentialFlowAnalysisProps {
  records: ArticleAddressRecord[];
  onNotify?: (msg: string, color?: string) => void;
}

// Auxiliar para extrair a baia numérica de um endereço
function extractBayNumber(address: string): number {
  if (!address) return 0;
  const match = address.match(/[-_ ](\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  const digits = address.replace(/\D/g, '');
  if (digits.length >= 2) {
    return parseInt(digits.slice(-2), 10);
  }
  return 1;
}

export function SequentialFlowAnalysis({
  records,
  onNotify
}: SequentialFlowAnalysisProps) {
  const [selectedStreet, setSelectedStreet] = useState<string>('B4VD');
  const [filterDate, setFilterDate] = useState<string>('TODAS');

  // Lista de datas disponíveis
  const availableDates = useMemo(() => {
    const dates = Array.from(new Set(records.map(r => r.data).filter(Boolean)));
    return dates.sort().reverse();
  }, [records]);

  // Lista de ruas que possuem registros
  const streetsWithData = useMemo(() => {
    const set = new Set(records.map(r => r.rua.toUpperCase()));
    return ALL_CONFIGURED_STREETS.filter(s => set.has(s.toUpperCase()));
  }, [records]);

  // Registros filtrados pela rua e data selecionadas
  const flowRecords = useMemo(() => {
    let list = records.filter(r => r.rua.toUpperCase() === selectedStreet.toUpperCase());
    if (filterDate !== 'TODAS') {
      list = list.filter(r => r.data === filterDate);
    }
    // Ordena pela ordem cronológica de registro (hora ou criadoEm)
    return list.sort((a, b) => {
      if (a.hora && b.hora && a.hora !== b.hora) {
        return a.hora.localeCompare(b.hora);
      }
      return (a.criadoEm || 0) - (b.criadoEm || 0);
    });
  }, [records, selectedStreet, filterDate]);

  // Análise Algorítmica do Fluxo Sequencial
  const flowAnalysis = useMemo(() => {
    if (flowRecords.length < 2) {
      return {
        steps: flowRecords.map((r, idx) => ({
          step: idx + 1,
          record: r,
          bay: extractBayNumber(r.endereco),
          delta: 0,
          isBacktrack: false,
          isLongJump: false
        })),
        totalBacktracks: 0,
        totalDistanceBays: 0,
        optimalDistanceBays: 0,
        efficiencyScore: 100,
        estimatedMetersWalked: 0,
        estimatedMetersOptimal: 0,
        metersSaved: 0,
        backtrackPoints: []
      };
    }

    const steps = [];
    let totalBacktracks = 0;
    let totalDistanceBays = 0;
    const backtrackPoints: { from: string; to: string; bayDiff: number; step: number }[] = [];

    const METERS_PER_BAY = 1.8; // Distância média entre módulos no CD solo

    for (let i = 0; i < flowRecords.length; i++) {
      const current = flowRecords[i];
      const currentBay = extractBayNumber(current.endereco);

      if (i === 0) {
        steps.push({
          step: 1,
          record: current,
          bay: currentBay,
          delta: 0,
          isBacktrack: false,
          isLongJump: false
        });
        continue;
      }

      const prev = flowRecords[i - 1];
      const prevBay = extractBayNumber(prev.endereco);
      const delta = currentBay - prevBay;
      const absDist = Math.abs(delta);
      totalDistanceBays += absDist;

      // Retrocesso: operador foi para trás na rua
      const isBacktrack = delta < 0;
      // Salto longo: pulou mais de 5 baias sem atender o meio
      const isLongJump = absDist > 5;

      if (isBacktrack) {
        totalBacktracks++;
        backtrackPoints.push({
          from: prev.endereco,
          to: current.endereco,
          bayDiff: absDist,
          step: i + 1
        });
      }

      steps.push({
        step: i + 1,
        record: current,
        bay: currentBay,
        delta,
        isBacktrack,
        isLongJump
      });
    }

    // Calcula a rota sequencial ótima (se o operador abastecesse em ordem estritamente crescente)
    const sortedBays = Array.from(new Set(flowRecords.map(r => extractBayNumber(r.endereco)))).sort((a, b) => a - b);
    let optimalDistanceBays = 0;
    if (sortedBays.length > 1) {
      optimalDistanceBays = sortedBays[sortedBays.length - 1] - sortedBays[0];
    }

    // Índice de Eficiência: Distância Ótima / Distância Real
    let efficiencyScore = 100;
    if (totalDistanceBays > 0 && optimalDistanceBays > 0) {
      efficiencyScore = Math.max(15, Math.min(100, Math.round((optimalDistanceBays / totalDistanceBays) * 100)));
    } else if (totalDistanceBays === 0) {
      efficiencyScore = 100;
    }

    const estimatedMetersWalked = Math.round(totalDistanceBays * METERS_PER_BAY);
    const estimatedMetersOptimal = Math.round(optimalDistanceBays * METERS_PER_BAY);
    const metersSaved = Math.max(0, estimatedMetersWalked - estimatedMetersOptimal);

    return {
      steps,
      totalBacktracks,
      totalDistanceBays,
      optimalDistanceBays,
      efficiencyScore,
      estimatedMetersWalked,
      estimatedMetersOptimal,
      metersSaved,
      backtrackPoints
    };
  }, [flowRecords]);

  // Rota Sequencial Sugerida (Ordem recomendada para a rua)
  const suggestedOptimalRoute = useMemo(() => {
    // Agrupa registros pelos endereços e ordena numericamente pela baia
    const grouped = new Map<string, { address: string; bay: number; totalCtn: number; articles: string[] }>();

    flowRecords.forEach(r => {
      const bay = extractBayNumber(r.endereco);
      if (!grouped.has(r.endereco)) {
        grouped.set(r.endereco, {
          address: r.endereco,
          bay,
          totalCtn: 0,
          articles: []
        });
      }
      const item = grouped.get(r.endereco)!;
      item.totalCtn += Number(r.ctn) || 0;
      if (!item.articles.includes(r.artigo)) {
        item.articles.push(r.artigo);
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.bay - b.bay);
  }, [flowRecords]);

  // Determina cor do score de eficiência
  const getEfficiencyBadge = (score: number) => {
    if (score >= 85) {
      return {
        label: 'FLUXO LINEAR EXCELENTE',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        desc: 'Operador seguiu o corredor sequencialmente com mínimo deslocamento vazio.'
      };
    }
    if (score >= 65) {
      return {
        label: 'FLUXO MODERADO (COM SALTOS)',
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        desc: 'Houve alguns saltos de posições, mas sem retrocessos severos.'
      };
    }
    return {
      label: 'ALERTA DE RETROCESSO (BACKTRACKING)',
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      desc: 'Muitas idas e vindas no corredor. Fadiga desnecessária e perda de VPH.'
    };
  };

  const badgeInfo = getEfficiencyBadge(flowAnalysis.efficiencyScore);

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl space-y-5 animate-in fade-in duration-200">
      {/* -----------------------------------------------------------------
          1. HEADER & CONTROLES
          ----------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <GitCommit size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase font-mono flex items-center gap-2">
              <span>ANÁLISE DE FLUXO SEQUENCIAL DE REABASTECIMENTO</span>
              <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono text-xs border border-indigo-500/30">
                Rua {selectedStreet}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Avaliação de linearidade de percurso, detecção de retrocessos e otimização de deslocamento no corredor
            </p>
          </div>
        </div>

        {/* Filtros de Rua e Data */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Rua */}
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-[11px] font-mono text-slate-400">Rua:</span>
            <select
              value={selectedStreet}
              onChange={(e) => setSelectedStreet(e.target.value)}
              className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {streetsWithData.map(st => (
                <option key={st} value={st} className="bg-slate-900 text-white">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Data */}
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-[11px] font-mono text-slate-400">Data:</span>
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="TODAS" className="bg-slate-900 text-white">Todas as datas</option>
              {availableDates.map(dt => (
                <option key={dt} value={dt} className="bg-slate-900 text-white">
                  {dt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          2. DASHBOARD DE EFICIÊNCIA DE FLUXO E RETROCESSO
          ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* KPI 1: Índice de Eficiência */}
        <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase font-semibold">Eficiência de Fluxo</span>
            <Zap size={16} className={flowAnalysis.efficiencyScore >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black font-mono ${
              flowAnalysis.efficiencyScore >= 80 ? 'text-emerald-400' : flowAnalysis.efficiencyScore >= 65 ? 'text-blue-400' : 'text-rose-400'
            }`}>
              {flowAnalysis.efficiencyScore}%
            </span>
            <span className="text-xs text-slate-400 font-mono">índice de rota</span>
          </div>
          <div className={`text-[10px] font-mono font-bold mt-2 px-2 py-0.5 rounded border inline-block ${badgeInfo.color}`}>
            {badgeInfo.label}
          </div>
        </div>

        {/* KPI 2: Retrocessos no Corredor */}
        <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase font-semibold">Retrocessos (Backtracking)</span>
            <RotateCcw size={16} className={flowAnalysis.totalBacktracks === 0 ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black font-mono ${
              flowAnalysis.totalBacktracks === 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {flowAnalysis.totalBacktracks}
            </span>
            <span className="text-xs text-slate-400 font-mono">vezes andou para trás</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {flowAnalysis.totalBacktracks === 0 
              ? 'Nenhum retrocesso no corredor!' 
              : 'Idas e vindas aumentam o cansaço do operador.'}
          </p>
        </div>

        {/* KPI 3: Deslocamento Estimado a Pé */}
        <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase font-semibold">Caminhada Estimada</span>
            <Footprints size={16} className="text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">
              {flowAnalysis.estimatedMetersWalked}m
            </span>
            <span className="text-xs text-slate-400 font-mono">percorridos</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Rota ótima seria de <strong>{flowAnalysis.estimatedMetersOptimal}m</strong>
          </p>
        </div>

        {/* KPI 4: Economia Potencial */}
        <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase font-semibold">Economia com Fluxo Sequencial</span>
            <TrendingUp size={16} className="text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-purple-400">
              -{flowAnalysis.metersSaved}m
            </span>
            <span className="text-xs text-slate-400 font-mono">menos passos</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Redução de tempo vazio e aumento direto do VPH.
          </p>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          3. GRÁFICO VISUAL DA TRAJETÓRIA (REAL VS ÓTIMA)
          ----------------------------------------------------------------- */}
      <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
          <div>
            <h3 className="text-xs font-black text-white font-mono uppercase flex items-center gap-2">
              <TrendingUp size={15} className="text-indigo-400" />
              <span>Gráfico de Trajetória: Posição Física da Baia x Ordem do Bipe</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Uma curva ascendente contínua representa o fluxo ideal. Picos seguidos de quedas bruscas indicam ziguezague.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-indigo-500 rounded" />
              <span className="text-slate-300">Trajetória Real</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-emerald-500/60 rounded border-dashed" />
              <span className="text-slate-400">Fluxo Ótimo Sequencial</span>
            </div>
          </div>
        </div>

        {flowAnalysis.steps.length <= 1 ? (
          <div className="py-10 text-center text-xs text-slate-500 font-mono">
            Poucos registros na rua {selectedStreet} para traçar a trajetória (mínimo 2 bipes).
          </div>
        ) : (
          <div className="relative pt-6 pb-2 px-2">
            {/* Altura do Gráfico de Trajetória */}
            <div className="h-44 w-full relative flex items-end justify-between border-b border-white/10">
              {/* Linhas de Grade de Fundo */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-b border-white w-full" />
                <div className="border-b border-white w-full" />
                <div className="border-b border-white w-full" />
                <div className="border-b border-white w-full" />
              </div>

              {/* Colunas do Gráfico de Pontos */}
              {flowAnalysis.steps.map((st, idx) => {
                const maxBayInStreet = Math.max(...flowAnalysis.steps.map(s => s.bay), 20);
                const heightPct = Math.max(12, Math.min(95, Math.round((st.bay / maxBayInStreet) * 100)));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    {/* Tooltip Hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                      <div className="bg-slate-900 border border-white/20 text-white text-[10px] font-mono p-2 rounded-xl shadow-xl whitespace-nowrap">
                        <div className="font-bold text-cyan-400">Passo #{st.step}: {st.record.endereco}</div>
                        <div>Baia: {st.bay} • {st.record.ctn} cx</div>
                        <div>Artigo: {st.record.artigo}</div>
                        {st.isBacktrack && (
                          <div className="text-rose-400 font-bold mt-0.5">⚠️ Retrocesso de {Math.abs(st.delta)} baias</div>
                        )}
                      </div>
                    </div>

                    {/* Linha / Ponto */}
                    <div
                      className={`w-3.5 sm:w-5 rounded-t-lg transition-all flex flex-col items-center justify-start pt-1 ${
                        st.isBacktrack 
                          ? 'bg-gradient-to-t from-rose-600 to-rose-400 shadow-md shadow-rose-500/30' 
                          : 'bg-gradient-to-t from-indigo-600 to-cyan-400 shadow-md shadow-cyan-500/20'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    >
                      <span className="text-[8px] font-mono font-black text-white">
                        {st.bay}
                      </span>
                    </div>

                    {/* Ordem do Bipe (Passo) */}
                    <div className="text-[9px] font-mono text-slate-400 mt-1">
                      #{st.step}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* -----------------------------------------------------------------
          4. TRILHA PASSO A PASSO DA SEQUÊNCIA DE REGISTROS
          ----------------------------------------------------------------- */}
      <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
          <h3 className="text-xs font-black text-white font-mono uppercase flex items-center gap-2">
            <ListOrdered size={15} className="text-cyan-400" />
            <span>Trilha Cronológica de Reabastecimento (Ordem Real de Bipagem)</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            {flowAnalysis.steps.length} paradas no corredor
          </span>
        </div>

        <div className="space-y-2 overflow-x-auto">
          {flowAnalysis.steps.map((st, idx) => {
            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
                  st.isBacktrack 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' 
                    : 'bg-slate-900/60 border-white/5 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    {st.step}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-white text-sm">
                        {st.record.endereco}
                      </span>
                      <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-slate-300">
                        Baia {st.bay}
                      </span>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {st.record.ctn} caixas
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Artigo: <strong className="text-slate-200">{st.record.artigo}</strong> • {st.record.hora || '--:--'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {st.step === 1 ? (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      INÍCIO DA ROTA
                    </span>
                  ) : st.isBacktrack ? (
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400 bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/30">
                      <ArrowLeft size={13} />
                      <span>RETROCESSO ({st.delta} baias)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      <ArrowRight size={13} />
                      <span>Avanço (+{st.delta} baias)</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* -----------------------------------------------------------------
          5. ROTA SEQUENCIAL SUGERIDA (ORDEM PERFEITA DE REABASTECIMENTO)
          ----------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/50 border border-indigo-500/20 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-white font-mono uppercase">
                ROTA SEQUENCIAL ÓTIMA RECOMENDADA
              </h3>
              <p className="text-[11px] text-slate-400">
                Ordem linear ideal para visitar os endereços com carga sem gerar passos desnecessários
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            100% Linear
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {suggestedOptimalRoute.map((item, idx) => (
            <div key={item.address} className="bg-slate-900/80 border border-white/10 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[10px] flex items-center justify-center">
                  #{idx + 1}
                </span>
                <div>
                  <div className="text-xs font-mono font-black text-white">
                    {item.address}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {item.articles[0]}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-cyan-400">
                  {item.totalCtn} cx
                </div>
                <div className="text-[9px] font-mono text-slate-500">
                  Baia {item.bay}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SequentialFlowAnalysis;
