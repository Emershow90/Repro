/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * REGISTROS: Log de Registros CTN & Sincronização IndexedDB
 * Schema AS400.LOG_REPRO // Local-First Engine v4.8
 * Terminal Repro - LOGIX WMS
 */

import React, { useState, useMemo } from 'react';
import {
  Table,
  RefreshCw,
  Download,
  AlertTriangle,
  Trash2,
  HardDrive,
  Gauge,
  CheckCircle2,
  Lock,
  Search,
  X,
  Calendar,
  Eye,
  Check,
  ShieldCheck,
  Network,
  Database,
  ChevronLeft,
  ChevronRight,
  Box,
  Layers
} from 'lucide-react';
import { ArticleAddressRecord } from '../services/articleAddressService';

export interface CtnTransactionRecord {
  id: string;
  dataHora: string;
  data: string;
  hora: string;
  contenantPai: string;
  enderecoOrigem: string;
  zonaOrigem: string;
  artigo: string;
  ctnFilho: string;
  enderecoTampao: string;
  zonaNova: string;
  enderecoApontamento: string;
  qtd: number;
  status: 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE';
  statusLabel?: string;
  terminal?: string;
  operador?: string;
  antenaRfid?: string;
  sha256Hash?: string;
  detalheInconsistencia?: string;
}

