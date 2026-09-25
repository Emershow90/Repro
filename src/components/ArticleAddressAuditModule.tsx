/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MÓDULO DE GESTÃO, DASHBOARDS E AUDITORIA DE ARTIGO, ENDEREÇO E CTN
 * 100% Compatível com Diretrizes de Segurança Corporativas (IndexedDB Local)
 * Não utiliza banco de dados externo ou queries não autorizadas.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  Layers,
  MapPin,
  Box,
  Hash,
  Calendar,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Building2,
  BarChart3,
  HelpCircle,
  Clock,
  GitCommit,
  Database,
  Flame
} from 'lucide-react';
import StreetHeatmapAnalytics from './StreetHeatmapAnalytics';
import {
  ArticleAddressRecord,
  ArticleAddressStats,
  saveArticleAddressRecord,
  saveBulkArticleAddressRecords,
  deleteArticleAddressRecord,
  computeArticleAddressStats,
  parseStreetAndSectorFromAddress,
  auditArticleAddressRecord,
  parsePastedSpreadsheetText,
  exportRecordsToExcel,
  exportRecordsToCsv
} from '../services/articleAddressService';
import { fetchGoogleSheetData } from '../services/googleSheetsService';
import { FiveSVisualReminder } from './FiveSVisualReminder';
import { AddressMapVisualizer } from './AddressMapVisualizer';
import { SequentialFlowAnalysis } from './SequentialFlowAnalysis';
import { SpreadsheetPlanAuditValidator } from './SpreadsheetPlanAuditValidator';
import { DigitalTwinSpatialMap } from './DigitalTwinSpatialMap';
import { StreetTopologyDensityMatrix } from './StreetTopologyDensityMatrix';
import { CtnAuditLogIndexedDbView } from './CtnAuditLogIndexedDbView';
import { Log } from '../types';
import { useArticleAudit } from '../hooks/useArticleAudit';

interface ArticleAddressAuditModuleProps {
  logs?: Log[];
  onNotify?: (message: string, color?: string) => void;
  onNavigateToStreet?: (street: string) => void;
}

