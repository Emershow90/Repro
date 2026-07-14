/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';

export default function AppsScriptHelper() {
  const [copied, setCopied] = useState(false);

    var codeSnippet = `// Google Apps Script para o Terminal REPRO
// Colar no Editor de Scripts da Planilha Google (Extensions > Apps Script)

function doPost(e) {
  const SHEET_NAME = "Controle de horas - Repro";
  const ss = SpreadsheetApp.openById(
    "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c"
  );
  const sheet = ss.getSheetByName(SHEET_NAME);
  const dados = JSON.parse(e.postData.contents);
  const linha = sheet.getLastRow() + 1;
  sheet.getRange(linha,1,1,8).setValues([[
      dados.setor,
      dados.data,
      dados.semana,
      dados.semanaAno,
      dados.atividade,
      dados.colaborador,
      dados.qtdEnderecos,
      dados.horas
  ]]);
  return ContentService
      .createTextOutput(JSON.stringify({
          sucesso:true,
          linha:linha
      }))
      .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Controle de horas - Repro') || ss.getActiveSheet();
    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = rows[0].map(function(h) { return h.toString().toLowerCase().trim(); });
    var dataArray = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        var cellVal = row[j];
        obj[key] = cellVal;
      }
      dataArray.push(obj);
    }
    
    return ContentService.createTextOutput(JSON.stringify(dataArray))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch(erro) {
    return ContentService.createTextOutput(JSON.stringify({ status: "erro", mensagem: erro.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
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
        Siga estes passos:<br />
        1. Abra a sua Planilha Google.<br />
        2. No menu superior, clique em <strong className="text-white">Extensões &gt; Apps Script</strong>.<br />
        3. Cole o código copiado abaixo, salve e faça o deploy como <strong className="text-white">Web App</strong> (Acesso: Qualquer Pessoa).<br />
        4. Copie a URL gerada e cole no campo de configuração acima.
      </p>

      <div className="bg-terminal-bg/50 border border-terminal-border/30 p-3 rounded-sm overflow-x-auto max-h-40 scrollbar-thin">
        <pre className="text-[0.5rem] text-terminal-accent/80 font-mono leading-normal select-all">
          {codeSnippet}
        </pre>
      </div>
    </div>
  );
}
