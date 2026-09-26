/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  MapPin, 
  Layers, 
  Box, 
  Search, 
  Filter, 
  ArrowRight, 
  ArrowDown, 
  ArrowUp,
  Maximize2, 
  Grid, 
  Columns, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  Info,
  Calendar,
  Sparkles,
  TrendingUp,
  Clock,
  User,
  X
} from 'lucide-react';
import { ArticleAddressRecord } from '../services/articleAddressService';
import { ALL_CONFIGURED_STREETS, SECTOR_STREET_GROUPS } from '../data/streetData';

interface AddressMapVisualizerProps {
  records: ArticleAddressRecord[];
  selectedDate?: string;
  onSelectAddress?: (address: string) => void;
  onNotify?: (msg: string, color?: string) => void;
}

// Auxiliar para extrair a baia numérica de um endereço (ex: "B4VD-07" -> 7, "B4VD-18" -> 18)
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

export function AddressMapVisualizer({
  records,
  selectedDate,
  onSelectAddress,
  onNotify
}: AddressMapVisualizerProps) {
  const [activeStreet, setActiveStreet] = useState<string>('B4VD');
  const [layoutMode, setLayoutMode] = useState<'corredor' | 'grade'>('corredor');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{
    address: string;
    bayNum: number;
    records: ArticleAddressRecord[];
  } | null>(null);

  // Lista de ruas com base nos registros e nas ruas configuradas
  const streetsWithData = useMemo(() => {
    const streetsSet = new Set<string>();
    records.forEach(r => {
      if (r.rua) streetsSet.add(r.rua.toUpperCase());
    });
    return ALL_CONFIGURED_STREETS.map(st => ({
      name: st,
      hasData: streetsSet.has(st.toUpperCase()),
      count: records.filter(r => r.rua.toUpperCase() === st.toUpperCase()).length
    }));
  }, [records]);

  // Registros específicos da rua ativa
  const streetRecords = useMemo(() => {
    return records.filter(r => r.rua.toUpperCase() === activeStreet.toUpperCase());
  }, [records, activeStreet]);

  // Determina o alcance de baias da rua (pelo menos 20 baias, ou a maior baia encontrada + margem)
  const maxBay = useMemo(() => {
    let max = 20;
    streetRecords.forEach(r => {
      const bay = extractBayNumber(r.endereco);
      if (bay > max) max = bay;
    });
    // Arredonda para número par
    return max % 2 === 0 ? max : max + 1;
  }, [streetRecords]);

  // Agrupa registros por baia numérica
  const bayMap = useMemo(() => {
    const map: Record<number, ArticleAddressRecord[]> = {};
    for (let i = 1; i <= maxBay; i++) {
      map[i] = [];
    }

    streetRecords.forEach(r => {
      const bay = extractBayNumber(r.endereco);
      if (!map[bay]) map[bay] = [];
      map[bay].push(r);
    });

    return map;
  }, [streetRecords, maxBay]);

  // Métricas da Rua Ativa
  const streetStats = useMemo(() => {
    const occupiedBays = Object.keys(bayMap).filter(bay => (bayMap[Number(bay)] || []).length > 0).length;
    const totalCtn = streetRecords.reduce((acc, r) => acc + (Number(r.ctn) || 0), 0);
    const uniqueArticles = new Set(streetRecords.map(r => r.artigo.toUpperCase())).size;
    const occupancyRate = maxBay > 0 ? Math.round((occupiedBays / maxBay) * 100) : 0;

    // Encontra baia com maior carga
    let highestBay = 0;
    let highestCtn = 0;
    Object.entries(bayMap).forEach(([bay, recs]) => {
      const ctnSum = recs.reduce((acc, r) => acc + (Number(r.ctn) || 0), 0);
      if (ctnSum > highestCtn) {
        highestCtn = ctnSum;
        highestBay = Number(bay);
      }
    });

    return {
      occupiedBays,
      totalBays: maxBay,
      totalCtn,
      uniqueArticles,
      occupancyRate,
      highestBay,
      highestCtn
    };
  }, [bayMap, streetRecords, maxBay]);

  // Renderiza a cor do heatmap baseado no volume de CTN
  const getBayColorClasses = (ctnTotal: number, hasConflict: boolean, isSelected: boolean) => {
    if (isSelected) {
      return 'border-cyan-400 bg-cyan-500/20 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/30';
    }
    if (hasConflict) {
      return 'border-amber-500/60 bg-amber-500/15 text-amber-200 animate-pulse';
    }
    if (ctnTotal === 0) {
      return 'border-white/5 bg-slate-900/40 text-slate-500 hover:border-white/20 hover:bg-slate-800/40';
    }
    if (ctnTotal <= 10) {
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400';
    }
    if (ctnTotal <= 25) {
      return 'border-blue-500/50 bg-blue-500/15 text-blue-300 hover:border-blue-400';
    }
    if (ctnTotal <= 50) {
      return 'border-purple-500/60 bg-purple-500/20 text-purple-200 hover:border-purple-400';
    }
    return 'border-rose-500/60 bg-rose-500/20 text-rose-200 hover:border-rose-400';
  };

  // Separação Lado Ímpar (Esquerda) e Lado Par (Direita) para o Corredor
  const oddBays = useMemo(() => {
    const list: number[] = [];
    for (let i = 1; i <= maxBay; i += 2) {
      list.push(i);
    }
    return list;
  }, [maxBay]);

  const evenBays = useMemo(() => {
    const list: number[] = [];
    for (let i = 2; i <= maxBay; i += 2) {
      list.push(i);
    }
    return list;
  }, [maxBay]);

  // Selecionar baia
  const handleSelectSlot = (bayNum: number) => {
    const formattedNum = String(bayNum).padStart(2, '0');
    const address = `${activeStreet}-${formattedNum}`;
    const slotRecords = bayMap[bayNum] || [];
    
    setSelectedSlot({
      address,
      bayNum,
      records: slotRecords
    });

    if (onSelectAddress) {
      onSelectAddress(address);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
      {/* -----------------------------------------------------------------
          1. HEADER & CONTROLES DO MAPEAMENTO
          ----------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              <MapPin size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase font-mono flex items-center gap-2">
                <span>MAPEAMENTO VISUAL DE ENDEREÇOS (LAYOUT 2D)</span>
                <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono text-xs border border-cyan-500/30">
                  Rua {activeStreet}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Visualização espacial do corredor, mapa de calor de CTN e alocação física de artigos
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Modo (Corredor vs Grade) e Seletor de Rua */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Rua */}
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-[11px] font-mono text-slate-400">Rua:</span>
            <select
              value={activeStreet}
              onChange={(e) => {
                setActiveStreet(e.target.value);
                setSelectedSlot(null);
              }}
              className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {streetsWithData.map(st => (
                <option key={st.name} value={st.name} className="bg-slate-900 text-white">
                  {st.name} {st.hasData ? `(${st.count})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Alternador de Layout */}
          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setLayoutMode('corredor')}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                layoutMode === 'corredor'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Visualizar como Corredor Bilateral (Lado Ímpar / Trânsito / Lado Par)"
            >
              <Columns size={13} />
              <span>Corredor Bilateral</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grade')}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                layoutMode === 'grade'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Visualizar em Grade Linear Contínua"
            >
              <Grid size={13} />
              <span>Grade Linear</span>
            </button>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          2. CARDS DE MÉTRICAS DA RUA SELECIONADA
          ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Ocupação da Rua</div>
          <div className="text-xl font-mono font-black text-white mt-0.5">
            {streetStats.occupancyRate}%
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {streetStats.occupiedBays} de {streetStats.totalBays} baias
          </div>
        </div>

        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Total de Caixas (CTN)</div>
          <div className="text-xl font-mono font-black text-cyan-400 mt-0.5">
            {streetStats.totalCtn} cx
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            nesta rua
          </div>
        </div>

        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Artigos Distintos</div>
          <div className="text-xl font-mono font-black text-purple-400 mt-0.5">
            {streetStats.uniqueArticles}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            variedade alocada
          </div>
        </div>

        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Ponto de Maior Carga</div>
          <div className="text-xl font-mono font-black text-amber-400 mt-0.5">
            {streetStats.highestCtn > 0 ? `Baia ${streetStats.highestBay}` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {streetStats.highestCtn > 0 ? `${streetStats.highestCtn} caixas concentradas` : 'Sem registros'}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-slate-950/60 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Status Operacional</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-emerald-400">Rua Mapeada</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Solo Setor {activeStreet.startsWith('B4') ? '87' : '88+'}
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          3. LEGENDA DE CORES DO MAPA DE CALOR
          ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/40 border border-white/5 text-[11px] font-mono">
        <div className="text-slate-400 flex items-center gap-1.5">
          <Info size={13} className="text-cyan-400" />
          <span>Legenda de Carga por Baia:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-white/10 bg-slate-900/60" />
            <span className="text-slate-500">Vazio (0 cx)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-emerald-500/50 bg-emerald-500/20" />
            <span className="text-emerald-300">1 a 10 cx</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-blue-500/50 bg-blue-500/20" />
            <span className="text-blue-300">11 a 25 cx</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-purple-500/50 bg-purple-500/20" />
            <span className="text-purple-300">26 a 50 cx</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-rose-500/50 bg-rose-500/20" />
            <span className="text-rose-300">&gt; 50 cx</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-amber-500/60 bg-amber-500/30 animate-pulse" />
            <span className="text-amber-300">Alerta (Conflito)</span>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          4. LAYOUT 2D: CORREDOR BILATERAL OU GRADE LINEAR
          ----------------------------------------------------------------- */}
      {layoutMode === 'corredor' ? (
        <div className="relative border border-white/10 rounded-2xl p-4 bg-slate-950/80 overflow-x-auto">
          {/* Marcador de Início da Rua */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3 border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">INÍCIO DA RUA</span>
              <ArrowRight size={14} className="text-cyan-400" />
              <span>Entrada do Corredor (Baia 01/02)</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Fundo do Corredor (Baia {maxBay})</span>
              <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">FIM DA RUA</span>
            </div>
          </div>

          <div className="min-w-[800px] space-y-3">
            {/* LADO ESQUERDO: BAIAS ÍMPARES (01, 03, 05, 07...) */}
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="font-bold text-white">LADO ESQUERDO (ÍMPAR)</span>
                <span className="text-slate-500">— Posições 01, 03, 05...</span>
              </div>
              <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-14 lg:grid-cols-16 gap-1.5">
                {oddBays.map(bayNum => {
                  const recs = bayMap[bayNum] || [];
                  const ctnTotal = recs.reduce((acc, r) => acc + (Number(r.ctn) || 0), 0);
                  const hasConflict = recs.length > 1 && new Set(recs.map(r => r.artigo.toUpperCase())).size > 1;
                  const isSelected = selectedSlot?.bayNum === bayNum;
                  const formattedNum = String(bayNum).padStart(2, '0');
                  const address = `${activeStreet}-${formattedNum}`;

                  return (
                    <div
                      key={bayNum}
                      onClick={() => handleSelectSlot(bayNum)}
                      title={`${address} • ${ctnTotal} cx • ${recs.length} registro(s)`}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer select-none flex flex-col justify-between min-h-[72px] ${getBayColorClasses(
                        ctnTotal,
                        hasConflict,
                        isSelected
                      )}`}
                    >
                      <div className="text-[10px] font-mono font-bold opacity-80">
                        {formattedNum}
                      </div>
                      
                      <div className="my-1">
                        {ctnTotal > 0 ? (
                          <div className="text-xs font-mono font-black truncate">
                            {ctnTotal} cx
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-slate-600">
                            vazio
                          </div>
                        )}
                      </div>

                      <div className="text-[9px] font-mono truncate opacity-75">
                        {recs[0]?.artigo ? recs[0].artigo.replace('ART-', '') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CORREDOR CENTRAL DE PASSAGEM / TRÂNSITO DE OPERADORES & CARRINHOS */}
            <div className="relative h-12 bg-slate-900/90 rounded-xl border border-dashed border-amber-500/30 flex items-center justify-between px-6 select-none my-2 overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,#f59e0b,#f59e0b_10px,#000_10px,#000_20px)]" />
              <div className="relative flex items-center gap-2 text-amber-300 font-mono text-xs font-bold z-10">
                <ArrowRight size={16} className="animate-pulse" />
                <span>VIA DE CIRCULAÇÃO & REABASTECIMENTO</span>
              </div>
              <div className="relative text-[11px] font-mono text-slate-400 z-10 flex items-center gap-2">
                <span>Trânsito Livre de Carrinhos e Paleteiras</span>
                <ArrowRight size={16} className="text-amber-400" />
              </div>
            </div>

            {/* LADO DIREITO: BAIAS PARES (02, 04, 06, 08...) */}
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="font-bold text-white">LADO DIREITO (PAR)</span>
                <span className="text-slate-500">— Posições 02, 04, 06...</span>
              </div>
              <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-14 lg:grid-cols-16 gap-1.5">
                {evenBays.map(bayNum => {
                  const recs = bayMap[bayNum] || [];
                  const ctnTotal = recs.reduce((acc, r) => acc + (Number(r.ctn) || 0), 0);
                  const hasConflict = recs.length > 1 && new Set(recs.map(r => r.artigo.toUpperCase())).size > 1;
                  const isSelected = selectedSlot?.bayNum === bayNum;
                  const formattedNum = String(bayNum).padStart(2, '0');
                  const address = `${activeStreet}-${formattedNum}`;

                  return (
                    <div
                      key={bayNum}
                      onClick={() => handleSelectSlot(bayNum)}
                      title={`${address} • ${ctnTotal} cx • ${recs.length} registro(s)`}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer select-none flex flex-col justify-between min-h-[72px] ${getBayColorClasses(
                        ctnTotal,
                        hasConflict,
                        isSelected
                      )}`}
                    >
                      <div className="text-[10px] font-mono font-bold opacity-80">
                        {formattedNum}
                      </div>
                      
                      <div className="my-1">
                        {ctnTotal > 0 ? (
                          <div className="text-xs font-mono font-black truncate">
                            {ctnTotal} cx
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-slate-600">
                            vazio
                          </div>
                        )}
                      </div>

                      <div className="text-[9px] font-mono truncate opacity-75">
                        {recs[0]?.artigo ? recs[0].artigo.replace('ART-', '') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODO GRADE LINEAR (01 a MAX) */
        <div className="border border-white/10 rounded-2xl p-4 bg-slate-950/80">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {Array.from({ length: maxBay }, (_, i) => i + 1).map(bayNum => {
              const recs = bayMap[bayNum] || [];
              const ctnTotal = recs.reduce((acc, r) => acc + (Number(r.ctn) || 0), 0);
              const hasConflict = recs.length > 1 && new Set(recs.map(r => r.artigo.toUpperCase())).size > 1;
              const isSelected = selectedSlot?.bayNum === bayNum;
              const formattedNum = String(bayNum).padStart(2, '0');
              const address = `${activeStreet}-${formattedNum}`;

              return (
                <div
                  key={bayNum}
                  onClick={() => handleSelectSlot(bayNum)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between min-h-[85px] ${getBayColorClasses(
                    ctnTotal,
                    hasConflict,
                    isSelected
                  )}`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span>{formattedNum}</span>
                    <span className="text-[9px] opacity-60 font-mono">
                      {bayNum % 2 === 0 ? 'Par' : 'Ímp'}
                    </span>
                  </div>

                  <div className="my-1 text-center">
                    {ctnTotal > 0 ? (
                      <span className="text-sm font-mono font-black">
                        {ctnTotal} cx
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-600">
                        vazio
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] font-mono truncate text-center opacity-85">
                    {recs[0]?.artigo || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -----------------------------------------------------------------
          5. DETALHE DO ENDEREÇO CLICADO (DRAWER/CARD INFORMATIVO)
          ----------------------------------------------------------------- */}
      {selectedSlot && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center font-mono font-black text-sm">
                #{selectedSlot.bayNum}
              </div>
              <div>
                <h3 className="text-base font-black text-white font-mono flex items-center gap-2">
                  <span>{selectedSlot.address}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-300 font-mono">
                    Lado {selectedSlot.bayNum % 2 === 0 ? 'Direito (Par)' : 'Esquerdo (Ímpar)'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedSlot.records.length > 0 
                    ? `${selectedSlot.records.length} registro(s) associado(s) neste endereço` 
                    : 'Nenhum registro ou bipe cadastrado nesta baia'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSlot(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {selectedSlot.records.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 font-mono">
              Baia vazia no mapa de endereçamento de hoje.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {selectedSlot.records.map((rec, idx) => (
                <div key={rec.id || idx} className="bg-slate-900/80 border border-white/10 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                      {rec.artigo}
                    </span>
                    <span className="text-xs font-mono font-black text-cyan-400">
                      {rec.ctn} caixas
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <Clock size={12} className="text-slate-500" />
                    <span>{rec.hora || '--:--'} • {rec.data}</span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <User size={12} className="text-slate-500" />
                    <span className="truncate">{rec.colaborador || 'EMERSON GONÇALVES'}</span>
                  </div>

                  {rec.observacoes && (
                    <div className="text-[10px] text-slate-400 italic bg-black/30 p-1.5 rounded">
                      "{rec.observacoes}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AddressMapVisualizer;
