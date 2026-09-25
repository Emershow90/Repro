/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RUAS: Catálogo e Densidade de Ruas // Setor 87
 * Matriz de Execução, Densidade Física e Otimizador IA de Rotas
 * LOGIX WMS Core - Terminal Repro
 */

import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  Warehouse,
  AlertTriangle,
  Timer,
  Table,
  Box,
  AlertOctagon,
  Eye,
  CheckCircle2,
  BarChart2,
  Bot,
  Zap,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Route,
  Activity
} from 'lucide-react';
import { ArticleAddressRecord } from '../services/articleAddressService';

interface StreetTopologyDensityMatrixProps {
  records?: ArticleAddressRecord[];
  onNotify?: (msg: string, color?: string) => void;
  onNavigateToStreet?: (street: string) => void;
  onViewIn3D?: (street: string) => void;
}

interface StreetDensityRow {
  code: string;
  zoneType: 'Picking Baixo' | 'Pulmão Aéreo' | 'Doca Transf.';
  article: string;
  demandedCx: number;
  suppliedCx: number;
  capacityPct: number;
  operator: string;
  opInitials?: string;
  isForklift?: boolean;
  timeInStreet: string;
  status: 'GARGALO CRÍTICO' | 'FLUXO NOMINAL' | 'MANOBRA LENTA' | 'QUASE FINALIZADO' | 'EM ANDAMENTO' | 'RUPTURA DETECTADA';
  sector: string;
}

const INITIAL_STREET_ROWS: StreetDensityRow[] = [
  {
    code: 'B4VD0213',
    zoneType: 'Picking Baixo',
    article: 'Art. 201284',
    demandedCx: 643408,
    suppliedCx: 520100,
    capacityPct: 80.8,
    operator: 'Op. Carlos Silva',
    opInitials: 'CS',
    timeInStreet: '18m 42s',
    status: 'GARGALO CRÍTICO',
    sector: '87'
  },
  {
    code: 'B4VD2112',
    zoneType: 'Pulmão Aéreo',
    article: 'Art. 110799',
    demandedCx: 379008,
    suppliedCx: 290000,
    capacityPct: 76.5,
    operator: 'Op. Marcos Souza',
    opInitials: 'MS',
    timeInStreet: '06m 15s',
    status: 'FLUXO NOMINAL',
    sector: '87'
  },
  {
    code: 'B4VC3612',
    zoneType: 'Doca Transf.',
    article: 'Art. 210335',
    demandedCx: 305284,
    suppliedCx: 180500,
    capacityPct: 59.1,
    operator: 'Paleteira #04',
    isForklift: true,
    timeInStreet: '12m 50s',
    status: 'MANOBRA LENTA',
    sector: '87'
  },
  {
    code: 'B4VB3522',
    zoneType: 'Picking Baixo',
    article: 'Art. 29385',
    demandedCx: 217610,
    suppliedCx: 195000,
    capacityPct: 89.6,
    operator: 'Op. Renata Lima',
    opInitials: 'RL',
    timeInStreet: '55 min',
    status: 'QUASE FINALIZADO',
    sector: '87'
  },
  {
    code: 'B4VC3122',
    zoneType: 'Pulmão Aéreo',
    article: 'Art. 178054',
    demandedCx: 215610,
    suppliedCx: 110000,
    capacityPct: 51.0,
    operator: 'Op. Diego Lima',
    opInitials: 'DL',
    timeInStreet: '25 min',
    status: 'EM ANDAMENTO',
    sector: '87'
  },
  {
    code: 'B4VD3722',
    zoneType: 'Picking Baixo',
    article: 'Art. 143322',
    demandedCx: 184200,
    suppliedCx: 42000,
    capacityPct: 22.8,
    operator: 'Sem Operador',
    timeInStreet: '45 min',
    status: 'RUPTURA DETECTADA',
    sector: '87'
  }
];

