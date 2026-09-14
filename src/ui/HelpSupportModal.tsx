/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  BookOpen, 
  FileSpreadsheet, 
  Tv, 
  Database, 
  Clipboard, 
  Check, 
  ExternalLink,
  Clock,
  MapPin,
  Sparkles,
  Zap,
  Info,
  ShieldCheck
} from 'lucide-react';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl?: string;
  initialTab?: 'manual' | 'sheets' | 'tv' | 'sql';
}

export default function HelpSupportModal({ 
  isOpen, 
  onClose, 
  apiUrl = '',
  initialTab = 'manual'
}: HelpSupportModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'sheets' | 'tv' | 'sql'>(initialTab);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(identifier);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const appsScriptCode = `// Google Apps Script para o Terminal REPRO (Abas: Controle de horas - Repro, Gestão, Formulário)
// Instrução: Cole no Editor de Scripts da Planilha Google (Extensões > Apps Script)

var SPREADSHEET_ID = "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c";
var SHEET_NAME = "Controle de horas - Repro";
var VALID_SECTORS = ["87", "88", "89", "90"];

function doGet(e) {
  // TRAVA DE SEGURANÇA: Se 'e' não existir (ao executar no editor), cria um evento falso
  e = e || { parameter: {} }; 
  
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss) {
    return ContentService.createTextOutput(JSON.stringify({"status": "erro", "erro": "Planilha não encontrada"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var nomeDaAba = e.parameter.aba || e.parameter.sheet; 
  
  if (nomeDaAba) {
    var sheet = ss.getSheetByName(nomeDaAba);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({"status": "erro", "erro": "Aba não encontrada"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var dados = extrairDadosDaAba(sheet);
    var jsonSingle = JSON.stringify({ status: "sucesso", total: dados.length, dados: dados });
    if (e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonSingle + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonSingle).setMimeType(ContentService.MimeType.JSON);
  } else {
    var sheets = ss.getSheets();
    var finalPayload = {};
    sheets.forEach(function(s) {
      finalPayload[s.getName()] = extrairDadosDaAba(s);
    });
    var jsonAll = JSON.stringify(finalPayload);
    if (e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonAll + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonAll).setMimeType(ContentService.MimeType.JSON);
  }
}

function extrairDadosDaAba(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var sheetData = [];

  for (var i = 1; i < data.length; i++) {
    var rowObj = {};
    var hasData = false;

    for (var j = 0; j < headers.length; j++) {
      if (headers[j] && headers[j] !== "") {
        rowObj[headers[j]] = data[i][j];
        if (data[i][j] !== "") hasData = true;
      }
    }
    if (hasData) sheetData.push(rowObj);
  }
  return sheetData;
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var contents = e.postData ? e.postData.contents : null;
  var dados = contents ? JSON.parse(contents) : (e.parameter || {});

  var targetRow = findFirstAvailableRow(sheet);
  sheet.getRange(targetRow, 1, 1, 9).setValues([[
    dados.setor || "87",
    dados.data || new Date().toLocaleDateString('pt-BR'),
    dados.semana || 1,
    dados.semanaAno || new Date().getFullYear(),
    dados.atividade || "Reapro",
    (dados.colaborador || "OPERADOR").toString().toUpperCase(),
    dados.qtdEnderecos || 0,
    dados.horas || 0,
    dados.horas > 0 ? Math.round((dados.qtdEnderecos / dados.horas) * 10) / 10 : 0
  ]]);

  return ContentService.createTextOutput(JSON.stringify({ status: "sucesso", linha: targetRow }))
    .setMimeType(ContentService.MimeType.JSON);
}

function findFirstAvailableRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  var rangeValues = sheet.getRange(2, 1, Math.max(lastRow - 1, 1), 9).getValues();
  for (var i = 0; i < rangeValues.length; i++) {
    var isEmpty = true;
    for (var j = 0; j < rangeValues[i].length; j++) {
      if (rangeValues[i][j] !== "" && rangeValues[i][j] !== null) {
        isEmpty = false; break;
      }
    }
    if (isEmpty) return i + 2;
  }
  return lastRow + 1;
}`;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const standaloneUrl = `${currentOrigin}?view=gestao&standalone=true`;
  const iframeSnippet = `<iframe\n  src="${standaloneUrl}"\n  title="Torre de Gestão REPRO"\n  width="100%"\n  height="850"\n  style="border: none; border-radius: 16px; background: #020617;"\n  loading="lazy">\n</iframe>`;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase font-mono tracking-wider flex items-center gap-2">
                <span>Central de Ajuda & Documentação</span>
                <span className="text-emerald-400 text-xs font-normal">// REPRO v5.0</span>
              </h2>
              <p className="text-xs text-slate-400">
                Guia operacional do galpão, atalhos para coletores Zebra e instruções de integração.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Navegação Interna do Manual */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-black/40 border-b border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'manual'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <BookOpen size={14} />
            <span>Manual do Operador</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sheets'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Google Apps Script</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tv')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tv'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Tv size={14} />
            <span>Painel TV & Intranet</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sql'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Database size={14} />
            <span>Consultas WMS / TI</span>
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* 1. MANUAL DO OPERADOR */}
          {activeTab === 'manual' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <Sparkles className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1 text-xs leading-relaxed text-slate-300">
                  <strong className="text-white font-mono uppercase">Visão Rápida para o Operador:</strong>
                  <p>
                    O sistema registra automaticamente o tempo gasto por atividade. Os dados são salvos localmente de forma instantânea (offline-first) e enviados para a planilha corporativa em segundo plano.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Como iniciar */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-xs uppercase">
                    <Clock size={16} />
                    <span>1. Início de Atividade</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Clique no botão verde da atividade desejada (<strong>REPRO</strong>, <strong>ELOG</strong> ou <strong>DIVERSOS</strong>). O cronômetro iniciará a contagem precisa. Em coletores Zebra com teclado físico, pressione a tecla <kbd className="px-1.5 py-0.5 bg-black border border-white/20 rounded text-emerald-400">1</kbd> para iniciar rapidamente.
                  </p>
                </div>

                {/* Card 2: Pausas e Retomadas */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-xs uppercase">
                    <Zap size={16} />
                    <span>2. Pausas & Imprevistos</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Precisa interromper para almoço, reunião ou 5S? Clique em <strong>PAUSAR</strong> ou inicie uma <strong>Atividade Indireta</strong>. O tempo da atividade principal é congelado e retomado a qualquer instante sem perdas.
                  </p>
                </div>

                {/* Card 3: Finalização e VPH */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs uppercase">
                    <MapPin size={16} />
                    <span>3. Finalização & VPH</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Ao concluir a tarefa, digite a <strong>Quantidade de Endereços/Volumes</strong> manipulados e clique em <strong>FINALIZAR</strong>. O sistema calcula automaticamente o <strong>VPH (Volumes por Hora)</strong> e gera o log auditável.
                  </p>
                </div>

                {/* Card 4: Segurança Offline */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-mono font-bold text-xs uppercase">
                    <ShieldCheck size={16} />
                    <span>4. Conexão & Segurança</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O sinal Wi-Fi caiu no galpão? Continue trabalhando normalmente! O Terminal REPRO armazena tudo no banco local (IndexedDB) e sincroniza assim que a conexão for reestabelecida.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. GOOGLE APPS SCRIPT INTEGRATION */}
          {activeTab === 'sheets' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white uppercase font-mono tracking-wider flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-emerald-400" />
                    <span>Instruções de Instalação na Planilha Google</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleCopy(appsScriptCode, 'script')}
                    className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all font-mono"
                  >
                    {copiedItem === 'script' ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
                    <span>{copiedItem === 'script' ? 'Copiado!' : 'Copiar Script Completo'}</span>
                  </button>
                </div>

                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Abra a sua planilha Google Sheets e acesse o menu <strong className="text-white">Extensões &gt; Apps Script</strong>.</li>
                  <li>Apague o conteúdo padrão, cole o script abaixo e clique em <strong className="text-white">Salvar (Ctrl+S)</strong>.</li>
                  <li>No topo direito, clique em <strong className="text-white">Implantar &gt; Nova implantação</strong> e selecione o tipo <strong className="text-white">App da Web</strong>.</li>
                  <li>Em <em>"Quem tem acesso"</em>, defina obrigatoriamente como <strong className="text-emerald-400">"Qualquer pessoa" (Anyone)</strong>.</li>
                  <li>Copie a <strong>URL do App da Web</strong> gerada e cole na aba <strong>Gestão & Sheets</strong> deste sistema.</li>
                </ol>
              </div>

              {/* Bloco de Código com visual limpo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[0.65rem] font-bold text-slate-400 uppercase font-mono tracking-wider">
                    Código Google Apps Script (v5.0 Ready):
                  </label>
                </div>
                <div className="relative bg-black p-4 rounded-xl border border-white/10 font-mono text-xs overflow-x-auto max-h-60 scrollbar-thin">
                  <pre className="text-[0.70rem] text-emerald-300/90 leading-relaxed select-all">
                    {appsScriptCode}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* 3. PAINEL TV & INTRANET */}
          {activeTab === 'tv' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs uppercase">
                  <Tv size={16} />
                  <span>Exibição em Televisores e Portais Corporativos</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Permite transmitir o painel consolidado de reabastecimento em TVs da torre de controle ou embutir em intranets corporativas em modo somente leitura (Read-Only), atualizando em tempo real.
                </p>
              </div>

              {/* Link Standalone */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono uppercase">URL Direta (Modo TV):</span>
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    <ExternalLink size={12} />
                    <span>Abrir em Nova Aba</span>
                  </a>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-white/10">
                  <input
                    type="text"
                    readOnly
                    value={standaloneUrl}
                    className="bg-transparent text-xs text-cyan-300 focus:outline-none w-full font-mono select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(standaloneUrl, 'tv-url')}
                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 font-mono"
                  >
                    {copiedItem === 'tv-url' ? <Check size={12} className="text-emerald-400" /> : <Clipboard size={12} />}
                    <span>{copiedItem === 'tv-url' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Snippet Iframe */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono uppercase">Código HTML para Intranet:</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(iframeSnippet, 'iframe')}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all border border-white/10 font-mono"
                  >
                    {copiedItem === 'iframe' ? <Check size={12} className="text-emerald-400" /> : <Clipboard size={12} />}
                    <span>{copiedItem === 'iframe' ? 'Copiado!' : 'Copiar HTML'}</span>
                  </button>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-white/10 font-mono text-xs overflow-x-auto">
                  <pre className="text-[0.70rem] text-cyan-200 leading-relaxed select-all">
                    {iframeSnippet}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* 4. CONSULTAS WMS / TI */}
          {activeTab === 'sql' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-xs uppercase">
                  <Database size={16} />
                  <span>Estrutura de Dados & Suporte a Banco de Dados</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para integrações diretas via ODBC ou APIs de WMS/ERP, utilize a tabela oficial com o mapeamento das 9 colunas padrão:
                </p>
                <div className="p-3 bg-black/40 rounded-xl border border-white/10 text-xs font-mono text-slate-300 space-y-1">
                  <p>• <strong>Setor</strong> (VARCHAR) - Código do setor (ex: 87, 88, 89, 90)</p>
                  <p>• <strong>Data</strong> (DATE) - Data da execução no formato DD/MM/AAAA</p>
                  <p>• <strong>Semana / Ano</strong> (INT) - Número da semana ISO (1 a 53)</p>
                  <p>• <strong>Atividade</strong> (VARCHAR) - Tipo de apontamento (REPRO, ELOG, etc.)</p>
                  <p>• <strong>Colaborador</strong> (VARCHAR) - Nome completo ou matrícula do operador</p>
                  <p>• <strong>QTD Endereços</strong> (NUMERIC) - Total de posições/caixas endereçadas</p>
                  <p>• <strong>Horas Usadas</strong> (NUMERIC) - Tempo total em horas decimais</p>
                  <p>• <strong>VPH</strong> (NUMERIC) - Produtividade calculada (Endereços / Horas)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-slate-900/40 text-xs font-mono text-slate-400">
          <span>TORRE DE COMANDO REPRO // SISTEMA HOMOLOGADO</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold cursor-pointer transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