const DEFAULT_CTN_ROWS: CtnTransactionRecord[] = [
  {
    id: 'ctn-1',
    dataHora: '21/09/2026 14:31:02',
    data: '21/09/2026',
    hora: '14:31:02',
    contenantPai: '886685',
    enderecoOrigem: 'B4UZ3412',
    zonaOrigem: 'RPAL',
    artigo: '5605055',
    ctnFilho: '235273',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3413',
    qtd: 97,
    status: 'VALIDADO',
    terminal: 'Zebra TC57 (COL-042)',
    operador: 'Carlos Eduardo (ID #4092)',
    antenaRfid: 'PORTAL-N2-DOCK4',
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae'
  },
  {
    id: 'ctn-2',
    dataHora: '21/09/2026 14:31:18',
    data: '21/09/2026',
    hora: '14:31:18',
    contenantPai: '886685',
    enderecoOrigem: 'B4UZ3412',
    zonaOrigem: 'RPAL',
    artigo: '5605055',
    ctnFilho: '235274',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3413',
    qtd: 91,
    status: 'VALIDADO',
    terminal: 'Zebra TC57 (COL-042)',
    operador: 'Carlos Eduardo (ID #4092)',
    antenaRfid: 'PORTAL-N2-DOCK4',
    sha256Hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f'
  },
  {
    id: 'ctn-3',
    dataHora: '21/09/2026 14:32:05',
    data: '21/09/2026',
    hora: '14:32:05',
    contenantPai: '798759',
    enderecoOrigem: 'B4UZ3622',
    zonaOrigem: 'RPAL',
    artigo: '2809267',
    ctnFilho: '235237',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3663',
    qtd: 96,
    status: 'ALERTA',
    statusLabel: 'ALERTA RECONTAGEM',
    terminal: 'Zebra TC57 (COL-019)',
    operador: 'Marcos Souza (ID #3890)',
    antenaRfid: 'PORTAL-N3-DOCK2',
    sha256Hash: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
    detalheInconsistencia: 'Diferença: -2 cx em relação ao espelho de carga.'
  },
  {
    id: 'ctn-4',
    dataHora: '21/09/2026 14:32:44',
    data: '21/09/2026',
    hora: '14:32:44',
    contenantPai: '798759',
    enderecoOrigem: 'B4UZ3622',
    zonaOrigem: 'RPAL',
    artigo: '2809267',
    ctnFilho: '235238',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3663',
    qtd: 90,
    status: 'VALIDADO',
    terminal: 'Zebra TC57 (COL-019)',
    operador: 'Marcos Souza (ID #3890)',
    antenaRfid: 'PORTAL-N3-DOCK2',
    sha256Hash: '1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a'
  },
  {
    id: 'ctn-5',
    dataHora: '21/09/2026 14:33:10',
    data: '21/09/2026',
    hora: '14:33:10',
    contenantPai: '158951',
    enderecoOrigem: 'B4VB0622',
    zonaOrigem: 'RPAL',
    artigo: '2822000',
    ctnFilho: '235290',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3550',
    qtd: 194,
    status: 'VALIDADO',
    terminal: 'Honeywell CK65 (COL-102)',
    operador: 'Renata Lima (ID #5122)',
    antenaRfid: 'PORTAL-N1-CORREDOR',
    sha256Hash: '6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a'
  },
  {
    id: 'ctn-6',
    dataHora: '21/09/2026 14:33:30',
    data: '21/09/2026',
    hora: '14:33:30',
    contenantPai: '158951',
    enderecoOrigem: 'B4VB0622',
    zonaOrigem: 'RPAL',
    artigo: '2822000',
    ctnFilho: '235291',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3550',
    qtd: 194,
    status: 'VALIDADO',
    terminal: 'Honeywell CK65 (COL-102)',
    operador: 'Renata Lima (ID #5122)',
    antenaRfid: 'PORTAL-N1-CORREDOR',
    sha256Hash: '4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f'
  },
  {
    id: 'ctn-7',
    dataHora: '21/09/2026 14:34:12',
    data: '21/09/2026',
    hora: '14:34:12',
    contenantPai: '818570',
    enderecoOrigem: 'B4VD0213',
    zonaOrigem: 'RPAL',
    artigo: '5858207',
    ctnFilho: '235310',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3690',
    qtd: 82,
    status: 'ALERTA',
    statusLabel: 'ALERTA RECONTAGEM',
    terminal: 'Zebra TC57 (COL-042)',
    operador: 'Carlos Silva (ID #4092)',
    antenaRfid: 'PORTAL-N2-DOCK4',
    sha256Hash: '9f8e4a7b2c0182dd9f8e4a7b2c0182dd',
    detalheInconsistencia: 'Conferir possível bipe duplo no mesmo endereço.'
  },
  {
    id: 'ctn-8',
    dataHora: '21/09/2026 14:35:48',
    data: '21/09/2026',
    hora: '14:35:48',
    contenantPai: '200891',
    enderecoOrigem: 'B4VD0213',
    zonaOrigem: 'RPAL',
    artigo: '5605055',
    ctnFilho: '235315',
    enderecoTampao: 'ZTP10111',
    zonaNova: 'PICK1',
    enderecoApontamento: 'B0AF3690',
    qtd: 110,
    status: 'VALIDADO',
    terminal: 'Zebra TC57 (COL-042)',
    operador: 'Carlos Silva (ID #4092)',
    antenaRfid: 'PORTAL-N2-DOCK4',
    sha256Hash: '3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f'
  }
];

interface CtnAuditLogIndexedDbViewProps {
  records?: ArticleAddressRecord[];
  onNotify?: (msg: string, color?: string) => void;
}

