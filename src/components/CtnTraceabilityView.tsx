import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Layers, 
  Boxes, 
  Box, 
  Barcode, 
  Clock, 
  User, 
  MapPin, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  Copy, 
  Download, 
  Printer, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  ArrowRight, 
  FileText,
  X,
  History,
  Tag
} from 'lucide-react';
import { CtnGenealogyReport, CtnArticleNode, Log, AuditLog } from '../types';
import { searchCtnGenealogy, getRecentCtnsAndArticles, deleteAuditLog } from '../services/dbLocal';

interface CtnTraceabilityViewProps {
  initialCtn?: string;
  onClose?: () => void;
  isModal?: boolean;
  onAddToast?: (msg: string, color?: string) => void;
}

export const CtnTraceabilityView: React.FC<CtnTraceabilityViewProps> = ({
  initialCtn = '',
  onClose,
  isModal = false,
  onAddToast
}) => {
  const [searchTerm, setSearchTerm] = useState(initialCtn);
  const [isSearching, setIsSearching] = useState(false);
  const [report, setReport] = useState<CtnGenealogyReport | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});
  const [recentItems, setRecentItems] = useState<{ ctns: string[]; artigos: string[] }>({ ctns: [], artigos: [] });
  const [activeSubTab, setActiveSubTab] = useState<'arvore' | 'auditoria' | 'bruto'>('arvore');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Carrega sugestões recentes
  const loadRecentItems = async () => {
    try {
      const recent = await getRecentCtnsAndArticles();
      setRecentItems(recent);
    } catch (err) {
      console.error('Erro ao carregar itens recentes:', err);
    }
  };

  useEffect(() => {
    loadRecentItems();
    if (initialCtn) {
      handleSearch(initialCtn);
    } else {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [initialCtn]);

  const handleSearch = async (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchTerm).trim();
    if (!term) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const result = await searchCtnGenealogy(term);
      setReport(result);
      if (result) {
        // Expandir por padrão o primeiro artigo
        const initialExpanded: Record<string, boolean> = {};
        result.artigos.forEach((art, idx) => {
          initialExpanded[art.artigo] = idx === 0 || result.artigos.length <= 3;
        });
        setExpandedArticles(initialExpanded);
      }
    } catch (err) {
      console.error('Erro ao buscar genealogia do CTN:', err);
      if (onAddToast) onAddToast('Erro ao consultar banco de dados local.', 'var(--color-danger)');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const toggleArticleExpand = (artigo: string) => {
    setExpandedArticles(prev => ({
      ...prev,
      [artigo]: !prev[artigo]
    }));
  };

  const handleCopyDossier = () => {
    if (!report) return;

    const linhas: string[] = [
      `=== DOSSIÊ DE RASTREABILIDADE - TERMINAL REPRO ===`,
      `CTN Pai / Palete: ${report.ctnPai}`,
      `Status Operacional: ${report.status}`,
      `Total Caixas Movimentadas: ${report.totalCaixas}`,
      `Artigos Vinculados (${report.artigos.length}): ${report.artigos.map(a => a.artigo).join(', ')}`,
      `Ruas Atendidas: ${report.ruasAtendidas.join(', ') || 'N/D'}`,
      `Operadores: ${report.operadoresEnvolvidos.join(', ') || 'N/D'}`,
      `Primeira Movimentação: ${report.primeiraMovimentacaoTs ? new Date(report.primeiraMovimentacaoTs).toLocaleString('pt-BR') : 'N/D'}`,
      `Última Movimentação: ${report.ultimaMovimentacaoTs ? new Date(report.ultimaMovimentacaoTs).toLocaleString('pt-BR') : 'N/D'}`,
      ``,
      `--- DETALHAMENTO POR ARTIGO ---`
    ];

    report.artigos.forEach(art => {
      linhas.push(`Artigo: ${art.artigo} | Total: ${art.totalCaixas} caixas | Peças Estimadas: ${art.totalPecasEstimadas}`);
      art.gruposFilhos.forEach(g => {
        linhas.push(`  • Lote: ${g.caixaInicio} até ${g.caixaFim} (${g.volumesCalculados} cx) | Rua: ${g.rua} | Op: ${g.operador} | ${new Date(g.timestamp).toLocaleTimeString('pt-BR')}`);
      });
    });

    if (report.auditoriasRelacionadas.length > 0) {
      linhas.push(``);
      linhas.push(`--- AUDITORIA E DIVERGÊNCIAS (${report.auditoriasRelacionadas.length}) ---`);
      report.auditoriasRelacionadas.forEach(aud => {
        linhas.push(`  ⚠ ${aud.tipo}: Pai: ${aud.contexto?.ctnPaiBipado} | Filho: ${aud.contexto?.ctnFilhoBipado} | Op: ${aud.operador} | ${new Date(aud.timestamp).toLocaleString('pt-BR')}`);
      });
    }

    navigator.clipboard.writeText(linhas.join('\n'));
    if (onAddToast) {
      onAddToast('Dossiê do CTN copiado para a área de transferência!', 'var(--color-success)');
    }
  };

  const handleExportCsv = () => {
    if (!report) return;

    const headers = ['CTN_PAI', 'ARTIGO', 'CAIXA_INICIO', 'CAIXA_FIM', 'VOLUMES', 'RUA', 'OPERADOR', 'DATA', 'HORA', 'STATUS_SYNC'];
    const rows: string[][] = [];

    report.artigos.forEach(art => {
      art.gruposFilhos.forEach(g => {
        const d = new Date(g.timestamp);
        rows.push([
          report.ctnPai,
          art.artigo,
          g.caixaInicio,
          g.caixaFim,
          String(g.volumesCalculados),
          g.rua,
          g.operador,
          d.toLocaleDateString('pt-BR'),
          d.toLocaleTimeString('pt-BR'),
          g.synced ? 'SINCRONIZADO' : 'PENDENTE'
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [
      headers.join(';'),
      ...rows.map(e => e.join(';'))
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `genealogia_${report.ctnPai}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onAddToast) {
      onAddToast('Arquivo CSV exportado com sucesso!', 'var(--color-success)');
    }
  };

  const handleDeleteAudit = async (id: string) => {
    if (window.confirm('Descartar este registro de divergência?')) {
      await deleteAuditLog(id);
      handleSearch();
      if (onAddToast) onAddToast('Registro de divergência descartado.', 'var(--color-success)');
    }
  };

  return (
    <div className={`flex flex-col h-full ${isModal ? 'bg-[#0e1117] text-white p-6 rounded-2xl border border-white/10 shadow-2xl max-w-5xl w-full mx-auto max-h-[90vh] overflow-hidden' : 'space-y-4'}`}>
      
      {/* 1. BARRA SUPERIOR DE CABEÇALHO */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Layers size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Genealogia de Estoque & Rastreio de CTN
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold border border-purple-500/30">
                WMS HIERARCHY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Auditoria de vínculo de Palete Pai ➔ Artigos ➔ Caixas Filhas e Divergências
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report && (
            <>
              <button
                type="button"
                onClick={handleCopyDossier}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Copiar Dossiê Formatado"
              >
                <Copy size={14} className="text-purple-400" />
                <span className="hidden sm:inline">Copiar Dossiê</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Exportar CSV de Auditoria"
              >
                <Download size={14} className="text-emerald-400" />
                <span className="hidden sm:inline">Exportar CSV</span>
              </button>
            </>
          )}

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 2. CAMPO DE BUSCA INDUSTRIAL (SCANNER ZEBRA READY) */}
      <div className="space-y-2 pt-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400" size={18} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Bipe ou digite o CTN Pai (ex: PLT-01, PALETE-10), Artigo ou Lote..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#15181e] border border-purple-500/30 rounded-xl pl-11 pr-10 py-3 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition-all uppercase"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={isSearching || !searchTerm.trim()}
            className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-xs uppercase flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
          >
            {isSearching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            <span>Rastrear</span>
          </button>
        </div>

        {/* Sugestões Rápidas de CTNs Recentes */}
        {recentItems.ctns.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <History size={12} className="text-slate-500" />
              Recentes:
            </span>
            {recentItems.ctns.map(ctn => (
              <button
                key={ctn}
                type="button"
                onClick={() => {
                  setSearchTerm(ctn);
                  handleSearch(ctn);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-purple-950/60 border border-white/10 hover:border-purple-500/40 text-purple-300 font-bold transition-colors cursor-pointer text-[11px]"
              >
                {ctn}
              </button>
            ))}
            {recentItems.artigos.slice(0, 4).map(art => (
              <button
                key={art}
                type="button"
                onClick={() => {
                  setSearchTerm(art);
                  handleSearch(art);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-400 font-bold transition-colors cursor-pointer text-[11px] flex items-center gap-1"
              >
                <Tag size={10} className="text-slate-500" />
                {art}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. CONTEÚDO PRINCIPAL DO RELATÓRIO DE GENEALOGIA */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mt-2">
        {isSearching ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw size={32} className="text-purple-400 animate-spin mx-auto" />
            <p className="text-sm font-mono text-slate-400">
              Cruzando logs de movimentação, regras AS/400 e trilhas de auditoria...
            </p>
          </div>
        ) : !report && hasSearched ? (
          <div className="py-12 px-6 rounded-2xl bg-[#15181e] border border-white/10 text-center space-y-3">
            <AlertTriangle size={36} className="text-amber-400 mx-auto" />
            <h3 className="text-base font-bold text-white uppercase">Nenhum registro encontrado</h3>
            <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
              O identificador <strong className="text-amber-300">"{searchTerm}"</strong> não possui movimentações registradas como CTN Pai, Artigo ou Lote no banco local.
            </p>
          </div>
        ) : !report ? (
          <div className="py-12 px-6 rounded-2xl bg-[#15181e] border border-white/10 text-center space-y-3">
            <Boxes size={40} className="text-purple-400/50 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Aguardando Leitura de Palete ou Artigo
            </h3>
            <p className="text-xs text-slate-500 font-mono max-w-lg mx-auto">
              Utilize o leitor Zebra acoplado ou digite o código de um Palete Pai para inspecionar toda a árvore genealógica de caixas filhas e rastreabilidade operacional.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* 3.1 CARD PRINCIPAL DO PALETE PAI */}
            <div className="p-4 rounded-2xl bg-[#15181e] border border-purple-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300">
                    <Boxes size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">CTN Pai (Palete)</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                        report.status === 'COMPLETO' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : report.status === 'DIVERGENTE'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {report.status === 'COMPLETO' ? '✓ Reabastecimento Completo' : report.status === 'DIVERGENTE' ? '⚠ Divergência Detectada' : '⏳ Em Processamento'}
                      </span>
                    </div>
                    <div className="text-2xl font-black font-mono text-white tracking-wide">
                      {report.ctnPai}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  {report.primeiraMovimentacaoTs && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Início da Operação</span>
                      <span className="text-slate-300 font-bold flex items-center gap-1 justify-end">
                        <Clock size={12} className="text-slate-500" />
                        {new Date(report.primeiraMovimentacaoTs).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {report.ultimaMovimentacaoTs && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Último Bipe</span>
                      <span className="text-slate-300 font-bold flex items-center gap-1 justify-end">
                        <Clock size={12} className="text-slate-500" />
                        {new Date(report.ultimaMovimentacaoTs).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid de Métricas do Palete */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total de Caixas</span>
                  <div className="text-xl font-black font-mono text-emerald-400">
                    {report.totalCaixas} <span className="text-xs text-slate-500 font-normal">cx</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">{report.totalEventos} ciclos de bipe</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Artigos Distintos</span>
                  <div className="text-xl font-black font-mono text-purple-300">
                    {report.totalArtigosDistintos} <span className="text-xs text-slate-500 font-normal">SKUs</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">Vínculo 1:N verificado</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Ruas de Destino</span>
                  <div className="text-base font-black font-mono text-cyan-300 truncate">
                    {report.ruasAtendidas.join(', ') || 'N/D'}
                  </div>
                  <span className="text-[10px] text-slate-500 block">{report.ruasAtendidas.length} endereço(s)</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Operadores</span>
                  <div className="text-base font-black font-mono text-amber-300 truncate">
                    {report.operadoresEnvolvidos.join(', ') || 'N/D'}
                  </div>
                  <span className="text-[10px] text-slate-500 block">{report.operadoresEnvolvidos.length} operador(es)</span>
                </div>
              </div>
            </div>

            {/* 3.2 TABS DE VISUALIZAÇÃO (ÁRVORE GENEALÓGICA / DIVERGÊNCIAS / LOGS BRUTOS) */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('arvore')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'arvore'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Layers size={14} />
                <span>Árvore Genealógica ({report.artigos.length} Artigos)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('auditoria')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'auditoria'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <ShieldAlert size={14} />
                <span>
                  Trilha de Auditoria & Divergências ({report.auditoriasRelacionadas.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('bruto')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'bruto'
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <FileText size={14} />
                <span>Logs Brutos ({report.logsBrutos.length})</span>
              </button>
            </div>

            {/* SUB-VIEW 1: ÁRVORE GENEALÓGICA */}
            {activeSubTab === 'arvore' && (
              <div className="space-y-3">
                {report.artigos.map((art) => {
                  const isExpanded = expandedArticles[art.artigo];
                  return (
                    <div 
                      key={art.artigo}
                      className="rounded-xl border border-white/10 bg-[#15181e] overflow-hidden transition-all"
                    >
                      {/* Cabeçalho do Ramo de Artigo */}
                      <div 
                        onClick={() => toggleArticleExpand(art.artigo)}
                        className="p-3.5 bg-slate-900/80 hover:bg-slate-800/80 flex items-center justify-between cursor-pointer border-b border-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="p-1 rounded bg-black/40 text-slate-400 hover:text-white"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                          
                          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Box size={18} />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black font-mono text-emerald-300">
                                Artigo: {art.artigo}
                              </span>
                              {art.possuiRegraCadastrada ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                                  <ShieldCheck size={11} />
                                  Regra AS/400 Ativa ({art.quantidadePadraoRegra} pç/cx)
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-white/10">
                                  Sem regra cadastrada
                                </span>
                              )}
                              {art.divergenciasDetectadas > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-bold border border-rose-500/30 flex items-center gap-1">
                                  <AlertTriangle size={11} />
                                  {art.divergenciasDetectadas} divergência(s)
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 font-mono">
                              Destino: {art.ruasDestino.join(', ') || 'N/D'} • Operado por: {art.operadores.join(', ') || 'N/D'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right font-mono">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block">Total Caixas</span>
                            <span className="text-base font-black text-white">{art.totalCaixas} cx</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block">Peças Est.</span>
                            <span className="text-base font-black text-emerald-400">{art.totalPecasEstimadas} pç</span>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Caixas Filhas (Lotes Bipados) */}
                      {isExpanded && (
                        <div className="p-3 bg-black/30 divide-y divide-white/5 space-y-2">
                          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider px-2 flex items-center justify-between">
                            <span>Lotes / Caixas Filhas Registradas ({art.gruposFilhos.length} ciclos)</span>
                            <span>Volumetria = Caixa Fim - Caixa Início + 1</span>
                          </div>

                          {art.gruposFilhos.map((grupo, idx) => (
                            <div 
                              key={grupo.id || idx}
                              className="pt-2 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                                  {idx + 1}
                                </span>

                                <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-white/10">
                                  <span className="text-slate-400">Início:</span>
                                  <strong className="text-purple-300">{grupo.caixaInicio}</strong>
                                  <ArrowRight size={12} className="text-slate-500" />
                                  <span className="text-slate-400">Fim:</span>
                                  <strong className="text-purple-300">{grupo.caixaFim}</strong>
                                </div>

                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                  {grupo.volumesCalculados} cx
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                                <span className="flex items-center gap-1">
                                  <MapPin size={12} className="text-slate-500" />
                                  {grupo.rua}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User size={12} className="text-slate-500" />
                                  {grupo.operador}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock size={12} className="text-slate-500" />
                                  {new Date(grupo.timestamp).toLocaleTimeString('pt-BR')}
                                </span>
                                {grupo.synced ? (
                                  <span className="text-emerald-400 text-[10px] flex items-center gap-0.5">
                                    <CheckCircle2 size={10} /> Sync
                                  </span>
                                ) : (
                                  <span className="text-amber-400 text-[10px]">Pendente</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* SUB-VIEW 2: AUDITORIA E DIVERGÊNCIAS */}
            {activeSubTab === 'auditoria' && (
              <div className="space-y-3">
                {report.auditoriasRelacionadas.length === 0 ? (
                  <div className="p-8 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2">
                    <ShieldCheck size={36} className="text-emerald-400 mx-auto" />
                    <h4 className="text-sm font-bold text-emerald-200 uppercase">
                      Auditoria de Processo 100% Conforme
                    </h4>
                    <p className="text-xs text-slate-400 font-mono">
                      Nenhuma inversão de etiqueta, divergência de palete ou violação de regra registrada para este CTN.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-rose-500/30 bg-[#15181e]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#0d0f12] text-slate-400 uppercase text-[10px] border-b border-rose-500/20">
                        <tr>
                          <th className="py-2.5 px-3">Data/Hora</th>
                          <th className="py-2.5 px-3">Operador</th>
                          <th className="py-2.5 px-3">Local</th>
                          <th className="py-2.5 px-3">Tipo Divergência</th>
                          <th className="py-2.5 px-3">Contexto</th>
                          <th className="py-2.5 px-3 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {report.auditoriasRelacionadas.map((aud) => (
                          <tr key={aud.id} className="hover:bg-rose-500/5">
                            <td className="py-2 px-3 text-slate-400">
                              {new Date(aud.timestamp).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 px-3 font-bold text-rose-300 uppercase">
                              {aud.operador}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              {aud.setor} / {aud.rua}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                {aud.tipo.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">
                              Pai: <strong className="text-white">{aud.contexto?.ctnPaiBipado}</strong> | Filho: <strong className="text-white">{aud.contexto?.ctnFilhoBipado}</strong>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteAudit(aud.id)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-[10px] transition-colors"
                              >
                                Descartar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SUB-VIEW 3: LOGS BRUTOS */}
            {activeSubTab === 'bruto' && (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#15181e]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0d0f12] text-slate-400 uppercase text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3">Hora</th>
                      <th className="py-2.5 px-3">Operador</th>
                      <th className="py-2.5 px-3">Rua</th>
                      <th className="py-2.5 px-3">Artigo</th>
                      <th className="py-2.5 px-3">Volumes</th>
                      <th className="py-2.5 px-3">Lote / Obs</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.logsBrutos.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/60">
                        <td className="py-2 px-3 text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-300 uppercase">
                          {log.colaborador}
                        </td>
                        <td className="py-2 px-3 text-cyan-300">
                          {log.rua}
                        </td>
                        <td className="py-2 px-3 text-emerald-300 font-bold">
                          {log.artigo || '-'}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">
                          {log.volumes} cx
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {log.observacoes || '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {log.synced ? (
                            <span className="text-emerald-400 text-[10px] font-bold">Sincronizado</span>
                          ) : (
                            <span className="text-amber-400 text-[10px]">Pendente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
};
