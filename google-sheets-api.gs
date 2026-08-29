// =========================================================================
// GOOGLE APPS SCRIPT OFICIAL - SISTEMA OPERACIONAL REPRO (MULTI-MÁQUINAS)
// Suporte a Leituras e Escritas Simultâneas (PDTs, Coletores Zebra e PCs)
// =========================================================================

var SPREADSHEET_ID = "1dm1FJTjbjqIGo4nCLz2odAwbhDZ6eM5yzMLbPXl3N4c";
var SHEET_NAME = "Controle de horas - Repro";

function doPost(e) {
  var resposta = function(sucesso, dados, statusCode) {
    if (statusCode === void 0) { statusCode = 200; }
    return ContentService
      .createTextOutput(JSON.stringify(Object.assign({ status: sucesso ? "sucesso" : "erro" }, dados)))
      .setMimeType(ContentService.MimeType.JSON);
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return resposta(false, { erro: "Payload vazio ou inválido" }, 400);
    }

    var dados;
    try {
      dados = JSON.parse(e.postData.contents);
    } catch (err) {
      return resposta(false, { erro: "JSON malformado" }, 400);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      
      // 1. SINCRONIZAÇÃO EM LOTE DO RESUMO REPRO E EVENTOS
      if (dados.tipo === 'SYNC_BATCH_REPRO' && Array.isArray(dados.resumo)) {
        var sheetResumo = ss.getSheetByName("RESUMO_REPRO");
        if (!sheetResumo) {
          sheetResumo = ss.insertSheet("RESUMO_REPRO");
          sheetResumo.appendRow(["Data", "Setor", "Rua", "Status", "Demanda", "Realizado", "Pendente", "Cobertura_%", "Excedente", "EPH", "VPH", "Tempo", "Atualizado_Em"]);
        }

        var dataStr = dados.data || new Date().toLocaleDateString('pt-BR');
        var agora = new Date().toISOString();

        dados.resumo.forEach(function(item) {
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

        if (Array.isArray(dados.eventos) && dados.eventos.length > 0) {
          var sheetEventos = ss.getSheetByName("EVENTOS_OPERACIONAIS");
          if (!sheetEventos) {
            sheetEventos = ss.insertSheet("EVENTOS_OPERACIONAIS");
            sheetEventos.appendRow(["Event_ID", "Timestamp", "Tipo", "Setor", "Rua", "Delta_Enderecos", "Delta_Volumes", "Lap_Segundos", "Justificativa"]);
          }
          dados.eventos.forEach(function(evt) {
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

      // 2. REGISTRO PADRÃO DE LOG (Controle de horas - Repro)
      var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
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
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
    
    // Suporte a Inserção via GET (Fallback JSONP para navegadores com restrições CORS estritas)
    if (e && e.parameter && e.parameter.action === 'insert') {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var payload = e.parameter.payload;
        var dados = JSON.parse(payload);
        var vph = dados.horas > 0 ? (dados.qtdEnderecos / dados.horas) : 0;
        var lastRow = sheet.getLastRow();
        var linhaAlvo = lastRow + 1;
        
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
        
        var jsonInsert = JSON.stringify({ status: "sucesso", operacao: "inserido", linha: linhaAlvo });
        if (e.parameter.callback) {
          return ContentService.createTextOutput(e.parameter.callback + "(" + jsonInsert + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
        }
        return ContentService.createTextOutput(jsonInsert).setMimeType(ContentService.MimeType.JSON);
      } finally {
        lock.releaseLock();
      }
    }

    // Leitura geral de dados (Para receber dados simultâneos de outras máquinas)
    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      var emptyJson = JSON.stringify({ status: "sucesso", dados: [] });
      if (e && e.parameter && e.parameter.callback) {
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
    if (e && e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + jsonResult + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonResult).setMimeType(ContentService.MimeType.JSON);
  } catch(erro) {
    var errJson = JSON.stringify({ status: "erro", mensagem: erro.toString() });
    if (e && e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + "(" + errJson + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson).setMimeType(ContentService.MimeType.JSON);
  }
}
