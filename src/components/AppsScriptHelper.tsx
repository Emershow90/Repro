/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';

export default function AppsScriptHelper() {
  const [copied, setCopied] = useState(false);

    var codeSnippet = `// Google Apps Script para o Terminal REPRO (Abas: Controle de horas - Repro, RESUMO, EVENTOS)
// Colar no Editor de Scripts da Planilha Google (Extensões > Apps Script)

function doPost(e) {
  const SPREADSHEET_ID = "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c";
  
  const resposta = (sucesso, dados, statusCode = 200) => {
    return ContentService
      .createTextOutput(JSON.stringify({ status: sucesso ? "sucesso" : "erro", ...dados }))
      .setMimeType(ContentService.MimeType.JSON);
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return resposta(false, { erro: "Payload vazio ou inválido" }, 400);
    }

    let dados;
    try {
      dados = JSON.parse(e.postData.contents);
    } catch (err) {
      return resposta(false, { erro: "JSON malformado" }, 400);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      
      // 1. SE FOR SINCRONIZAÇÃO EM LOTE DO RESUMO REPRO
      if (dados.tipo === 'SYNC_BATCH_REPRO' && Array.isArray(dados.resumo)) {
        let sheetResumo = ss.getSheetByName("RESUMO_REPRO");
        if (!sheetResumo) {
          sheetResumo = ss.insertSheet("RESUMO_REPRO");
          sheetResumo.appendRow(["Data", "Setor", "Rua", "Status", "Demanda", "Realizado", "Pendente", "Cobertura_%", "Excedente", "EPH", "VPH", "Tempo", "Atualizado_Em"]);
        }

        const dataStr = dados.data || new Date().toLocaleDateString('pt-BR');
        const agora = new Date().toISOString();

        dados.resumo.forEach(item => {
          sheetResumo.appendRow([
            dataStr,
            item.setor || "",
            item.rua || "",
            item.status || "",
            item.demanda || 0,
            item.realizado || 0,
            item.pendente || 0,
            item.coberturaPercent || 0,
            item.excedente || 0,
            item.eph || "0.0",
            item.vph || "0.0",
            item.tempoTotalSegundos || 0,
            agora
          ]);
        });

        // Grava eventos se existirem no lote
        if (Array.isArray(dados.eventos) && dados.eventos.length > 0) {
          let sheetEventos = ss.getSheetByName("EVENTOS_OPERACIONAIS");
          if (!sheetEventos) {
            sheetEventos = ss.insertSheet("EVENTOS_OPERACIONAIS");
            sheetEventos.appendRow(["Event_ID", "Timestamp", "Tipo", "Setor", "Rua", "Delta_Enderecos", "Delta_Volumes", "Lap_Segundos", "Justificativa"]);
          }
          dados.eventos.forEach(evt => {
            sheetEventos.appendRow([
              evt.id || "",
              new Date(evt.timestamp || Date.now()).toISOString(),
              evt.tipo || "",
              evt.setor || "",
              evt.rua || "",
              evt.enderecosDelta || 0,
              evt.volumesDelta || 0,
              evt.lapDurationSeconds || 0,
              evt.justification || ""
            ]);
          });
        }

        return resposta(true, { registrosProcessados: dados.resumo.length });
      }

      // 2. SE FOR REGISTRO PADRÃO DE LOG FINALIZADO (Controle de horas - Repro)
      const SHEET_NAME = "Controle de horas - Repro";
      const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
      
      const vph = dados.horas > 0 ? (dados.qtdEnderecos / dados.horas) : 0;
      const novoSetor = String(dados.setor || "87").trim();
      const novaData = String(dados.data || "").trim();
      const novoColab = String(dados.colaborador || "OPERADOR").toUpperCase().trim();
      const novaAtiv = String(dados.atividade || "Repro").trim();

      // Verificar registros existentes para evitar duplicidade
      const lastRow = sheet.getLastRow();
      let linhaAlvo = lastRow + 1;
      let modo = "inserido";

      if (lastRow > 1) {
        const dataValues = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
        for (let i = 0; i < dataValues.length; i++) {
          const rSetor = String(dataValues[i][0] || "").trim();
          const rDataRaw = dataValues[i][1];
          const rDataStr = rDataRaw instanceof Date ? rDataRaw.toISOString() : String(rDataRaw || "").trim();
          const rAtiv = String(dataValues[i][4] || "").trim();
          const rColab = String(dataValues[i][5] || "").toUpperCase().trim();

          if (
            rSetor === novoSetor &&
            rColab === novoColab &&
            rAtiv.toLowerCase() === novaAtiv.toLowerCase() &&
            (rDataStr === novaData || (rDataRaw instanceof Date && novaData.includes(rDataRaw.toLocaleDateString('pt-BR'))))
          ) {
            linhaAlvo = i + 2;
            modo = "atualizado";
            break;
          }
        }
      }

      sheet.getRange(linhaAlvo, 1, 1, 9).setValues([[
        dados.setor || "87",
        dados.data || new Date().toISOString(),
        dados.semana || 1,
        dados.semanaAno || new Date().getFullYear(),
        dados.atividade || "Repro",
        dados.colaborador || "OPERADOR",
        dados.qtdEnderecos || 0,
        dados.horas || 0,
        vph
      ]]);

      return resposta(true, { operacao: modo, linha: linhaAlvo });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error("Erro doPost:", err);
    return resposta(false, { erro: err.toString() }, 500);
  }
}

function doGet(e) {
  try {
    var SHEET_NAME = "Controle de horas - Repro";
    var SPREADSHEET_ID = "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c";
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
    
    // --- INSERT VIA GET (Fallback for CORS issues) ---
    if (e.parameter.action === 'insert') {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var payload = e.parameter.payload;
        var dados = JSON.parse(payload);
        
        var vph = dados.horas > 0 ? (dados.qtdEnderecos / dados.horas) : 0;
        var novoSetor = String(dados.setor || "87").trim();
        var novaData = String(dados.data || "").trim();
        var novoColab = String(dados.colaborador || "OPERADOR").toUpperCase().trim();
        var novaAtiv = String(dados.atividade || "Repro").trim();
        
        var lastRow = sheet.getLastRow();
        var linhaAlvo = lastRow + 1;
        var modo = "inserido";
        
        if (lastRow > 1) {
          var dataValues = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
          for (var i = 0; i < dataValues.length; i++) {
            var rSetor = String(dataValues[i][0] || "").trim();
            var rDataRaw = dataValues[i][1];
            var rDataStr = rDataRaw instanceof Date ? rDataRaw.toISOString() : String(rDataRaw || "").trim();
            var rAtiv = String(dataValues[i][4] || "").trim();
            var rColab = String(dataValues[i][5] || "").toUpperCase().trim();
            
            if (rSetor === novoSetor && rColab === novoColab && rAtiv.toLowerCase() === novaAtiv.toLowerCase() && (rDataStr === novaData || (rDataRaw instanceof Date && novaData.includes(rDataRaw.toLocaleDateString('pt-BR'))))) {
              linhaAlvo = i + 2;
              modo = "atualizado";
              break;
            }
          }
        }
        
        sheet.getRange(linhaAlvo, 1, 1, 9).setValues([[
          dados.setor || "87",
          dados.data || new Date().toISOString(),
          dados.semana || 1,
          dados.semanaAno || new Date().getFullYear(),
          dados.atividade || "Repro",
          dados.colaborador || "OPERADOR",
          dados.qtdEnderecos || 0,
          dados.horas || 0,
          vph
        ]]);
        
        var jsonInsert = JSON.stringify({ status: "sucesso", operacao: modo, linha: linhaAlvo });
        if (e.parameter.callback) {
          return ContentService.createTextOutput(e.parameter.callback + "(" + jsonInsert + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
        }
        return ContentService.createTextOutput(jsonInsert).setMimeType(ContentService.MimeType.JSON);
      } finally {
        lock.releaseLock();
      }
    }
    // --- END INSERT VIA GET ---

    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      var emptyJson = JSON.stringify({ status: "sucesso", dados: [] });
      if (e.parameter.callback) {
         return ContentService.createTextOutput(e.parameter.callback + "(" + emptyJson + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(emptyJson).setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = rows[0].map(function(h) { return h.toString().trim(); });
    var dataArray = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        obj[key] = row[j];
      }
      dataArray.push(obj);
    }
    
    var jsonResult = JSON.stringify({ status: "sucesso", dados: dataArray });
    if (e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonResult + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonResult).setMimeType(ContentService.MimeType.JSON);
  } catch(erro) {
    var errJson = JSON.stringify({ status: "erro", mensagem: erro.toString() });
    if (e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + errJson + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson).setMimeType(ContentService.MimeType.JSON);
  }
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
