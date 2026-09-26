/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';

export default function AppsScriptHelper() {
  const [copied, setCopied] = useState(false);

    var codeSnippet = `// Google Apps Script para o Terminal REPRO (Abas: Controle de horas - Repro, Gestão, Formulário)
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

  // Verifica se solicitou uma aba específica na URL (ex: ?aba=Controle de horas - Repro ou ?sheet=Gestão)
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
    // Se não pediu uma aba específica, exporta todas as abas da planilha
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

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-panel p-6 rounded-sm space-y-4">
      <div className="flex justify-espaçado items-centralizados border-b border-terminal-border/40 pb-2">
        <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
          [SCRIPT DE INTEGRACAO GOOGLE]
        </h2>
        <button
          onClick={handleCopy}
          className="btn-term text-[0.55rem] py-1 px-2 uppercase font-bold flex items-centralizados gap-1 rounded-sm cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={12} className="text-success" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Clipboard size={12} />
              <span>Copiar Script</span>
            </>
          )}
        </button>
      </div>
      
      <p className="text-[0.55rem] text-terminal-text opacity-40 leading-relaxed">
        <strong>Opção A: Google Apps Script Web App (Leitura e Escrita Automática):</strong><br />
        1. Abra a sua Planilha Google e clique em <strong className="text-white">Extensões &gt; Apps Script</strong>.<br />
        2. Cole o código copiado abaixo e clique em <strong className="text-white">Salvar</strong>.<br />
        3. No topo direito, clique em <strong className="text-white">Implantar &gt; Nova implantação &gt; App da Web</strong>.<br />
        4. <strong className="text-warning text-yellow-400">CRÍTICO:</strong> Em "Quem tem acesso", escolha <strong className="text-white">"Qualquer pessoa" (Anyone)</strong>.<br />
        5. Copie a URL e cole no campo acima.<br /><br />
        <strong>Opção B: Link de Planilha Publicada na Web (Suportado para Leitura):</strong><br />
        • Cole a URL do Google Sheets (ex: <span className="text-terminal-accent opacity-80 font-mono">https://docs.google.com/spreadsheets/d/e/.../pubhtml</span>). O sistema converterá e sincronizará automaticamente.
      </p>

      <div className="bg-terminal-bg/50 border border-terminal-border/30 p-3 rounded-sm overflow-x-auto max-h-40 scrollbar-thin">
        <pre className="text-[0.5rem] text-terminal-accent/80 font-mono leading-normal select-all">
          {codeSnippet}
        </pre>
      </div>
    </div>
  );
}
