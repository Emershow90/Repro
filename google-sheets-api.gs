/**
 * GOOGLE APPS SCRIPT - BACKEND COMPLETO & SINCRONIZAÇÃO DA PLANILHA REPRO
 * 
 * Link do Publicador Web:
 * https://docs.google.com/spreadsheets/d/e/2PACX-1vTy_lfMaDqE48mRuMZJ_nBP2R4qbDG7wYEA3vtIeHOhMTTxjYHPZzGPcJrWvaIokP0EaRrMGf_1UoP2/pubhtml
 * 
 * URL do Web App (Production Exec):
 * https://script.google.com/macros/s/AKfycbxBvISCTmvbAWwcid9UrWUmW3QdIHae2f5fq2OFwuLA/exec
 * 
 * NOTA IMPORTANTE DE IMPLANTAÇÃO:
 * Para disponibilizar a API sem pedir login no Google, implante como Web App com:
 * - Executar como: Eu (meu e-mail)
 * - Quem tem acesso: Qualquer pessoa (Anyone)
 * - Utilize sempre o link /exec em vez de /dev.
 */

var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet() ? SpreadsheetApp.getActiveSpreadsheet().getId() : "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c";
var SHEET_NAME = "Controle de horas - Repro";
var FORM_SHEET_NAME = "Formulário";
var GESTAO_SHEET_NAME = "Gestão";
var VALID_SECTORS = ["87", "88", "89", "90"];

/**
 * Função utilitária para obter a planilha ativa ou pelo ID registrado
 */
function getTargetSpreadsheet() {
  if (SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch(e) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Função auxiliar para extrair os dados de uma aba específica em formato JSON de objetos
 */
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
      var headerName = headers[j] ? headers[j].toString().trim() : "";
      if (headerName !== "") {
        rowObj[headerName] = data[i][j];
        if (data[i][j] !== "" && data[i][j] !== null && data[i][j] !== undefined) {
          hasData = true;
        }
      }
    }
    
    if (hasData) {
      sheetData.push(rowObj);
    }
  }
  return sheetData;
}

/**
 * Localiza a primeira linha verdadeiramente em branco varrendo as colunas A até I a partir da linha 2.
 * Evita anexar no final quando existem linhas em branco intermediárias na planilha.
 */
function findFirstAvailableRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  
  var rangeValues = sheet.getRange(2, 1, Math.max(lastRow - 1, 1), 9).getValues();
  
  for (var i = 0; i < rangeValues.length; i++) {
    var row = rangeValues[i];
    var isEmpty = true;
    for (var j = 0; j < row.length; j++) {
      if (row[j] !== null && row[j] !== undefined && row[j].toString().trim() !== "") {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty) {
      return i + 2; // Retorna número da linha física
    }
  }
  
  return lastRow + 1;
}

/**
 * Parser inteligente de setores e observações com desmembramento e rateio proporcional
 */
function parseSectorBreakdown(rawSetor, rawObs, totalPaletes, totalHoras) {
  rawSetor = (rawSetor || "").toString();
  rawObs = (rawObs || "").toString();
  totalPaletes = parseFloat(totalPaletes) || 0;
  totalHoras = parseFloat(totalHoras) || 0;

  var candidateSectors = [];
  var sectorMatches = rawSetor.match(/\d+/g);
  if (sectorMatches) {
    sectorMatches.forEach(function(s) {
      if (VALID_SECTORS.indexOf(s) !== -1 && candidateSectors.indexOf(s) === -1) {
        candidateSectors.push(s);
      }
    });
  }
  if (candidateSectors.length === 0) {
    candidateSectors = ["87"];
  }

  var breakdown = [];

  if (rawObs.trim() !== "") {
    var chunks = rawObs.split(/[;|\n,]+/);
    chunks.forEach(function(chunk) {
      chunk = chunk.trim();
      if (!chunk) return;

      var numbers = chunk.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        var foundSector = null;
        var foundQty = null;

        for (var k = 0; k < numbers.length; k++) {
          var numStr = numbers[k];
          if (VALID_SECTORS.indexOf(numStr) !== -1) {
            foundSector = numStr;
          } else {
            foundQty = parseFloat(numStr);
          }
        }

        if (foundSector && foundQty !== null) {
          breakdown.push({ setor: foundSector, qtd: foundQty });
        }
      } else if (numbers && numbers.length === 1) {
        var num = numbers[0];
        if (VALID_SECTORS.indexOf(num) !== -1) {
          breakdown.push({ setor: num, qtd: 0 });
        }
      }
    });
  }

  if (breakdown.length === 0) {
    var shareQty = candidateSectors.length > 0 ? (totalPaletes / candidateSectors.length) : totalPaletes;
    candidateSectors.forEach(function(sec) {
      breakdown.push({ setor: sec, qtd: shareQty });
    });
  }

  var sumQty = 0;
  breakdown.forEach(function(item) { sumQty += item.qtd; });
  if (sumQty === 0) sumQty = totalPaletes || 1;

  var result = [];
  breakdown.forEach(function(item) {
    var weight = item.qtd / sumQty;
    var itemHoras = Math.round((totalHoras * weight) * 100) / 100;
    var itemPaletes = item.qtd > 0 ? item.qtd : Math.round((totalPaletes * weight) * 100) / 100;
    var itemVph = itemHoras > 0 ? Math.round((itemPaletes / itemHoras) * 10) / 10 : 0;

    result.push({
      setor: item.setor,
      qtdEnderecos: itemPaletes,
      horas: itemHoras,
      vph: itemVph
    });
  });

  return result;
}