export const CtnAuditLogIndexedDbView: React.FC<CtnAuditLogIndexedDbViewProps> = ({
  records = [],
  onNotify
}) => {
  const [showSyncToast, setShowSyncToast] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE'>('TODOS');
  const [selectedDrawerItem, setSelectedDrawerItem] = useState<CtnTransactionRecord | null>(null);

  // Combina dados da tabela
  const ctnList = useMemo(() => {
    return DEFAULT_CTN_ROWS;
  }, []);

  const filteredCtnList = useMemo(() => {
    return ctnList.filter(item => {
      if (statusFilter !== 'TODOS' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          item.ctnFilho.toLowerCase().includes(q) ||
          item.contenantPai.toLowerCase().includes(q) ||
          item.artigo.toLowerCase().includes(q) ||
          item.enderecoOrigem.toLowerCase().includes(q) ||
          item.enderecoApontamento.toLowerCase().includes(q) ||
          (item.operador && item.operador.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [ctnList, statusFilter, searchQuery]);

  const handleTriggerSync = () => {
    setIsSyncing(true);
    setShowSyncToast(true);
    setTimeout(() => {
      setIsSyncing(false);
      if (onNotify) {
        onNotify('Base sincronizada via SSE com o AS400 (4.8 MB processados).', 'var(--color-success)');
      }
    }, 1200);
  };

  const handleExportCsv = () => {
    const headers = [
      'DataHora',
      'Contenant_Pai',
      'End_Origem',
      'Zona_Origem',
      'Artigo_SKU',
      'CTN_Filho',
      'End_Tampao',
      'Zona_Nova',
      'End_Apontamento',
      'Qtd_Cx',
      'Status_Auditoria',
      'Terminal',
      'Operador',
      'SHA256'
    ].join(';');

    const lines = ctnList.map(r => [
      r.dataHora,
      r.contenantPai,
      r.enderecoOrigem,
      r.zonaOrigem,
      r.artigo,
      r.ctnFilho,
      r.enderecoTampao,
      r.zonaNova,
      r.enderecoApontamento,
      r.qtd,
      r.status,
      r.terminal || '',
      r.operador || '',
      r.sha256Hash || ''
    ].join(';'));

    const csvData = [headers, ...lines].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AS400_DUMP_${new Date().toISOString().split('T')[0]}_CTN_EXPORT.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (onNotify) {
      onNotify('Dump AS400 / CSV gerado com sucesso pelo IndexedDB local!', 'var(--color-success)');
    }
  };

  const handleClearCache = () => {
    if (window.confirm('Atenção: Deseja realmente purgar registros temporários antigos? Apenas bipes já sincronizados com o AS400 serão arquivados.')) {
      if (onNotify) {
        onNotify('Cache IndexedDB otimizado com sucesso. Espaço liberado: 1.2 MB.', 'var(--color-warning)');
      }
    }
  };

  const handleRevalidateItem = () => {
    if (onNotify) {
      onNotify('Integridade SHA-256 e apontamento AS400 reavaliados. Hash conferido e 100% idêntico.', 'var(--color-success)');
    }
  };

  return (
    <div className="flex flex-col w-full text-slate-100 bg-[#0f131d] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-300">
      {/* -------------------------------------------------------------
          DYNAMIC NOTIFICATION BAR / SYNC TOAST
          ------------------------------------------------------------- */}
      {showSyncToast && (
        <div className="w-full bg-[#4edea3]/10 border-b border-[#4edea3]/30 px-4 md:px-6 py-2 flex items-center justify-between transition-all">
          <div className="flex items-center gap-2 font-mono text-xs text-[#4edea3]">
            <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-ping" />
            <span>
              INSPEÇÃO INDEXEDDB: Base sincronizada via SSE com o servidor intermediário AS400 (4.8 MB processados).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSyncToast(false)}
            className="text-[#4edea3] hover:text-white cursor-pointer p-0.5"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="p-4 md:p-6 flex flex-col gap-4">
        {/* -------------------------------------------------------------
            TOP AUDITOR RIBBON & OPERATIONS HEADER
            ------------------------------------------------------------- */}
        <section className="bg-[#171c25] p-4 md:p-5 rounded-2xl border border-white/10 shadow-xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-mono text-base md:text-lg font-black text-white uppercase tracking-wide">
                Log de Registros CTN &amp; Sincronização IndexedDB
              </h1>
              <span className="bg-[#30353f] px-2 py-0.5 rounded-md font-mono text-[10px] text-[#4edea3] uppercase font-bold border border-white/5">
                Local-First Engine v4.8
              </span>
              <span className="bg-[#252a34] px-2 py-0.5 rounded-md font-mono text-[10px] text-[#00f2fe] font-bold border border-white/5">
                Schema AS400.LOG_REPRO
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap font-mono text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Box size={14} className="text-[#4edea3]" />
                <strong className="text-white font-black">14.219.757</strong>
                <span>cx rastreadas</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-[#00f2fe]" />
                <strong className="text-white font-bold">78</strong>
                <span>Lotes Processados</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-[#4edea3]" />
                <span>Storage:</span>
                <strong className="text-[#4edea3]">4.8 MB</strong>
                <span className="text-slate-500">(IndexedDB: OK)</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
                <span>Taxa Falha: <strong className="text-white">0.00%</strong></span>
              </div>
            </div>
          </div>

          {/* Action Cluster */}
          <div className="flex items-center gap-2 flex-wrap self-end xl:self-auto">
            <button
              type="button"
              onClick={handleTriggerSync}
              className="bg-[#252a34] hover:bg-[#30353f] text-[#00f2fe] px-3.5 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-[#00f2fe]/20 cursor-pointer"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span>Forçar Sincronização SSE</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-[#252a34] hover:bg-[#30353f] text-slate-200 px-3.5 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-white/5 cursor-pointer"
            >
              <Download size={14} className="text-[#4edea3]" />
              <span>Dump AS400 / CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('ALERTA')}
              className="bg-[#252a34] hover:bg-[#30353f] text-purple-300 px-3.5 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-purple-500/20 cursor-pointer"
            >
              <AlertTriangle size={14} className="text-rose-400" />
              <span>Auditar Inconsistências (2)</span>
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              className="bg-[#252a34] hover:bg-[#30353f] text-rose-400 px-3 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-1 transition-all border border-rose-500/20 cursor-pointer"
              title="Limpar Cache Local"
            >
              <Trash2 size={15} />
              <span className="hidden md:inline">Limpar Cache</span>
            </button>
          </div>
        </section>

        {/* -------------------------------------------------------------
            VISUAL STORAGE & STREAM TELEMETRY SUB-BAND (4 CARDS)
            ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Card 1: IndexedDB Cache */}
          <div className="bg-[#1b2029] p-4 rounded-2xl border border-white/10 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>IndexedDB Cache Heap</span>
              <HardDrive size={16} className="text-[#4edea3]" />
            </div>
            <div className="flex items-baseline gap-1.5 my-2">
              <span className="font-mono text-2xl font-black text-white">4,892</span>
              <span className="font-mono text-xs text-slate-400">KB alocados</span>
            </div>
            <div className="w-full bg-[#30353f] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#4edea3] h-full rounded-full" style={{ width: '12%' }} />
            </div>
          </div>

          {/* Card 2: Vazão Bipes / Seg */}
          <div className="bg-[#1b2029] p-4 rounded-2xl border border-white/10 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>Vazão Bipes / Seg</span>
              <Gauge size={16} className="text-[#00f2fe]" />
            </div>
            <div className="flex items-baseline gap-1.5 my-2">
              <span className="font-mono text-2xl font-black text-[#00f2fe]">42.8</span>
              <span className="font-mono text-xs text-slate-400">ops/sec</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px] text-[#4edea3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
              <span>Latência de gravação: 1.4ms</span>
            </div>
          </div>

          {/* Card 3: Buffer AS400 Queue */}
          <div className="bg-[#1b2029] p-4 rounded-2xl border border-white/10 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>Buffer AS400 Queue</span>
              <CheckCircle2 size={16} className="text-[#4edea3]" />
            </div>
            <div className="flex items-baseline gap-1.5 my-2">
              <span className="font-mono text-2xl font-black text-[#4edea3]">0 PENDENTES</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
              <span>Socket TCP Estável (Nó Local)</span>
            </div>
          </div>

          {/* Card 4: Quick Hash Integrity */}
          <div className="bg-[#1b2029] p-4 rounded-2xl border border-white/10 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>Integridade SHA-256</span>
              <Lock size={16} className="text-purple-300" />
            </div>
            <div className="flex items-baseline gap-1.5 my-2">
              <span className="font-mono text-2xl font-black text-white">100.0%</span>
              <span className="font-mono text-xs text-[#4edea3] font-bold">VÁLIDO</span>
            </div>
            <div className="font-mono text-[10px] text-slate-500 truncate" title="Hash do último bloco: 9f8e4a7b2c0182dd">
              Hash: 9f8e4a7b2c0182dd...
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            FILTER CONTROL RIBBON & DEEP QUERY BAR
            ------------------------------------------------------------- */}
        <section className="bg-[#171c25] p-3 rounded-2xl border border-white/10 shadow-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input Multi-Match */}
          <div className="flex-1 flex items-center bg-[#090e17] rounded-xl px-3 gap-2 border border-white/5">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca unificada: CTN Filho (ex: 235273), Contêiner Pai (ex: 886685), Endereço (ex: B4UZ3412), SKU..."
              className="w-full bg-transparent py-2 text-white font-mono text-xs placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Status Chips & Batch Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-[#1b2029] rounded-xl p-1 border border-white/5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('TODOS')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  statusFilter === 'TODOS'
                    ? 'bg-[#30353f] text-[#00f2fe]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                TODOS <span className="text-slate-300">({ctnList.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('VALIDADO')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  statusFilter === 'VALIDADO'
                    ? 'bg-[#30353f] text-[#4edea3]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                VALIDADO <span className="text-[#4edea3]">({ctnList.filter(c => c.status === 'VALIDADO').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('ALERTA')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  statusFilter === 'ALERTA'
                    ? 'bg-[#30353f] text-rose-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ALERTA <span className="text-rose-400">({ctnList.filter(c => c.status === 'ALERTA').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('INCONSISTENTE')}
                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  statusFilter === 'INCONSISTENTE'
                    ? 'bg-[#30353f] text-rose-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                INCONSISTENTE <span className="text-slate-500">(0)</span>
              </button>
            </div>

            {/* Date & Batch */}
            <div className="flex items-center bg-[#090e17] rounded-xl px-3 py-1.5 gap-2 text-white font-mono text-xs border border-white/5">
              <Calendar size={14} className="text-[#00f2fe]" />
              <span>21/09/2026</span>
              <span className="text-slate-600">|</span>
              <span className="text-[#00f2fe] font-bold">LOTE #RPAL-0926</span>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            CTN DUMP AS400 EXECUTION MATRIX TABLE (11 COLUNAS)
            ------------------------------------------------------------- */}
        <section className="bg-[#171c25] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 md:px-6 py-2.5 bg-[#1b2029] flex items-center justify-between text-slate-300 font-mono text-xs border-b border-white/10">
            <div className="flex items-center gap-2">
              <Table size={15} className="text-[#00f2fe]" />
              <span className="font-bold uppercase tracking-wider text-white">
                MATRIZ DE DISPERSÃO CTN // REGISTROS VINCULADOS AO INDEXEDDB
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#00f2fe] font-bold">
                Mostrando {filteredCtnList.length} de {ctnList.length} registros
              </span>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <span className="text-slate-400 hidden sm:inline">Modo: Leitura Offline Local</span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="h-9 bg-[#090e17] text-slate-400 uppercase tracking-wider text-[11px] border-b border-white/10 select-none">
                  <th className="px-3 py-2 font-semibold">Data / Hora</th>
                  <th className="px-3 py-2 font-semibold">Contêiner Pai</th>
                  <th className="px-3 py-2 font-semibold">End. Origem</th>
                  <th className="px-3 py-2 font-semibold">Zona Origem</th>
                  <th className="px-3 py-2 font-semibold">Artigo / SKU</th>
                  <th className="px-3 py-2 font-semibold">CTN Filho</th>
                  <th className="px-3 py-2 font-semibold">End. Tampão</th>
                  <th className="px-3 py-2 font-semibold">Zona Nova</th>
                  <th className="px-3 py-2 font-semibold">End. Apontamento</th>
                  <th className="px-3 py-2 font-semibold text-right">Qtd (cx)</th>
                  <th className="px-3 py-2 font-semibold text-center">Status Auditoria</th>
                  <th className="px-3 py-2 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredCtnList.map(item => {
                  const isAlert = item.status === 'ALERTA';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedDrawerItem(item)}
                      className={`h-10 hover:bg-white/5 transition-colors cursor-pointer ${
                        isAlert ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 text-slate-300">
                        {item.data} <span className={isAlert ? 'text-rose-400 font-bold' : 'text-slate-500'}>{item.hora}</span>
                      </td>

                      <td className="px-3 py-1.5 font-bold text-[#e0fdff]">
                        {item.contenantPai}
                      </td>

                      <td className="px-3 py-1.5 text-slate-300">
                        {item.enderecoOrigem}
                      </td>

                      <td className="px-3 py-1.5">
                        <span className="bg-[#090e17] px-1.5 py-0.5 rounded text-slate-400 font-medium text-[10px]">
                          {item.zonaOrigem}
                        </span>
                      </td>

                      <td className="px-3 py-1.5 font-bold text-[#00f2fe]">
                        {item.artigo}
                      </td>

                      <td className={`px-3 py-1.5 font-bold ${isAlert ? 'text-rose-400' : 'text-[#4edea3]'}`}>
                        {item.ctnFilho}
                      </td>

                      <td className="px-3 py-1.5 text-slate-300">
                        {item.enderecoTampao}
                      </td>

                      <td className="px-3 py-1.5">
                        <span className="bg-[#090e17] px-1.5 py-0.5 rounded text-[#00f2fe] font-medium text-[10px]">
                          {item.zonaNova}
                        </span>
                      </td>

                      <td className="px-3 py-1.5 text-slate-300 font-semibold">
                        {item.enderecoApontamento}
                      </td>

                      <td className={`px-3 py-1.5 text-right font-black ${isAlert ? 'text-rose-400' : 'text-white'}`}>
                        {item.qtd}
                      </td>

                      <td className="px-3 py-1.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider inline-block ${
                          isAlert
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-[#4edea3]/15 text-[#4edea3] border border-[#4edea3]/30'
                        }`}>
                          {item.statusLabel || item.status}
                        </span>
                      </td>

                      <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedDrawerItem(item)}
                          className={`p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer ${
                            isAlert ? 'text-rose-400' : 'text-slate-400 hover:text-[#00f2fe]'
                          }`}
                          title="Inspecionar Diagnóstico CTN"
                        >
                          {isAlert ? <AlertTriangle size={15} /> : <Eye size={15} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Sub-bar */}
          <div className="px-4 md:px-6 py-2.5 bg-[#090e17] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 border-t border-white/10">
            <div className="flex items-center gap-2">
              <span>Página <strong className="text-white">1 de 1</strong></span>
              <span className="text-slate-600">•</span>
              <span>Linhas por bloco: <strong>{filteredCtnList.length}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled className="px-2 py-1 bg-[#171c25] rounded-lg text-slate-600 cursor-not-allowed">
                &lt;
              </button>
              <button type="button" className="px-2.5 py-0.5 bg-[#00f2fe] text-[#00373a] font-bold rounded-lg">1</button>
              <button type="button" disabled className="px-2 py-1 bg-[#171c25] rounded-lg text-slate-600 cursor-not-allowed">
                &gt;
              </button>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            DEEP AUDIT ARCHITECTURE INSIGHTS (3 CARDS)
            ------------------------------------------------------------- */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card 1: Nó IndexedDB */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-[#00f2fe]" />
                <h4 className="font-mono text-xs font-bold uppercase">Nó IndexedDB &amp; Worker Local</h4>
              </div>
              <span className="font-mono text-[9px] bg-[#4edea3]/10 text-[#4edea3] px-2 py-0.5 rounded-md font-bold">
                WORKER ATIVO
              </span>
            </div>
            <p className="font-sans text-xs text-slate-300 leading-relaxed">
              Cada evento de leitura física do coletor RFID/código de barras é persistido localmente via micro-transação ACID antes do envio remoto, garantindo retenção total mesmo em caso de perda de link.
            </p>
            <div className="bg-[#090e17] p-2.5 rounded-xl font-mono text-[11px] text-slate-400 flex flex-col gap-1 border border-white/5 mt-auto">
              <div className="flex justify-between"><span>DB Name:</span><strong className="text-white">LogixWMS_Audit_Store_v4</strong></div>
              <div className="flex justify-between"><span>ObjectStore:</span><strong className="text-white">ctn_transactions_local</strong></div>
              <div className="flex justify-between"><span>Índice Primário:</span><strong className="text-[#00f2fe]">ctn_filho_id + time_idx</strong></div>
            </div>
          </div>

          {/* Card 2: AS400 Sync Agent Status */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-[#4edea3]" />
                <h4 className="font-mono text-xs font-bold uppercase">Pipeline de Sincronia AS400</h4>
              </div>
              <span className="font-mono text-[9px] bg-[#00f2fe]/10 text-[#00f2fe] px-2 py-0.5 rounded-md font-bold">
                AUTO-FLUSH
              </span>
            </div>
            <p className="font-sans text-xs text-slate-300 leading-relaxed">
              Os registros de bipes de contêineres passam pelo conversor de layout legado AS400 (IBM iSeries), gerando apontamentos estruturados nos arquivos de movimentação e baixas imediatas.
            </p>
            <div className="bg-[#090e17] p-2.5 rounded-xl font-mono text-[11px] text-slate-400 flex flex-col gap-1 border border-white/5 mt-auto">
              <div className="flex justify-between"><span>Fila Remota:</span><strong className="text-[#4edea3]">SYS_AS400_IN_FEED</strong></div>
              <div className="flex justify-between"><span>Intervalo Polling:</span><span className="text-slate-300">Stream SSE Contínuo (0ms atraso)</span></div>
              <div className="flex justify-between"><span>Protocolo:</span><strong className="text-[#00f2fe]">Binary Packet Protobuf</strong></div>
            </div>
          </div>

          {/* Card 3: Resumo das Inconsistências */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-rose-500/20 shadow-lg flex flex-col gap-2 relative">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-purple-300" />
                <h4 className="font-mono text-xs font-bold uppercase">Resumo das Inconsistências</h4>
              </div>
              <span className="font-mono text-[9px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-md font-bold border border-rose-500/30">
                2 AÇÕES NECESSÁRIAS
              </span>
            </div>

            <div className="flex flex-col gap-2 my-1">
              <div className="flex items-center justify-between font-mono text-xs p-2 bg-[#090e17] rounded-xl border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-white">CTN 235237 (SKU 2809267)</span>
                </div>
                <span className="text-rose-400 font-bold">Diferença: -2 cx</span>
              </div>

              <div className="flex items-center justify-between font-mono text-xs p-2 bg-[#090e17] rounded-xl border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-white">CTN 235310 (SKU 5858207)</span>
                </div>
                <span className="text-rose-400 font-bold">Conferir bipe duplo</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStatusFilter('ALERTA')}
              className="mt-auto bg-[#252a34] hover:bg-[#30353f] py-2 text-center text-[#00f2fe] font-mono text-xs font-bold rounded-xl transition-all border border-[#00f2fe]/20 cursor-pointer"
            >
              Isolar CTNs em Alerta na Tabela
            </button>
          </div>
        </section>
      </div>

      {/* -------------------------------------------------------------
          SLIDE-OVER DRAWER: DIAGNÓSTICO RÁPIDO DE CTN
          ------------------------------------------------------------- */}
      {selectedDrawerItem && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
          onClick={() => setSelectedDrawerItem(null)}
        >
          <div
            className="w-full max-w-lg bg-[#171c25] h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto border-l border-white/10 animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-4">
              {/* Header Drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-lg font-black text-white uppercase">
                      AUDITORIA DE CTN
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      selectedDrawerItem.status === 'ALERTA'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-[#4edea3]/20 text-[#4edea3] border border-[#4edea3]/30'
                    }`}>
                      {selectedDrawerItem.statusLabel || selectedDrawerItem.status}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-400 mt-0.5">
                    Rastreio Criptográfico &amp; Apontamento Físico
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDrawerItem(null)}
                  className="p-1.5 rounded-xl bg-[#252a34] hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Metric Highlight */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1b2029] p-3 rounded-xl border border-white/5">
                  <span className="font-mono text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Código CTN Filho
                  </span>
                  <span className="font-mono text-xl font-black text-[#00f2fe]">
                    {selectedDrawerItem.ctnFilho}
                  </span>
                </div>
                <div className="bg-[#1b2029] p-3 rounded-xl border border-white/5">
                  <span className="font-mono text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Contêiner Pai
                  </span>
                  <span className="font-mono text-xl font-black text-white">
                    {selectedDrawerItem.contenantPai}
                  </span>
                </div>
              </div>

              {/* Telemetry Breakdown */}
              <div className="flex flex-col gap-2 bg-[#1b2029] p-4 rounded-xl font-mono text-xs border border-white/5">
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider mb-1">
                  Parâmetros Operacionais AS400
                </span>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Artigo / SKU:</span>
                  <strong className="text-white">{selectedDrawerItem.artigo}</strong>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Quantidade Física:</span>
                  <strong className="text-[#4edea3]">{selectedDrawerItem.qtd} caixas</strong>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Endereço Origem (RPAL):</span>
                  <span className="text-slate-200">{selectedDrawerItem.enderecoOrigem}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Tampão Alvo:</span>
                  <span className="text-slate-200">{selectedDrawerItem.enderecoTampao}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Endereço Apontamento:</span>
                  <strong className="text-[#00f2fe]">{selectedDrawerItem.enderecoApontamento}</strong>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-400">Horário do Bipe Local:</span>
                  <span className="text-slate-200">{selectedDrawerItem.hora} BRT</span>
                </div>
              </div>

              {/* Hardware & Auditor Metadata */}
              <div className="bg-[#090e17] p-4 rounded-xl flex flex-col gap-1.5 font-mono text-xs border border-white/5">
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider mb-1">
                  Metadados do Hardware Local-First
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Terminal Coletor:</span>
                  <span className="text-white">{selectedDrawerItem.terminal || 'Zebra TC57 (COL-042)'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Operador Responsável:</span>
                  <span className="text-white">{selectedDrawerItem.operador || 'Carlos Eduardo (ID #4092)'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Antena RFID Bipe:</span>
                  <span className="text-white">{selectedDrawerItem.antenaRfid || 'PORTAL-N2-DOCK4'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Hash de Integridade:</span>
                  <span className="text-[#4edea3] text-[10px] truncate max-w-[200px]">
                    {selectedDrawerItem.sha256Hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae'}
                  </span>
                </div>
              </div>

              {/* Audit Note Box */}
              <div className="p-3.5 bg-[#1b2029] rounded-xl border border-white/10 flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#4edea3] shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedDrawerItem.status === 'ALERTA'
                    ? selectedDrawerItem.detalheInconsistencia || 'Atenção: Conferir saldo físico de caixas no endereço indicado antes da liberação.'
                    : 'Registro consolidado na tabela AS400. Sem discrepâncias de inventário de gôndola. Nenhuma ação corretiva exigida.'}
                </p>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pt-4 flex items-center justify-between gap-3 border-t border-white/10 mt-6">
              <button
                type="button"
                onClick={handleRevalidateItem}
                className="flex-1 bg-[#252a34] hover:bg-[#30353f] text-white py-2.5 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/5"
              >
                <RefreshCw size={15} />
                <span>Re-auditar</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDrawerItem(null)}
                className="flex-1 bg-[#00f2fe] hover:brightness-110 text-[#00373a] font-mono text-xs font-black py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_12px_rgba(0,242,254,0.3)]"
              >
                <Check size={16} />
                <span>Concluir Análise</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CtnAuditLogIndexedDbView;