export const ArticleAddressAuditModule: React.FC<ArticleAddressAuditModuleProps> = ({ 
  logs = [], 
  onNotify,
  onNavigateToStreet
}) => {
  const { records, setRecords, loading, refreshRecords } = useArticleAudit();

  // 2. Filtros Globais
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('TODOS');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'VALIDADOR_PLANILHA' | 'DASHBOARD' | 'MAPA_3D_ESPACIAL' | 'MAPEAMENTO_ENDERECOS' | 'FLUXO_SEQUENCIAL' | 'EXPLORADOR_RUAS' | 'AUDITORIA' | 'LEMBRETE_5S' | 'TABELA_REGISTROS' | 'HEATMAP_HISTORICO'>('VALIDADOR_PLANILHA');

  // 3. Estado do Formulário de Registro Manual
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [formArtigo, setFormArtigo] = useState<string>('');
  const [formEndereco, setFormEndereco] = useState<string>('');
  const [formCtn, setFormCtn] = useState<string>('1');
  const [formData, setFormData] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [formColaborador, setFormColaborador] = useState<string>('EMERSON GONÇALVES');
  const [formObs, setFormObs] = useState<string>('');

  // 4. Estado da Importação de Planilha
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');
  const [importPreviewCount, setImportPreviewCount] = useState<{ valid: number; errors: number } | null>(null);

  // 5. Estado de Acordeão
  const [expandedStreets, setExpandedStreets] = useState<Record<string, boolean>>({});

  // Recalcula estatísticas e agregações
  const stats: ArticleAddressStats = useMemo(() => {
    return computeArticleAddressStats(records, selectedDateFilter, selectedSectorFilter);
  }, [records, selectedDateFilter, selectedSectorFilter]);

  // Lista de registros filtrada
  const displayRecords = useMemo(() => {
    let list = records;
    if (selectedDateFilter !== 'TODOS') {
      list = list.filter(r => r.data === selectedDateFilter);
    }
    if (selectedSectorFilter !== 'TODOS') {
      list = list.filter(r => r.setor === selectedSectorFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toUpperCase();
      list = list.filter(r => 
        r.artigo.toUpperCase().includes(q) ||
        r.endereco.toUpperCase().includes(q) ||
        r.rua.toUpperCase().includes(q) ||
        String(r.ctn).includes(q) ||
        (r.colaborador && r.colaborador.toUpperCase().includes(q))
      );
    }
    return list.sort((a, b) => b.criadoEm - a.criadoEm);
  }, [records, selectedDateFilter, selectedSectorFilter, searchTerm]);

  // Salvar registro manual
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formArtigo.trim() || !formEndereco.trim()) {
      if (onNotify) onNotify('Preencha ao menos o Artigo e o Endereço', 'var(--color-warning)');
      return;
    }

    const { rua, setor } = parseStreetAndSectorFromAddress(formEndereco);
    const ctnNum = parseInt(formCtn, 10) || 1;

    const newRecord: ArticleAddressRecord = {
      id: `rec-usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      data: formData,
      artigo: formArtigo.trim().toUpperCase(),
      endereco: formEndereco.trim().toUpperCase(),
      ctn: formCtn.trim() || '1',
      rua: rua.toUpperCase(),
      setor,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      colaborador: formColaborador.trim() || 'OPERADOR',
      origem: 'MANUAL',
      observacoes: formObs.trim(),
      statusAuditoria: 'VALIDADO',
      mensagensAuditoria: [],
      criadoEm: Date.now()
    };

    const audit = auditArticleAddressRecord(newRecord, records);
    newRecord.statusAuditoria = audit.status;
    newRecord.mensagensAuditoria = audit.mensagens;

    const ok = await saveArticleAddressRecord(newRecord);
    if (ok) {
      refreshRecords();
      setFormArtigo('');
      setFormEndereco('');
      setFormCtn('1');
      setFormObs('');
      setShowManualForm(false);
      if (onNotify) onNotify(`Artigo ${newRecord.artigo} registrado!`, 'var(--color-success)');
    } else {
      if (onNotify) onNotify('Erro ao salvar', 'var(--color-danger)');
    }
  };

  // Processa colagem de planilha
  const handlePreviewPasted = () => {
    if (!pasteText.trim()) {
      setImportPreviewCount(null);
      return;
    }
    const { validRecords, errorCount } = parsePastedSpreadsheetText(pasteText, formData, formColaborador);
    setImportPreviewCount({ valid: validRecords.length, errors: errorCount });
  };

  // Conclui importação da planilha
  const handleConfirmImport = async () => {
    if (!pasteText.trim()) return;
    const { validRecords } = parsePastedSpreadsheetText(pasteText, formData, formColaborador);
    if (validRecords.length === 0) {
      if (onNotify) onNotify('Nenhum registro válido detectado no texto colado', 'var(--color-warning)');
      return;
    }

    const ok = await saveBulkArticleAddressRecords(validRecords);
    if (ok) {
      await refreshRecords();
      setShowImportModal(false);
      setPasteText('');
      setImportPreviewCount(null);
      if (onNotify) onNotify(`${validRecords.length} registros importados com sucesso para a base local!`, 'var(--color-success)');
    }
  };

  // Excluir registro
  const handleDeleteRecord = async (id: string) => {
    if (window.confirm('Deseja excluir este registro de artigo e endereço?')) {
      const ok = await deleteArticleAddressRecord(id);
      if (ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
        if (onNotify) onNotify('Registro excluído com sucesso.', 'var(--color-warning)');
      }
    }
  };

  // Exportações
  const handleExportExcel = () => {
    try {
      exportRecordsToExcel(displayRecords);
      if (onNotify) onNotify('Arquivo Excel (.xlsx) exportado com sucesso!', 'var(--color-success)');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      if (onNotify) onNotify('Falha ao gerar arquivo Excel.', 'var(--color-danger)');
    }
  };

  const handleExportCsv = () => {
    const csv = exportRecordsToCsv(displayRecords);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Auditoria_Artigos_${selectedDateFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (onNotify) onNotify('Arquivo CSV exportado com sucesso!', 'var(--color-success)');
  };

  // Toggle acordeão de rua
  const toggleStreetExpand = (rua: string) => {
    setExpandedStreets(prev => ({
      ...prev,
      [rua]: !prev[rua]
    }));
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 animate-in fade-in duration-300 pb-12">
      {/* -------------------------------------------------------------
          1. CABEÇALHO DO MÓDULO & REGRA DE SEGURANÇA CORPORATIVA
          ------------------------------------------------------------- */}
      <header className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        {/* Glow Decorativo de Fundo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-white tracking-wide uppercase font-mono flex items-center gap-2">
                  <span>AUDITORIA DE ARTIGO, ENDEREÇO E CTN</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-sans font-bold">
                    LOCAL SEGURO
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Armazenamento em banco de dados local (IndexedDB) • Sem queries remotas ou violações de segurança de rede
                </p>
              </div>
            </div>
          </div>

          {/* Botões de Ação Primária */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-open-manual-form"
              type="button"
              onClick={() => setShowManualForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95"
            >
              <Plus size={15} />
              <span>Novo Registro</span>
            </button>

            <button
              id="btn-open-import-modal"
              type="button"
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-semibold text-xs transition-all cursor-pointer"
            >
              <Upload size={14} className="text-cyan-400" />
              <span>Colar Planilha (Excel/Sheets)</span>
            </button>

            <button
              id="btn-export-excel"
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-emerald-400 font-semibold text-xs transition-all cursor-pointer"
              title="Exportar para Excel (.xlsx)"
            >
              <Download size={14} />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------------
            BARRA DE FILTRO TEMPORAL & SETOR (DEMANDA DE DIAS VARIADOS)
            ------------------------------------------------------------- */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor do Dia de Registro */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-white/10">
              <Calendar size={14} className="text-cyan-400" />
              <span className="text-slate-400 font-mono">Dia de Registro:</span>
              <select
                id="select-date-filter"
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer pr-2"
              >
                <option value="TODOS" className="bg-slate-900 text-white">Todos os Dias Registrados</option>
                {stats.datasDisponiveis.map(d => (
                  <option key={d} value={d} className="bg-slate-900 text-white">
                    {d} {d === new Date().toISOString().split('T')[0] ? '(Hoje)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Seletor de Setor */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-white/10">
              <Layers size={14} className="text-purple-400" />
              <span className="text-slate-400 font-mono">Setor:</span>
              <select
                id="select-sector-filter"
                value={selectedSectorFilter}
                onChange={(e) => setSelectedSectorFilter(e.target.value)}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer pr-2"
              >
                <option value="TODOS" className="bg-slate-900 text-white">Todos os Setores</option>
                <option value="87" className="bg-slate-900 text-white">Setor 87 Solo</option>
                <option value="88" className="bg-slate-900 text-white">Setor 88</option>
                <option value="89" className="bg-slate-900 text-white">Setor 89</option>
                <option value="90" className="bg-slate-900 text-white">Setor 90</option>
              </select>
            </div>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="input-article-search"
              type="text"
              placeholder="Buscar artigo, endereço ou rua..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/90 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
          1.5. LEMBRETE VISUAL 5S COM DEGRADÊ OPERACIONAL REPRO
          ------------------------------------------------------------- */}
      <FiveSVisualReminder
        activeStreet={records[0]?.rua || 'B4VD'}
        activeSector={records[0]?.setor || '87'}
        onNotify={onNotify}
      />

      {/* -------------------------------------------------------------
          2. SCORECARD DE KPIs (ARTIGOS, RUAS, CTN & AUDITORIA)
          ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* KPI 1: Artigos Únicos */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono font-semibold uppercase">Artigos Únicos</span>
            <Box size={16} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.totalArtigosUnicos}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats.totalRegistros} registros catalogados
          </div>
        </div>

        {/* KPI 2: Endereços Alocados */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono font-semibold uppercase">Endereços</span>
            <MapPin size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.totalEnderecosUnicos}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats.enderecosPorRua.length} ruas com carga
          </div>
        </div>

        {/* KPI 3: Volume de CTNs (Caixas) */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono font-semibold uppercase">Total de CTNs</span>
            <Layers size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.totalCtn} cx</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Média de {stats.mediaCtnPorEndereco} cx/endereço
          </div>
        </div>

        {/* KPI 4: Média Endereços por Rua */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono font-semibold uppercase">Densidade de Ruas</span>
            <Building2 size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.mediaEnderecosPorRua}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            endereços / rua em média
          </div>
        </div>

        {/* KPI 5: Integridade e Auditoria */}
        <div className="col-span-2 sm:col-span-1 bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono font-semibold uppercase">Integridade</span>
            <ShieldCheck size={16} className={stats.taxaIntegridade >= 95 ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black font-mono ${stats.taxaIntegridade >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {stats.taxaIntegridade}%
            </span>
            <span className="text-[11px] text-slate-400">auditado</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">{stats.auditoriaResumo.validados} ok</span>
            <span>•</span>
            <span className="text-amber-400 font-bold">{stats.auditoriaResumo.alertas} avisos</span>
            {stats.auditoriaResumo.inconsistentes > 0 && (
              <>
                <span>•</span>
                <span className="text-rose-400 font-bold">{stats.auditoriaResumo.inconsistentes} erros</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          3. NAVEGAÇÃO ENTRE AS VISÕES DO MÓDULO
          ------------------------------------------------------------- */}
      <div className="flex flex-wrap border-b border-white/10 gap-1 sm:gap-2 mb-4">
        {[
          { tab: 'VALIDADOR_PLANILHA', icon: FileSpreadsheet, label: 'VALIDAR' },
          { tab: 'HEATMAP_HISTORICO', icon: Flame, label: 'HEATMAP & TEMPO' },
          { tab: 'DASHBOARD', icon: BarChart3, label: 'DASHBOARD' },
          { tab: 'MAPA_3D_ESPACIAL', icon: Layers, label: 'MAPA 2D / 3D' },
          { tab: 'FLUXO_SEQUENCIAL', icon: GitCommit, label: 'FLUXO' },
          { tab: 'EXPLORADOR_RUAS', icon: Building2, label: 'RUAS' },
          { tab: 'TABELA_REGISTROS', icon: Database, label: 'REGISTROS' },
          { tab: 'AUDITORIA', icon: ShieldCheck, label: 'AUDITORIA' },
          { tab: 'LEMBRETE_5S', icon: Sparkles, label: '5S' },
        ].map(item => (
          <button
            key={item.tab}
            type="button"
            onClick={() => setActiveTab(item.tab as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
              activeTab === item.tab
                ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon size={13} />
            <span>{item.label}</span>
            {item.tab === 'AUDITORIA' && (stats.auditoriaResumo.alertas + stats.auditoriaResumo.inconsistentes) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[9px]">
                {stats.auditoriaResumo.alertas + stats.auditoriaResumo.inconsistentes}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------------
          TAB 0: VALIDADOR & AUDITOR OPERACIONAL (PLANILHA vs. SISTEMA REAL)
          ------------------------------------------------------------- */}
      {activeTab === 'VALIDADOR_PLANILHA' && (
        <div className="animate-in fade-in duration-200">
          <SpreadsheetPlanAuditValidator
            logs={logs || []}
            articleRecords={records}
            onRefreshRecords={refreshRecords}
            onAddRecords={async (newRecords) => {
              await saveBulkArticleAddressRecords(newRecords);
              await refreshRecords();
            }}
            onNotify={onNotify}
            onNavigateToStreet={onNavigateToStreet}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB: MAPA DE CALOR, TEMPO GASTO E HISTÓRICO DAS RUAS
          ------------------------------------------------------------- */}
      {activeTab === 'HEATMAP_HISTORICO' && (
        <div className="animate-in fade-in duration-200">
          <StreetHeatmapAnalytics
            logs={logs || []}
            activeSectorId={selectedSectorFilter}
            onAddToast={onNotify}
            onSelectStreet={onNavigateToStreet}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 1: DASHBOARD DE ARTIGOS MAIS ENDEREÇADOS E RUAS
          ------------------------------------------------------------- */}
      {activeTab === 'DASHBOARD' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in duration-200">
          {/* Card: Top Artigos Mais Endereçados (Maior CTN e Endereços) */}
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm md:text-base font-black text-white uppercase font-mono flex items-center gap-2">
                  <Box size={17} className="text-cyan-400" />
                  <span>ARTIGOS MAIS ENDEREÇADOS</span>
                </h2>
                <p className="text-xs text-slate-400">Classificação por volume de CTN e dispersão de endereços</p>
              </div>
              <span className="text-[11px] font-mono bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                Top {stats.topArtigos.length}
              </span>
            </div>

            {stats.topArtigos.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                Nenhum dado encontrado para o filtro selecionado.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.topArtigos.slice(0, 8).map((art, idx) => {
                  const maxCtn = stats.topArtigos[0]?.totalCtn || 1;
                  const pct = Math.min(100, Math.round((art.totalCtn / maxCtn) * 100));
                  return (
                    <div key={art.artigo} className="bg-slate-950/60 border border-white/5 rounded-xl p-3 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-mono font-bold">
                            #{idx + 1}
                          </span>
                          <span className="text-white font-mono font-black text-sm">{art.artigo}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-cyan-400 font-mono font-black text-sm">{art.totalCtn} cx</span>
                          <span className="text-slate-400 text-xs ml-2 font-mono">({art.totalEnderecos} endereços)</span>
                        </div>
                      </div>

                      {/* Barra de Progresso Visual */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Ruas onde o artigo está alocado */}
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                        <span className="text-slate-500">Ruas:</span>
                        {art.ruas.map(r => (
                          <span key={r} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card: Ruas com Mais Endereços e Demanda */}
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm md:text-base font-black text-white uppercase font-mono flex items-center gap-2">
                  <MapPin size={17} className="text-emerald-400" />
                  <span>RUAS COM MAIOR OCUPAÇÃO</span>
                </h2>
                <p className="text-xs text-slate-400">Quantos endereços foram registrados por rua e carga de CTN</p>
              </div>
              <span className="text-[11px] font-mono bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                {stats.topRuas.length} ruas ativas
              </span>
            </div>

            {stats.topRuas.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                Nenhum dado encontrado para o filtro selecionado.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.topRuas.slice(0, 8).map((rua, idx) => {
                  const maxEnd = stats.topRuas[0]?.totalEnderecos || 1;
                  const pct = Math.min(100, Math.round((rua.totalEnderecos / maxEnd) * 100));
                  return (
                    <div key={rua.rua} className="bg-slate-950/60 border border-white/5 rounded-xl p-3 hover:border-emerald-500/30 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-mono font-bold">
                            #{idx + 1}
                          </span>
                          <span className="text-white font-mono font-black text-sm">{rua.rua}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                            Setor {rua.setor}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-emerald-400 font-mono font-black text-sm">{rua.totalEnderecos} endereços</span>
                          <span className="text-slate-400 text-xs ml-2 font-mono">({rua.totalCtn} cx)</span>
                        </div>
                      </div>

                      {/* Barra de Progresso Visual */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Quantos e quais artigos estão na rua */}
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                        <span className="text-slate-500">{rua.totalArtigos} artigo(s):</span>
                        {rua.artigos.slice(0, 6).map(art => (
                          <span key={art} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                            {art}
                          </span>
                        ))}
                        {rua.artigos.length > 6 && (
                          <span className="text-[10px] text-slate-500 font-mono">+{rua.artigos.length - 6}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB: DIGITAL TWIN & PLANTA ESPACIAL (MAPA 2D / 3D)
          ------------------------------------------------------------- */}
      {activeTab === 'MAPA_3D_ESPACIAL' && (
        <div className="animate-in fade-in duration-200">
          <DigitalTwinSpatialMap
            records={displayRecords}
            onNotify={onNotify}
            onNavigateToStreet={onNavigateToStreet}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB: ANÁLISE DE FLUXO SEQUENCIAL DE REABASTECIMENTO
          ------------------------------------------------------------- */}
      {activeTab === 'FLUXO_SEQUENCIAL' && (
        <div className="animate-in fade-in duration-200">
          <SequentialFlowAnalysis
            records={displayRecords}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB: GUIA VISUAL E CHECKLIST COMPLETO 5S DEGRADÊ
          ------------------------------------------------------------- */}
      {activeTab === 'LEMBRETE_5S' && (
        <div className="animate-in fade-in duration-200 space-y-4">
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-white uppercase font-mono">
                    PROGRAMA 5S LOGÍSTICO REPRO (DEGRADÊ VISUAL)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Os 5 sensos da metodologia aplicados ao reabastecimento de solo e volumosos
                  </p>
                </div>
              </div>
            </div>

            <FiveSVisualReminder
              activeStreet={records[0]?.rua || 'B4VD'}
              activeSector={records[0]?.setor || '87'}
              mode="full"
              onNotify={onNotify}
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 2: CATÁLOGO E DENSIDADE DE RUAS // SETOR 87 (RUAS)
          ------------------------------------------------------------- */}
      {activeTab === 'EXPLORADOR_RUAS' && (
        <div className="animate-in fade-in duration-200">
          <StreetTopologyDensityMatrix
            records={displayRecords}
            onNotify={onNotify}
            onNavigateToStreet={onNavigateToStreet}
            onViewIn3D={(st) => {
              setActiveTab('MAPA_3D_ESPACIAL');
              if (onNotify) onNotify(`Focando corredor ${st} no Digital Twin`, 'var(--color-info)');
            }}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 3: AUDITORIA & VALIDAÇÃO DE CONSISTÊNCIA
          ------------------------------------------------------------- */}
      {activeTab === 'AUDITORIA' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-black text-white uppercase font-mono flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" />
                <span>RELATÓRIO DE AUDITORIA E VALIDAÇÃO DA PLANILHA</span>
              </h2>
              <p className="text-xs text-slate-400">
                Audita automaticamente conflitos de endereço no mesmo dia, dispersão de artigos e erros de digitação manual
              </p>
            </div>
            <button
              type="button"
              onClick={refreshRecords}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Auditar Base Novamente</span>
            </button>
          </div>

          {/* Resumo Rápido das Regras Auditadas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>{stats.auditoriaResumo.validados} Registros 100% Válidos</strong>
                <p className="text-[11px] text-emerald-400/80 mt-0.5">Sem colisões de endereço ou discrepância de CTN.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>{stats.auditoriaResumo.alertas} Alertas de Atenção</strong>
                <p className="text-[11px] text-amber-400/80 mt-0.5">Endereços compartilhados ou artigos muito dispersos.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-2">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>{stats.auditoriaResumo.inconsistentes} Inconsistências Críticas</strong>
                <p className="text-[11px] text-rose-400/80 mt-0.5">Campos obrigatórios em branco ou CTN nulo.</p>
              </div>
            </div>
          </div>

          {/* Tabela de Registros com Avisos ou Inconsistências */}
          <div className="mt-4">
            <h3 className="text-xs font-mono uppercase font-bold text-slate-300 mb-2">
              Itens que Requerem Conferência:
            </h3>
            {displayRecords.filter(r => r.statusAuditoria !== 'VALIDADO').length === 0 ? (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8 text-center text-emerald-400 text-xs">
                <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400" />
                <strong className="text-sm block">Base 100% Consistente!</strong>
                Nenhuma inconsistência ou conflito detectado nos registros selecionados.
              </div>
            ) : (
              <div className="space-y-2">
                {displayRecords
                  .filter(r => r.statusAuditoria !== 'VALIDADO')
                  .map(rec => (
                    <div
                      key={rec.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        rec.statusAuditoria === 'INCONSISTENTE'
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                          : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-white">
                            Artigo: {rec.artigo || '(Vazio)'}
                          </span>
                          <span className="font-mono font-bold text-xs text-cyan-300">
                            Endereço: {rec.endereco || '(Vazio)'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300">
                            {rec.data}
                          </span>
                        </div>
                        <ul className="text-xs list-disc list-inside space-y-0.5 opacity-90">
                          {rec.mensagensAuditoria.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs transition-colors"
                          title="Excluir registro com erro"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 4: LOG DE REGISTROS CTN & SINCRONIZAÇÃO INDEXEDDB (REGISTROS)
          ------------------------------------------------------------- */}
      {activeTab === 'TABELA_REGISTROS' && (
        <div className="animate-in fade-in duration-200">
          <CtnAuditLogIndexedDbView
            records={displayRecords}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL / FORMULÁRIO DE NOVO REGISTRO MANUAL
          ------------------------------------------------------------- */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white uppercase font-mono flex items-center gap-2">
                <Plus size={18} className="text-cyan-400" />
                <span>NOVO REGISTRO DE ARTIGO & ENDEREÇO</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* Data de Registro */}
                <div>
                  <label className="block text-slate-400 font-mono mb-1">Data de Registro</label>
                  <input
                    type="date"
                    required
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Flexível para dias anteriores</span>
                </div>

                {/* Quantidade de CTN (Caixas) */}
                <div>
                  <label className="block text-slate-400 font-mono mb-1">CTN (Quantidade de Caixas)</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    required
                    value={formCtn}
                    onChange={(e) => setFormCtn(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-black focus:border-cyan-500 focus:outline-none"
                    placeholder="Ex: 12"
                  />
                </div>
              </div>

              {/* Endereço (com auto-detecção de rua) */}
              <div>
                <label className="block text-slate-400 font-mono mb-1">
                  Endereço do Galpão (Ex: B4VD-02, B4VA-01)
                </label>
                <input
                  type="text"
                  required
                  value={formEndereco}
                  onChange={(e) => setFormEndereco(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold uppercase focus:border-cyan-500 focus:outline-none"
                  placeholder="Ex: B4VD-02"
                />
                {formEndereco && (() => {
                  const formInferred = parseStreetAndSectorFromAddress(formEndereco);
                  return (
                    <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-2">
                      <span>Rua detectada: <strong className="text-white">{formInferred.rua}</strong></span>
                      <span>•</span>
                      <span>Setor: <strong className="text-purple-300">{formInferred.setor}</strong></span>
                    </div>
                  );
                })()}
              </div>

              {/* Código ou Descrição do Artigo */}
              <div>
                <label className="block text-slate-400 font-mono mb-1">Código / SKU do Artigo</label>
                <input
                  type="text"
                  required
                  value={formArtigo}
                  onChange={(e) => setFormArtigo(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-cyan-300 font-mono font-bold uppercase focus:border-cyan-500 focus:outline-none"
                  placeholder="Ex: ART-3091 ou 849201"
                />
              </div>

              {/* Observações Opcionais */}
              <div>
                <label className="block text-slate-400 font-mono mb-1">Observações / Lote (Opcional)</label>
                <input
                  type="text"
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                  placeholder="Ex: Palete conferido, reposição prioritária"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs shadow-lg shadow-cyan-500/20"
                >
                  Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL DE IMPORTAÇÃO DIRETA DE PLANILHA (COLAR EXCEL / SHEETS)
          ------------------------------------------------------------- */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-white uppercase font-mono flex items-center gap-2">
                  <Upload size={18} className="text-cyan-400" />
                  <span>IMPORTAÇÃO INTELIGENTE DE PLANILHA (EXCEL / SHEETS)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Copie as colunas de sua planilha e cole diretamente na caixa abaixo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-white/10 text-slate-400 space-y-1">
                <strong className="text-white block font-mono">Formato Sugerido de Colunas:</strong>
                <p className="font-mono text-[11px] text-cyan-300">
                  Artigo [TAB] Endereço [TAB] CTN [TAB] Data
                </p>
                <p className="text-[10px] text-slate-500">
                  O sistema reconhece automaticamente separadores de coluna por TAB (Excel), ponto e vírgula (;) ou vírgula (,).
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Cole os dados da planilha aqui:
                </label>
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    if (importPreviewCount) setImportPreviewCount(null);
                  }}
                  placeholder="Exemplo colado do Excel:
ART-3091	B4VD-01	14	2026-09-15
ART-4420	B4VD-02	8	2026-09-15
ART-8105	B4VA-01	20	2026-09-14"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Botão de Prévia */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePreviewPasted}
                  disabled={!pasteText.trim()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-white/10 font-mono text-xs cursor-pointer disabled:opacity-40"
                >
                  Analisar Linhas
                </button>

                {importPreviewCount && (
                  <div className="text-xs font-mono">
                    <span className="text-emerald-400 font-bold">{importPreviewCount.valid} válidos</span>
                    {importPreviewCount.errors > 0 && (
                      <span className="text-rose-400 font-bold ml-2">({importPreviewCount.errors} ignorados)</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={!pasteText.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                >
                  Importar para Banco Local
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleAddressAuditModule;