/**
 * Endpoint GET - Retorna dados por aba ou todas as abas, com trava de segurança para o editor
 */
function doGet(e) {
  // TRAVA DE SEGURANÇA: Se 'e' não existir (ao executar diretamente pelo editor de scripts), cria evento falso
  e = e || { parameter: {} }; 
  
  var ss = getTargetSpreadsheet();
  if (!ss) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "erro", "erro": "Planilha não encontrada" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var action = e.parameter ? e.parameter.action : "";

  // Ação: Inserção via GET/JSONP
  if (action === "insert" && e.parameter.payload) {
    try {
      var fakePostPayload = { postData: { contents: e.parameter.payload } };
      return doPost(fakePostPayload);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: "erro", mensagem: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Verifica se o usuário solicitou uma aba específica na URL (suporta 'aba' ou 'sheet')
  var nomeDaAba = e.parameter.aba || e.parameter.sheet; 
  
  if (nomeDaAba) {
    // Exporta apenas a aba solicitada (ex: "Controle de horas - Repro")
    var sheet = ss.getSheetByName(nomeDaAba);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ "status": "erro", "erro": "Aba não encontrada" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var dadosAba = extrairDadosDaAba(sheet);
    var payloadCompleto = {
      status: "sucesso",
      total: dadosAba.length,
      dados: dadosAba
    };

    var jsonString = JSON.stringify(payloadCompleto);
    if (e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonString + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonString).setMimeType(ContentService.MimeType.JSON);

  } else {
    // Se não solicitou uma aba específica, exporta todas as abas da planilha
    var sheets = ss.getSheets();
    var finalPayload = {};
    sheets.forEach(function(sheetItem) {
      finalPayload[sheetItem.getName()] = extrairDadosDaAba(sheetItem);
    });

    var jsonAll = JSON.stringify(finalPayload);
    if (e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonAll + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonAll).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Endpoint POST - Recebe payload de gravação e registra na PRIMEIRA LINHA LIVRE
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lErr) {}

  try {
    var ss = getTargetSpreadsheet();
    if (!ss) throw new Error("Planilha não acessível.");

    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheetByName(GESTAO_SHEET_NAME) || ss.getSheets()[0];
    
    var contents = (e && e.postData) ? e.postData.contents : null;
    var dados = {};
    if (contents) {
      try {
        dados = JSON.parse(contents);
      } catch(pjErr) {
        dados = e.parameter || {};
      }
    } else if (e && e.parameter) {
      dados = e.parameter;
    }

    var recordsToSave = parseSectorBreakdown(
      dados.setor,
      dados.observacoes || dados.detalhes,
      dados.qtdEnderecos || dados.paletes || dados.quantidade,
      dados.horas || dados.tempoGasto
    );

    var dataAtividade = dados.data || dados.dataAtividade || new Date().toLocaleDateString('pt-BR');
    var semana = dados.semana || 1;
    var semanaAno = dados.semanaAno || new Date().getFullYear();
    var atividade = dados.atividade || "Reapro";
    var colaborador = (dados.colaborador || dados.nome || "OPERADOR").toString().toUpperCase();

    var savedRows = [];

    recordsToSave.forEach(function(rec) {
      var targetRow = findFirstAvailableRow(sheet);

      sheet.getRange(targetRow, 1, 1, 9).setValues([[
        rec.setor,
        dataAtividade,
        semana,
        semanaAno,
        atividade,
        colaborador,
        rec.qtdEnderecos,
        rec.horas,
        rec.vph
      ]]);

      savedRows.push(targetRow);
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "sucesso",
      mensagem: "Registros gravados na primeira linha livre disponível",
      linhasGravadas: savedRows,
      totalRegistros: savedRows.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "erro",
      mensagem: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch(rErr) {}
  }
}
