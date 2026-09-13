// Google Apps Script para o Terminal REPRO (Abas: Controle de horas - Repro, Gestão, Formulário)
// Instrução: Cole no Editor de Scripts da Planilha Google (Extensões > Apps Script)

var SPREADSHEET_ID = "COLOQUE_O_ID_DA_SUA_PLANILHA_AQUI";
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
}