export const StreetTopologyDensityMatrix: React.FC<StreetTopologyDensityMatrixProps> = ({
  records = [],
  onNotify,
  onNavigateToStreet,
  onViewIn3D
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sectorFilter, setSectorFilter] = useState<'87' | '88'>('87');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');
  const [situationFilter, setSituationFilter] = useState<string>('TODAS');
  const [viewMode, setViewMode] = useState<'MATRIZ' | 'TOPOLOGIA'>('MATRIZ');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [rows, setRows] = useState<StreetDensityRow[]>(INITIAL_STREET_ROWS);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches = 
          r.code.toLowerCase().includes(q) ||
          r.article.toLowerCase().includes(q) ||
          r.operator.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (sectorFilter && r.sector !== sectorFilter) return false;
      if (typeFilter !== 'TODOS' && r.zoneType !== typeFilter) return false;
      if (situationFilter === 'CRITICA' && !['GARGALO CRÍTICO', 'RUPTURA DETECTADA'].includes(r.status)) return false;
      if (situationFilter === 'NORMAL' && ['GARGALO CRÍTICO', 'RUPTURA DETECTADA'].includes(r.status)) return false;
      return true;
    });
  }, [rows, searchQuery, sectorFilter, typeFilter, situationFilter]);

  const handleExportCsv = () => {
    const csvContent = [
      ['Codigo_Rua', 'Zona_Tipo', 'Artigo', 'Demandadas', 'Abastecidas', 'Capacidade_Pct', 'Operador', 'Tempo_Rua', 'Status'].join(';'),
      ...rows.map(r => [
        r.code,
        r.zoneType,
        r.article,
        r.demandedCx,
        r.suppliedCx,
        `${r.capacityPct}%`,
        r.operator,
        r.timeInStreet,
        r.status
      ].join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Catalogo_Densidade_Ruas_Setor_${sectorFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (onNotify) {
      onNotify('Arquivo CSV de catálogo e densidade de ruas exportado!', 'var(--color-success)');
    }
  };

  const handleRecalculateRoutes = () => {
    if (onNotify) {
      onNotify('Rotas e tempos de ciclo recalculados pela Heurística WMS.', 'var(--color-info)');
    }
  };

  const handleDispatchPlan = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setIsOptimizing(false);
      // Rebalance mock effect: assign Paleteira to B4VD37
      setRows(prev => prev.map(r => {
        if (r.code === 'B4VD3722') {
          return {
            ...r,
            operator: 'Paleteira #04 (Reatribuída)',
            status: 'EM ANDAMENTO',
            capacityPct: 45.0,
            suppliedCx: 82000
          };
        }
        return r;
      }));

      if (onNotify) {
        onNotify('Rebalanceamento automático executado! Paleteira #04 redirecionada para B4VD37.', 'var(--color-success)');
      }
    }, 1200);
  };

  const handleFocusBottleneck = (streetCode: string) => {
    if (onNotify) {
      onNotify(`Foco direcionado ao gargalo operacional: ${streetCode}`, 'var(--color-warning)');
    }
    if (onNavigateToStreet) {
      onNavigateToStreet(streetCode);
    }
  };

  return (
    <div className="flex flex-col w-full text-slate-100 bg-[#0f131d] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-300">
      {/* -------------------------------------------------------------
          SUB-BAR / BREADCRUMB TRAIL
          ------------------------------------------------------------- */}
      <div className="w-full px-4 md:px-6 py-2.5 bg-[#090e17] flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#00f2fe] font-bold">WMS-SP01</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300">PLANTA LOGÍSTICA SUL</span>
          <span className="text-slate-600">/</span>
          <span className="text-[#4edea3]">SETOR 87 [ALTA ROTATIVIDADE]</span>
          <span className="text-slate-600">/</span>
          <span className="text-[#e0fdff] font-bold">TOPOLOGIA DE RUAS</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-slate-300 font-semibold">Sensor LIDAR: 24/24 Online</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 hidden sm:inline">CAD: REV-2024.11</span>
        </div>
      </div>

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* -------------------------------------------------------------
            1. HEADER & CONTROLS
            ------------------------------------------------------------- */}
        <div className="bg-[#171c25] rounded-2xl p-4 md:p-5 border border-white/10 shadow-xl flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30">
                <Table size={22} />
              </div>
              <h1 className="font-mono text-lg md:text-xl font-black text-white tracking-wide uppercase">
                CATÁLOGO E DENSIDADE DE RUAS // SETOR 87
              </h1>
            </div>
            <p className="font-mono text-xs text-slate-400 mt-1 pl-1">
              Topologia física, volumetria alocada, tracking de operadores e gargalos em tempo real
            </p>
          </div>

          {/* Action Cluster */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNotify && onNotify('Mapeamento de novo corredor disponível pelo AS400 CAD.', 'var(--color-info)')}
              className="h-9 px-3.5 bg-[#30353f] hover:bg-[#3a494b] text-white font-mono text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer shadow-sm"
            >
              <span>+ Adicionar Corredor</span>
            </button>

            <button
              type="button"
              onClick={handleRecalculateRoutes}
              className="h-9 px-3.5 bg-[#252a34] hover:bg-[#30353f] text-[#4edea3] font-mono text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer shadow-sm"
            >
              <Route size={15} />
              <span>Recalcular Rotas</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 px-3.5 bg-[#252a34] hover:bg-[#30353f] text-slate-200 font-mono text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer shadow-sm"
            >
              <Download size={14} className="text-[#00f2fe]" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------------
            FILTER RIBBON WITH SEARCH
            ------------------------------------------------------------- */}
        <div className="bg-[#1b2029] rounded-2xl p-3 border border-white/10 shadow-md flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Quick search */}
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por B4VD, B4VC, B4VB, B4UZ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-9 pr-3 bg-[#090e17] text-white font-mono text-xs rounded-xl placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#00f2fe] border border-white/5"
              />
            </div>

            {/* Setor Pill */}
            <div className="flex items-center gap-1 bg-[#171c25] p-1 rounded-xl border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 uppercase px-2 font-bold">Setor:</span>
              <button
                type="button"
                onClick={() => setSectorFilter('87')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-bold cursor-pointer transition-colors ${
                  sectorFilter === '87'
                    ? 'bg-[#00f2fe] text-[#00373a]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Setor 87
              </button>
              <button
                type="button"
                onClick={() => setSectorFilter('88')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-bold cursor-pointer transition-colors ${
                  sectorFilter === '88'
                    ? 'bg-[#00f2fe] text-[#00373a]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Setor 88
              </button>
            </div>

            {/* Tipo */}
            <div className="hidden lg:flex items-center gap-1 bg-[#171c25] p-1 rounded-xl border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 uppercase px-2 font-bold">Tipo:</span>
              {['TODOS', 'Picking Baixo', 'Pulmão Aéreo', 'Doca Transf.'].map(tp => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTypeFilter(tp)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs cursor-pointer transition-colors ${
                    typeFilter === tp
                      ? 'bg-[#252a34] text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tp}
                </button>
              ))}
            </div>

            {/* Situação */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Situação:</span>
              <button
                type="button"
                onClick={() => setSituationFilter(situationFilter === 'CRITICA' ? 'TODAS' : 'CRITICA')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  situationFilter === 'CRITICA'
                    ? 'bg-rose-500 text-white'
                    : 'text-rose-400 bg-rose-500/15 border border-rose-500/30'
                }`}
              >
                Crítica (3)
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter(situationFilter === 'NORMAL' ? 'TODAS' : 'NORMAL')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  situationFilter === 'NORMAL'
                    ? 'bg-[#4edea3] text-[#003824]'
                    : 'text-[#4edea3] bg-[#4edea3]/15 border border-[#4edea3]/30'
                }`}
              >
                Normal (19)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-400 hidden sm:inline">Exibição:</span>
            <div className="flex bg-[#090e17] rounded-xl p-0.5 border border-white/5">
              <button
                type="button"
                onClick={() => setViewMode('MATRIZ')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === 'MATRIZ'
                    ? 'bg-[#252a34] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Matriz
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TOPOLOGIA')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === 'TOPOLOGIA'
                    ? 'bg-[#252a34] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Topologia
              </button>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            2. METRICS TOP STRIP (Cards de Capacidade de Ruas)
            ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {/* Card 1: Ruas Mapeadas */}
          <div className="bg-[#171c25] rounded-2xl p-4 border border-white/10 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Ruas Mapeadas no Setor
              </span>
              <Warehouse size={18} className="text-[#00f2fe]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-white">24</span>
              <span className="font-mono text-xs text-slate-400">ativas</span>
              <span className="font-mono text-[11px] text-slate-400 ml-auto">/ 78 total armazém</span>
            </div>
            <div className="w-full bg-[#30353f] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-[#00f2fe] h-full rounded-full" style={{ width: '30.8%' }} />
            </div>
            <span className="font-mono text-[11px] text-[#4edea3] mt-1.5">30.8% da malha logística ativa</span>
          </div>

          {/* Card 2: Ruas Saturadas */}
          <div className="bg-[#171c25] rounded-2xl p-4 border border-rose-500/20 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Ruas Saturadas (&gt;90% Ocup.)
              </span>
              <AlertTriangle size={18} className="text-[#ffb4ab]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-[#ffb4ab]">4</span>
              <span className="font-mono text-xs text-[#ffb4ab]">corredores</span>
              <span className="font-mono text-[11px] text-rose-400 ml-auto font-bold">ALERTA RISCO</span>
            </div>
            <div className="w-full bg-[#30353f] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-rose-500 h-full rounded-full" style={{ width: '85%' }} />
            </div>
            <span className="font-mono text-[11px] text-slate-400 mt-1.5">Reabastecimento urgente: B4VD02, B4VB35</span>
          </div>

          {/* Card 3: Gargalos Operacionais */}
          <div className="bg-[#171c25] rounded-2xl p-4 border border-white/10 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Gargalos Críticos Ativos
              </span>
              <Activity size={18} className="text-[#4edea3]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-[#4edea3]">3</span>
              <span className="font-mono text-xs text-slate-400">corredores</span>
              <span className="font-mono text-[10px] text-[#4edea3] ml-auto font-mono">B4VD02 // B4VC36 // B4VD37</span>
            </div>
            <div className="w-full bg-[#30353f] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-[#4edea3] h-full rounded-full" style={{ width: '75%' }} />
            </div>
            <span className="font-mono text-[11px] text-slate-400 mt-1.5">Tempo travamento acumulado: +86 min</span>
          </div>

          {/* Card 4: Tempo Médio de Travessia */}
          <div className="bg-[#171c25] rounded-2xl p-4 border border-white/10 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Tempo Médio Travessia / Ciclo
              </span>
              <Timer size={18} className="text-purple-300" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-white">14</span>
              <span className="font-mono text-xs text-slate-300">min / rua</span>
              <span className="font-mono text-[11px] text-[#4edea3] ml-auto font-bold">Target: ≤ 12m</span>
            </div>
            <div className="w-full bg-[#30353f] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-[#00f2fe] h-full rounded-full" style={{ width: '82%' }} />
            </div>
            <span className="font-mono text-[11px] text-slate-400 mt-1.5">+2.4m acima do baseline nominal</span>
          </div>
        </div>

        {/* -------------------------------------------------------------
            3. TABELA MASTER DE RUAS COM VISUALIZADOR DE OCUPAÇÃO
            ------------------------------------------------------------- */}
        <div className="bg-[#171c25] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 md:px-6 py-3 bg-[#1b2029] flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <Table size={17} className="text-[#00f2fe]" />
              <h2 className="font-mono text-xs md:text-sm font-black text-white uppercase tracking-wider">
                Matriz de Execução e Densidade Física
              </h2>
              <span className="font-mono text-[9px] bg-[#30353f] text-slate-300 px-2 py-0.5 rounded-md uppercase font-bold">
                {filteredRows.length} Ruas Filtradas
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
              <span className="text-slate-500">Legenda:</span>
              <span className="flex items-center gap-1 text-[#ffb4ab]">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Gargalo / Ruptura
              </span>
              <span className="flex items-center gap-1 text-[#4edea3]">
                <span className="w-2 h-2 rounded-full bg-[#4edea3]" /> Em Operação
              </span>
              <span className="flex items-center gap-1 text-[#00f2fe]">
                <span className="w-2 h-2 rounded-full bg-[#00f2fe]" /> Nominal / Final
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="h-9 bg-[#090e17] text-slate-400 uppercase tracking-wider text-[11px] border-b border-white/10">
                  <th className="px-4 py-2 font-bold">Código da Rua</th>
                  <th className="px-3 py-2 font-bold">Zona / Tipo</th>
                  <th className="px-3 py-2 font-bold">Artigos Alocados</th>
                  <th className="px-3 py-2 font-bold text-right">Cx. Demandadas</th>
                  <th className="px-3 py-2 font-bold text-right">Cx. Abastecidas</th>
                  <th className="px-4 py-2 font-bold text-center">Capacidade Estática (%)</th>
                  <th className="px-3 py-2 font-bold">Operador / Equip.</th>
                  <th className="px-3 py-2 font-bold text-right">Tempo na Rua</th>
                  <th className="px-3 py-2 font-bold text-center">Status Operacional</th>
                  <th className="px-4 py-2 font-bold text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map(row => {
                  const isCritical = row.status === 'GARGALO CRÍTICO' || row.status === 'RUPTURA DETECTADA';
                  const isComplete = row.status === 'QUASE FINALIZADO' || row.status === 'FLUXO NOMINAL';
                  return (
                    <tr
                      key={row.code}
                      className="h-11 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {/* Código da Rua */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span className={`w-1.5 h-4 rounded-sm ${
                            isCritical ? 'bg-rose-500 animate-pulse' : isComplete ? 'bg-[#4edea3]' : 'bg-[#00f2fe]'
                          }`} />
                          <span className="font-mono text-sm">{row.code}</span>
                        </div>
                      </td>

                      {/* Zona / Tipo */}
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#252a34] text-slate-300 text-[10px] uppercase font-bold">
                          {row.zoneType}
                        </span>
                      </td>

                      {/* Artigos */}
                      <td className="px-3 py-2 text-slate-200">
                        {row.article}
                      </td>

                      {/* Cx Demandadas */}
                      <td className="px-3 py-2 text-right font-bold text-white">
                        {row.demandedCx.toLocaleString('pt-BR')}
                      </td>

                      {/* Cx Abastecidas */}
                      <td className="px-3 py-2 text-right font-bold text-[#00f2fe]">
                        {row.suppliedCx.toLocaleString('pt-BR')}
                      </td>

                      {/* Capacidade Estática (%) */}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-2.5 max-w-[140px] mx-auto">
                          <div className="w-20 bg-[#30353f] h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCritical ? 'bg-rose-500' : isComplete ? 'bg-[#4edea3]' : 'bg-[#00f2fe]'
                              }`}
                              style={{ width: `${row.capacityPct}%` }}
                            />
                          </div>
                          <span className={`w-10 text-right font-bold text-xs ${
                            isCritical ? 'text-rose-400' : isComplete ? 'text-[#4edea3]' : 'text-[#00f2fe]'
                          }`}>
                            {row.capacityPct}%
                          </span>
                        </div>
                      </td>

                      {/* Operador / Equip */}
                      <td className="px-3 py-2">
                        {row.opInitials ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#30353f] text-[#00f2fe] flex items-center justify-center text-[10px] font-bold">
                              {row.opInitials}
                            </div>
                            <span className="text-slate-200 font-semibold">{row.operator}</span>
                          </div>
                        ) : row.isForklift ? (
                          <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
                            <span>🚜</span>
                            <span>{row.operator}</span>
                          </div>
                        ) : (
                          <span className="text-rose-400 font-bold flex items-center gap-1">
                            <AlertCircle size={14} />
                            <span>Sem Operador</span>
                          </span>
                        )}
                      </td>

                      {/* Tempo na Rua */}
                      <td className={`px-3 py-2 text-right font-bold ${
                        isCritical ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {row.timeInStreet}
                      </td>

                      {/* Status Operacional */}
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block ${
                          row.status === 'GARGALO CRÍTICO'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : row.status === 'RUPTURA DETECTADA'
                            ? 'bg-rose-600/30 text-rose-300 border border-rose-500 animate-pulse'
                            : row.status === 'FLUXO NOMINAL'
                            ? 'bg-[#4edea3]/20 text-[#4edea3] border border-[#4edea3]/30'
                            : row.status === 'QUASE FINALIZADO'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {row.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewIn3D ? onViewIn3D(row.code) : onNotify && onNotify(`Visualizando ${row.code} no espaço 3D`, 'var(--color-info)')}
                            className="p-1.5 hover:bg-white/10 text-[#00f2fe] rounded-lg transition-colors cursor-pointer"
                            title="Visualizar no Mapa 3D"
                          >
                            <Box size={15} />
                          </button>
                          {row.status === 'RUPTURA DETECTADA' ? (
                            <button
                              type="button"
                              onClick={handleDispatchPlan}
                              className="px-2.5 py-1 bg-rose-500 hover:bg-rose-400 text-slate-950 font-black text-[10px] rounded-lg transition-colors cursor-pointer shadow-md"
                              title="Alocar Operador de Emergência"
                            >
                              Despachar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleFocusBottleneck(row.code)}
                              className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Focar Rua"
                            >
                              <AlertOctagon size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Sub-bar / Pagination */}
          <div className="px-4 md:px-6 py-2.5 bg-[#090e17] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 border-t border-white/10">
            <div>Exibindo {filteredRows.length} corredores ativos no Setor {sectorFilter} • Capacidade global: 74.2%</div>
            <div className="flex items-center gap-2">
              <span>Página 1 de 1</span>
              <div className="flex gap-1">
                <button type="button" className="px-2.5 py-0.5 bg-[#00f2fe] text-[#00373a] font-bold rounded-lg">1</button>
              </div>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            4. PAINEL DE BALANCEAMENTO DE CARGA DE RUAS
            ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Visual Chart Panel (Densidade Relativa) */}
          <div className="lg:col-span-8 bg-[#171c25] rounded-2xl p-4 md:p-5 border border-white/10 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarChart2 size={20} className="text-[#00f2fe]" />
                <div>
                  <h3 className="font-mono text-xs md:text-sm font-black text-white uppercase tracking-wide">
                    Densidade Relativa &amp; Carga por Corredor
                  </h3>
                  <p className="font-mono text-[11px] text-slate-400">
                    Comparativo de caixas demandadas versus executadas por corredor
                  </p>
                </div>
              </div>
              <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-md bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20">
                Tempo Real
              </span>
            </div>

            {/* Inline Chart Visualization */}
            <div className="my-4 w-full">
              <div className="flex items-end justify-between gap-3 h-40 pt-4 px-2">
                {[
                  { name: 'B4VD02', pct: 80.8, req: '643k', real: '520k', isCrit: true },
                  { name: 'B4VD21', pct: 76.5, req: '379k', real: '290k', isGood: true },
                  { name: 'B4VC36', pct: 59.1, req: '305k', real: '180k' },
                  { name: 'B4VB35', pct: 89.6, req: '217k', real: '195k', isGood: true },
                  { name: 'B4VC31', pct: 51.0, req: '215k', real: '110k', isCyan: true },
                  { name: 'B4VD37', pct: 22.8, req: '184k', real: '42k', isCrit: true }
                ].map(col => (
                  <div key={col.name} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer">
                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      {/* Planejado */}
                      <div
                        className="w-1/2 bg-[#3a494b] rounded-t transition-all group-hover:bg-[#849495]"
                        style={{ height: `${Math.max(25, col.pct + 15)}%` }}
                        title={`Demandado: ${col.req} cx`}
                      />
                      {/* Realizado */}
                      <div
                        className={`w-1/2 rounded-t transition-all group-hover:brightness-125 ${
                          col.isCrit ? 'bg-rose-500' : col.isGood ? 'bg-[#4edea3]' : col.isCyan ? 'bg-[#00f2fe]' : 'bg-slate-400'
                        }`}
                        style={{ height: `${col.pct}%` }}
                        title={`Realizado: ${col.real} cx (${col.pct}%)`}
                      />
                    </div>
                    <span className="font-mono text-xs text-white font-bold">{col.name}</span>
                    <span className={`font-mono text-[10px] font-bold ${
                      col.isCrit ? 'text-rose-400' : col.isGood ? 'text-[#4edea3]' : col.isCyan ? 'text-[#00f2fe]' : 'text-slate-400'
                    }`}>
                      {col.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/10 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#3a494b] rounded-sm" /> Planejado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#00f2fe] rounded-sm" /> Realizado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" /> Crítico
                </span>
              </div>
              <span className="text-[#4edea3] font-bold">Taxa de Conclusão do Setor: 67.8%</span>
            </div>
          </div>

          {/* Action Panel: Otimizador IA de Rotas */}
          <div className="lg:col-span-4 bg-[#171c25] rounded-2xl p-4 md:p-5 border border-white/10 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bot size={18} className="text-[#4edea3]" />
                  <h3 className="font-mono text-xs md:text-sm font-black text-white uppercase">
                    Otimizador IA de Rotas
                  </h3>
                </div>
                <span className="font-mono text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-bold uppercase">
                  Heurística Ativa
                </span>
              </div>
              <p className="font-mono text-xs text-slate-300 mb-3">
                O motor detectou ociosidade iminente no corredor <strong className="text-[#4edea3]">B4VB35</strong> e sobrecarga em <strong className="text-rose-400">B4VD37</strong>.
              </p>

              {/* Recommendation Cards */}
              <div className="space-y-2.5">
                <div className="bg-[#1b2029] rounded-xl p-3 border border-white/5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#00f2fe] uppercase font-bold">
                      Rebalanceamento Sugerido
                    </span>
                    <span className="font-mono text-xs text-[#4edea3] font-bold">+32% VPH</span>
                  </div>
                  <p className="font-mono text-xs text-slate-200">
                    Desviar <strong className="text-[#00f2fe]">Paleteira Elétrica #04</strong> da Rua B4VC36 para a Rua <strong className="text-rose-400">B4VD37</strong>.
                  </p>
                  <span className="font-mono text-[10px] text-slate-400">Tempo estimado de deslocamento: 01m 20s</span>
                </div>

                <div className="bg-[#1b2029] rounded-xl p-3 border border-white/5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#4edea3] uppercase font-bold">
                      Finalização de Turno
                    </span>
                    <span className="font-mono text-xs text-slate-400">Estimativa: 12 min</span>
                  </div>
                  <p className="font-mono text-xs text-slate-200">
                    Liberar <strong className="text-[#00f2fe]">Op. Renata Lima</strong> (B4VB35) para assumir pulmão intermediário do artigo 143322.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDispatchPlan}
                disabled={isOptimizing}
                className="w-full h-10 bg-[#00f2fe] hover:brightness-110 text-[#00373a] font-mono text-xs font-black rounded-xl uppercase transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,242,254,0.3)] cursor-pointer disabled:opacity-50"
              >
                {isOptimizing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Sincronizando Malha...</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Executar Rebalanceamento Automático</span>
                  </>
                )}
              </button>
              <span className="font-mono text-[10px] text-slate-400 text-center">
                Afeta 2 operadores e 1 veículo autoguiado
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreetTopologyDensityMatrix;
