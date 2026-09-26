/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PAINEL DE DETALHAMENTO DO REABASTECIMENTO (RAIO-X OPERACIONAL 5.0)
 * Responde de forma imediata e cristalina:
 * 1. Quanto tempo (horas ou minutos) fiz o Reabastecimento? (Geral e por rua)
 * 2. Quantos endereços no geral ou por rua?
 * 3. Detalhamento minucioso do Reabastecimento (VPH, EPH, Demanda, Horários, Médias)
 */

import React, { useState, useMemo } from 'react';
import { 
  X, 
  Clock, 
  MapPin, 
  Box, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Layers, 
  Zap, 
  FileSpreadsheet, 
  Share2, 
  Calendar, 
  UserCheck, 
  ArrowUpRight,
  Filter,
  Flame,
  Award
} from 'lucide-react';
import { TelemetryPayload } from '../services/telemetryService';
import { SECTOR_STREET_GROUPS, inferSectorFromStreet } from '../data/streetData';

export interface StreetReplenishmentDetailItem {
  rua: string;
  setor: string;
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'PENDENTE';
  tempoSegundos: number;
  tempoFormatado: string;
  minutosTotais: number;
  enderecos: number;
  volumes: number;
  demanda: number;
  percentualConclusao: number;
  vph: string;
  eph: string;
  tempoMedioPorEnderecoFormatado: string;
  horario: string;
  operador?: string;
  unidade?: string;
}

interface ReplenishmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetryActive?: TelemetryPayload | null;
  onSelectStreet?: (streetName: string) => void;
}

export const ReplenishmentDetailsModal: React.FC<ReplenishmentDetailsModalProps> = ({
  isOpen,
  onClose,
  telemetryActive,
  onSelectStreet
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'tempo' | 'enderecos' | 'volumes' | 'rua'>('tempo');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Constrói o consolidado detalhado rua a rua
  const detailedStreetItems = useMemo<StreetReplenishmentDetailItem[]>(() => {
    const items: StreetReplenishmentDetailItem[] = [];
    const active = telemetryActive;

    // 1. Rua Ativa (Ao Vivo)
    if (active && active.rua) {
      const tempoSec = active.tempoSegundos || 0;
      const minsTot = Math.round(tempoSec / 60);
      const h = Math.floor(tempoSec / 3600);
      const m = Math.floor((tempoSec % 3600) / 60);
      const s = tempoSec % 60;
      const formattedTime = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${String(s).padStart(2, '0')}s`;

      const endCount = active.enderecos || 0;
      const volCount = active.volumes || 0;
      const demCount = active.demanda || 60;
      const perc = Math.min(100, Math.round((volCount / demCount) * 100));

      const avgSecPerEnd = endCount > 0 ? Math.round(tempoSec / endCount) : 0;
      const avgMins = Math.floor(avgSecPerEnd / 60);
      const avgSecs = avgSecPerEnd % 60;
      const avgFormatted = endCount > 0 ? `${avgMins}m ${String(avgSecs).padStart(2, '0')}s` : '0m 00s';

      items.push({
        rua: active.rua,
        setor: active.setor || inferSectorFromStreet(active.rua),
        status: active.status === 'CONCLUIDO' ? 'CONCLUIDA' : 'EM_ANDAMENTO',
        tempoSegundos: tempoSec,
        tempoFormatado: formattedTime,
        minutosTotais: minsTot,
        enderecos: endCount,
        volumes: volCount,
        demanda: demCount,
        percentualConclusao: perc,
        vph: active.vph || (tempoSec > 10 ? ((volCount / tempoSec) * 3600).toFixed(1) : '0.0'),
        eph: active.eph || (tempoSec > 10 ? ((endCount / tempoSec) * 3600).toFixed(1) : '0.0'),
        tempoMedioPorEnderecoFormatado: avgFormatted,
        horario: 'Agora (Ao Vivo)',
        operador: active.operador,
        unidade: active.unidade || 'CAIXAS'
      });
    }

    // 2. Ruas do Histórico de Hoje
    if (active?.historicoHoje && Array.isArray(active.historicoHoje)) {
      for (const h of active.historicoHoje) {
        // Evita duplicar se a rua do histórico tiver o mesmo nome da ativa no mesmo momento
        if (items.some(it => it.rua === h.rua && it.status === 'EM_ANDAMENTO')) continue;

        const vol = h.volumes || 0;
        const end = h.enderecos || Math.max(1, Math.round(vol / 2.3));
        const sec = h.tempoSegundos || (h.tempoMinutos ? h.tempoMinutos * 60 : Math.round((vol / 45) * 3600));
        const minsTot = Math.round(sec / 60);
        const hours = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

        const avgSec = end > 0 ? Math.round(sec / end) : 0;
        const avgM = Math.floor(avgSec / 60);
        const avgS = avgSec % 60;
        const avgFormatted = `${avgM}m ${String(avgS).padStart(2, '0')}s`;

        items.push({
          rua: h.rua,
          setor: h.setor || inferSectorFromStreet(h.rua),
          status: 'CONCLUIDA',
          tempoSegundos: sec,
          tempoFormatado: formatted,
          minutosTotais: minsTot,
          enderecos: end,
          volumes: vol,
          demanda: vol, // Demanda atendida
          percentualConclusao: 100,
          vph: h.vph || (sec > 0 ? ((vol / sec) * 3600).toFixed(1) : '45.0'),
          eph: h.eph || (sec > 0 ? ((end / sec) * 3600).toFixed(1) : '20.0'),
          tempoMedioPorEnderecoFormatado: avgFormatted,
          horario: h.horario || 'Turno Hoje',
          operador: active?.operador,
          unidade: active?.unidade || 'CAIXAS'
        });
      }
    }

    return items;
  }, [telemetryActive]);

  // Cálculos Consolidados Gerais do Reabastecimento (Respondendo "Quanto tempo fiz?" e "Quantos endereços geral?")
  const totals = useMemo(() => {
    let totalSegundos = 0;
    let totalEnderecos = 0;
    let totalVolumes = 0;

    for (const it of detailedStreetItems) {
      totalSegundos += it.tempoSegundos;
      totalEnderecos += it.enderecos;
      totalVolumes += it.volumes;
    }

    const totalHoras = Math.floor(totalSegundos / 3600);
    const totalMinutos = Math.floor((totalSegundos % 3600) / 60);
    const totalMinutosDiretos = Math.round(totalSegundos / 60);
    const totalTempoFormatado = totalHoras > 0 
      ? `${totalHoras}h ${totalMinutos}m` 
      : `${totalMinutosDiretos} min`;

    const vphGeral = totalSegundos > 0 ? ((totalVolumes / totalSegundos) * 3600).toFixed(1) : '0.0';
    const ephGeral = totalSegundos > 0 ? ((totalEnderecos / totalSegundos) * 3600).toFixed(1) : '0.0';

    const avgSecPorEndGeral = totalEnderecos > 0 ? Math.round(totalSegundos / totalEnderecos) : 0;
    const avgMinGeral = Math.floor(avgSecPorEndGeral / 60);
    const avgSecGeral = avgSecPorEndGeral % 60;
    const ritmoMedioFormatado = totalEnderecos > 0 ? `${avgMinGeral}m ${String(avgSecGeral).padStart(2, '0')}s` : '0m 00s';

    const mediaVolumesPorEndereco = totalEnderecos > 0 ? (totalVolumes / totalEnderecos).toFixed(1) : '0.0';

    return {
      totalSegundos,
      totalHoras,
      totalMinutos,
      totalMinutosDiretos,
      totalTempoFormatado,
      totalEnderecos,
      totalVolumes,
      vphGeral,
      ephGeral,
      ritmoMedioFormatado,
      mediaVolumesPorEndereco,
      ruasConcluidasCount: detailedStreetItems.filter(i => i.status === 'CONCLUIDA').length,
      ruasEmAndamentoCount: detailedStreetItems.filter(i => i.status === 'EM_ANDAMENTO').length
    };
  }, [detailedStreetItems]);

  // Filtragem e Ordenação da Tabela
  const filteredAndSortedItems = useMemo(() => {
    return detailedStreetItems
      .filter(item => {
        const matchesSearch = item.rua.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              item.setor.includes(searchTerm);
        const matchesSector = selectedSectorFilter === 'TODOS' || item.setor === selectedSectorFilter;
        return matchesSearch && matchesSector;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'tempo') diff = b.tempoSegundos - a.tempoSegundos;
        else if (sortBy === 'enderecos') diff = b.enderecos - a.enderecos;
        else if (sortBy === 'volumes') diff = b.volumes - a.volumes;
        else if (sortBy === 'rua') diff = a.rua.localeCompare(b.rua);

        return sortDirection === 'desc' ? diff : -diff;
      });
  }, [detailedStreetItems, searchTerm, selectedSectorFilter, sortBy, sortDirection]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-fade-in font-mono">
      <div className="bg-slate-950 border-2 border-emerald-500/40 w-full max-w-5xl rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.25)] flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* HEADER DO MODAL */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-950 to-emerald-950/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Clock size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-xl font-black text-white tracking-wide uppercase">
                  Detalhamento do Reabastecimento
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Raio-X em Tempo Real
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Operador: <strong className="text-white">{telemetryActive?.operador || 'Operador Padrão'}</strong> • Turno Ativo • Armazém Logístico
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* CORPO DO DETALHAMENTO */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">

          {/* 1. RESPOSTAS DIRETAS ÀS DÚVIDAS DO USUÁRIO (CARDS HERO DE ALTO IMPACTO) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* CARD 1: QUANTO TEMPO FIZ O REABASTECIMENTO? */}
            <div className="bg-gradient-to-br from-emerald-950/50 to-slate-900/80 border-2 border-emerald-500/40 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-2 right-2 text-emerald-500/10 group-hover:text-emerald-500/20 transition-all">
                <Clock size={48} />
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">
                <span>Tempo de Reabastecimento</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">Total</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1.5">
                <span>{totals.totalTempoFormatado}</span>
                <span className="text-xs text-emerald-400/80 font-normal">({totals.totalMinutosDiretos} min)</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-2 flex items-center justify-between border-t border-emerald-500/20 pt-1.5">
                <span className="text-slate-400">Rua em andamento:</span>
                <strong className="text-emerald-300">
                  {telemetryActive ? `${Math.floor((telemetryActive.tempoSegundos || 0) / 60)} min` : '0 min'}
                </strong>
              </div>
            </div>

            {/* CARD 2: QUANTOS ENDEREÇOS GERAL OU POR RUA? */}
            <div className="bg-gradient-to-br from-cyan-950/50 to-slate-900/80 border-2 border-cyan-500/40 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-2 right-2 text-cyan-500/10 group-hover:text-cyan-500/20 transition-all">
                <MapPin size={48} />
              </div>
              <div className="flex items-center justify-between text-xs text-cyan-400 font-bold uppercase tracking-wider mb-1">
                <span>Endereços Atendidos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">Geral</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1.5">
                <span>{totals.totalEnderecos}</span>
                <span className="text-xs text-cyan-300 font-normal">endereços</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-2 flex items-center justify-between border-t border-cyan-500/20 pt-1.5">
                <span className="text-slate-400">Rua atual:</span>
                <strong className="text-cyan-300">{telemetryActive?.enderecos || 0} endereços</strong>
              </div>
            </div>

            {/* CARD 3: VOLUMES TOTAIS REABASTECIDOS */}
            <div className="bg-gradient-to-br from-purple-950/50 to-slate-900/80 border-2 border-purple-500/40 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-2 right-2 text-purple-500/10 group-hover:text-purple-500/20 transition-all">
                <Box size={48} />
              </div>
              <div className="flex items-center justify-between text-xs text-purple-400 font-bold uppercase tracking-wider mb-1">
                <span>Volumes Reabastecidos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">Total</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1.5">
                <span>{totals.totalVolumes}</span>
                <span className="text-xs text-purple-300 font-normal">{telemetryActive?.unidade?.toLowerCase() || 'caixas'}</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-2 flex items-center justify-between border-t border-purple-500/20 pt-1.5">
                <span className="text-slate-400">Média / Endereço:</span>
                <strong className="text-purple-300">{totals.mediaVolumesPorEndereco} cx/end</strong>
              </div>
            </div>

            {/* CARD 4: PRODUTIVIDADE & VELOCIDADE (VPH & EPH) */}
            <div className="bg-gradient-to-br from-amber-950/50 to-slate-900/80 border-2 border-amber-500/40 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-2 right-2 text-amber-500/10 group-hover:text-amber-500/20 transition-all">
                <Zap size={48} />
              </div>
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider mb-1">
                <span>Velocidade & Ritmo</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">Eficiência</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                <span className="text-amber-300">{totals.vphGeral} <span className="text-xs font-normal text-slate-400">VPH</span></span>
                <span className="text-slate-500">•</span>
                <span className="text-cyan-300">{totals.ephGeral} <span className="text-xs font-normal text-slate-400">EPH</span></span>
              </div>
              <div className="text-[11px] text-slate-300 mt-2 flex items-center justify-between border-t border-amber-500/20 pt-1.5">
                <span className="text-slate-400">Ritmo / Endereço:</span>
                <strong className="text-amber-300">{totals.ritmoMedioFormatado}</strong>
              </div>
            </div>

          </div>

          {/* 2. BARRA DE CONTROLE: FILTROS POR SETOR, PESQUISA E ORDENAÇÃO */}
          <div className="bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
            
            {/* Filtros de Setor */}
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs text-slate-400 uppercase font-bold mr-1 shrink-0 flex items-center gap-1">
                <Filter size={12} /> Setor:
              </span>
              {['TODOS', '87', '88', '89', '90'].map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedSectorFilter(sec)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                    selectedSectorFilter === sec
                      ? 'bg-emerald-500 text-black shadow-md font-black'
                      : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {sec === 'TODOS' ? 'Todos os Setores' : `Setor ${sec}`}
                </button>
              ))}
            </div>

            {/* Busca por Rua e Ordenação */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-48">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar rua..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-white/15 text-slate-300 text-xs py-1.5 px-2.5 rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="tempo">Ordenar: Tempo Gasto</option>
                <option value="enderecos">Ordenar: Endereços</option>
                <option value="volumes">Ordenar: Volumes</option>
                <option value="rua">Ordenar: Nome da Rua</option>
              </select>

              <button
                onClick={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
                className="px-2.5 py-1.5 bg-slate-950 border border-white/15 text-slate-300 rounded-xl text-xs hover:text-white cursor-pointer"
                title="Inverter ordem"
              >
                {sortDirection === 'desc' ? '↓ Maior' : '↑ Menor'}
              </button>
            </div>

          </div>

          {/* 3. TABELA DETALHADA RUA POR RUA (O DETALHAMENTO DO REABASTECIMENTO) */}
          <div className="bg-slate-900/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="p-3.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-emerald-400" />
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  Detalhamento Individual por Rua ({filteredAndSortedItems.length} ruas)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                {totals.ruasConcluidasCount} concluídas • {totals.ruasEmAndamentoCount} ativa
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Rua / Setor</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Tempo Gasto</th>
                    <th className="py-2.5 px-3 text-right">Endereços</th>
                    <th className="py-2.5 px-3 text-right">Volumes (cx)</th>
                    <th className="py-2.5 px-3 text-right">Demanda / Meta</th>
                    <th className="py-2.5 px-3 text-right">Ritmo / Endereço</th>
                    <th className="py-2.5 px-3 text-right">VPH / EPH</th>
                    <th className="py-2.5 px-3 text-center">Horário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAndSortedItems.length > 0 ? (
                    filteredAndSortedItems.map((item) => {
                      const isCurrent = item.status === 'EM_ANDAMENTO';
                      return (
                        <tr 
                          key={item.rua}
                          onClick={() => onSelectStreet?.(item.rua)}
                          className={`hover:bg-white/5 transition-colors cursor-pointer ${
                            isCurrent ? 'bg-emerald-950/30' : ''
                          }`}
                        >
                          {/* RUA & SETOR */}
                          <td className="py-3 px-3 font-bold">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${isCurrent ? 'text-emerald-300 font-black' : 'text-white'}`}>
                                {item.rua}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-normal">
                                Setor {item.setor}
                              </span>
                            </div>
                          </td>

                          {/* STATUS */}
                          <td className="py-3 px-3">
                            {isCurrent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Ao Vivo
                              </span>
                            ) : item.status === 'CONCLUIDA' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                                <CheckCircle2 size={11} /> Concluída
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400">
                                Pendente
                              </span>
                            )}
                          </td>

                          {/* TEMPO GASTO */}
                          <td className="py-3 px-3 text-right font-black">
                            <span className={isCurrent ? 'text-emerald-300' : 'text-slate-200'}>
                              {item.tempoFormatado}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              ({item.minutosTotais} min)
                            </span>
                          </td>

                          {/* ENDEREÇOS */}
                          <td className="py-3 px-3 text-right">
                            <span className={`font-black text-sm ${isCurrent ? 'text-cyan-300' : 'text-cyan-200'}`}>
                              {item.enderecos}
                            </span>
                            <span className="text-[10px] text-slate-400 block">endereços</span>
                          </td>

                          {/* VOLUMES */}
                          <td className="py-3 px-3 text-right font-bold text-white">
                            <span>{item.volumes}</span>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              {item.unidade?.toLowerCase() || 'cx'}
                            </span>
                          </td>

                          {/* DEMANDA / META */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-bold text-slate-300">{item.volumes}/{item.demanda}</span>
                              <span className="text-[10px] text-emerald-400 font-bold">({item.percentualConclusao}%)</span>
                            </div>
                            <div className="w-20 h-1.5 bg-slate-800 rounded-full ml-auto mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isCurrent ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                                style={{ width: `${Math.min(100, item.percentualConclusao)}%` }}
                              />
                            </div>
                          </td>

                          {/* RITMO / ENDEREÇO */}
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {item.tempoMedioPorEnderecoFormatado}
                          </td>

                          {/* VPH / EPH */}
                          <td className="py-3 px-3 text-right">
                            <span className="font-bold text-amber-300">{item.vph} vph</span>
                            <span className="text-[10px] text-slate-400 block">{item.eph} eph</span>
                          </td>

                          {/* HORÁRIO */}
                          <td className="py-3 px-3 text-center text-slate-400 text-[11px]">
                            {item.horario}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-mono">
                        Nenhuma rua encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. COMPARATIVO VISUAL DE ENDEREÇOS E TEMPO POR RUA */}
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/10 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-400" />
              Distribuição Proporcional de Tempo e Endereços no Turno
            </h4>

            <div className="space-y-2">
              {detailedStreetItems.map((st) => {
                const percTempo = totals.totalSegundos > 0 ? (st.tempoSegundos / totals.totalSegundos) * 100 : 0;
                const percEnd = totals.totalEnderecos > 0 ? (st.enderecos / totals.totalEnderecos) * 100 : 0;

                return (
                  <div key={st.rua} className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <strong className="text-white">{st.rua}</strong>
                        <span className="text-[10px] text-slate-400">Setor {st.setor}</span>
                        {st.status === 'EM_ANDAMENTO' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-black uppercase">
                            Ativa Agora
                          </span>
                        )}
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        <strong className="text-emerald-400">{st.tempoFormatado}</strong> ({percTempo.toFixed(0)}% do tempo) •{' '}
                        <strong className="text-cyan-400">{st.enderecos} end</strong> ({percEnd.toFixed(0)}% dos endereços)
                      </div>
                    </div>

                    {/* Barra bi-color (verde = tempo, ciano = endereços) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                          <span>Tempo dedicado</span>
                          <span>{st.minutosTotais} min</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(100, percTempo)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                          <span>Endereços atendidos</span>
                          <span>{st.enderecos} end</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, percEnd)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-white/10 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dados consolidados da sessão ativa e histórico do dia.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const text = `📊 DETALHAMENTO DO REABASTECIMENTO\nTempo Total: ${totals.totalTempoFormatado} (${totals.totalMinutosDiretos} min)\nTotal Geral Endereços: ${totals.totalEnderecos}\nVolumes Totais: ${totals.totalVolumes} cx\nVPH Médio: ${totals.vphGeral} cx/h\nEPH Médio: ${totals.ephGeral} end/h\nRuas Atendidas: ${detailedStreetItems.map(i => `${i.rua} (${i.tempoFormatado}, ${i.enderecos} end)`).join(' | ')}`;
                navigator.clipboard?.writeText(text);
                alert('Resumo do Reabastecimento copiado para a área de transferência!');
              }}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Share2 size={13} />
              <span>Copiar Resumo</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl text-xs uppercase shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              Fechar Painel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReplenishmentDetailsModal;
