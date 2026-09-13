/**
 * GOOGLE APPS SCRIPT — REPRO v2.0
 *
 * Deployment:
 *   - Executar como:  Eu
 *   - Acesso:         Qualquer pessoa
 *   - Usar /exec (nunca /dev)
 *
 * Script Properties obrigatórias (Arquivo → Propriedades do projeto):
 *   SPREADSHEET_ID  = <id da planilha>
 *   API_TOKEN       = <token HMAC/estático para escrita>
 *
 * Contrato suportado:
 *   1. Payload singular (operador Zebra):
 *      { setor, observacoes|detalhes, qtdEnderecos|paletes, horas, ... }
 *
 *   2. Payload consolidado (syncOrchestrator):
 *      { tipo: "SYNC_BATCH_CONSOLIDATED_REPRO",
 *        relatorio_diario, relatorio_semanal, relatorio_mensal,
 *        eventos_pendentes }
 */

var SHEET_NAME          = "Controle de horas - Repro";
var GESTAO_SHEET_NAME   = "Gestão";
var RELATORIOS_SHEET    = "Relatórios Consolidados";
var VALID_SECTORS       = ["87", "88", "89", "90"];
var LOCK_TIMEOUT_MS     = 15000;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function getTargetSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("SPREADSHEET_ID não configurado em Script Properties");
  var ss = SpreadsheetApp.openById(id);
  if (!ss) throw new Error("Planilha não acessível: " + id);
  return ss;
}

function jsonOut_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(callback)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "erro", mensagem: "callback inválido" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sanitiza valor para célula — previne Formula Injection.
 * Prefixa com apóstrofo qualquer valor que comece com = + - @ tab CR.
 */
function safeCell_(v) {
  if (v === null || v === undefined) return "";
  var s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function extrairDadosDaAba_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var rowObj = {}, has = false;
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j] ? String(headers[j]).trim() : "";
      if (h) {
        rowObj[h] = data[i][j];
        if (data[i][j] !== "" && data[i][j] !== null && data[i][j] !== undefined) has = true;
      }
    }
    if (has) out.push(rowObj);
  }
  return out;
}

/**
 * Retorna o número da primeira linha vazia varrendo A:I a partir da linha 2.
 * @param {Sheet} sheet
 * @param {number} startFromRow  linha a partir da qual começar a varredura
 */
function findFirstAvailableRow_(sheet, startFromRow) {
  var lastRow = sheet.getLastRow();
  var from = Math.max(startFromRow || 2, 2);
  if (lastRow < from) return from;

  var range = sheet.getRange(from, 1, lastRow - from + 1, 9).getValues();
  for (var i = 0; i < range.length; i++) {
    var row = range[i], isEmpty = true;
    for (var j = 0; j < row.length; j++) {
      if (row[j] !== null && row[j] !== undefined && String(row[j]).trim() !== "") {
        isEmpty = false; break;
      }
    }
    if (isEmpty) return from + i;
  }
  return lastRow + 1;
}

// ---------------------------------------------------------------------------
// Parser de setores (mantido, com fallback de erro)
// ---------------------------------------------------------------------------

function parseSectorBreakdown_(rawSetor, rawObs, totalPaletes, totalHoras) {
  rawSetor = (rawSetor || "").toString();
  rawObs   = (rawObs   || "").toString();
  totalPaletes = parseFloat(totalPaletes) || 0;
  totalHoras   = parseFloat(totalHoras)   || 0;

  var candidateSectors = [];
  var matches = rawSetor.match(/\d+/g);
  if (matches) {
    matches.forEach(function(s) {
      if (VALID_SECTORS.indexOf(s) !== -1 && candidateSectors.indexOf(s) === -1) {
        candidateSectors.push(s);
      }
    });
  }

  // Sem setor válido: erro explícito (não grava lixo)
  if (candidateSectors.length === 0) {
    throw new Error("Nenhum setor válido encontrado em '" + rawSetor + "'. Válidos: " + VALID_SECTORS.join(", "));
  }

  var breakdown = [];
  if (rawObs.trim() !== "") {
    rawObs.split(/[;|\n,]+/).forEach(function(chunk) {
      chunk = chunk.trim();
      if (!chunk) return;
      var numbers = chunk.match(/\d+/g);
      if (!numbers) return;

      if (numbers.length >= 2) {
        var foundSector = null, foundQty = null;
        numbers.forEach(function(n) {
          if (VALID_SECTORS.indexOf(n) !== -1) foundSector = n;
          else foundQty = parseFloat(n);
        });
        if (foundSector && foundQty !== null) {
          breakdown.push({ setor: foundSector, qtd: foundQty });
        }
      } else if (numbers.length === 1 && VALID_SECTORS.indexOf(numbers[0]) !== -1) {
        // Só setor sem quantidade: rateia depois
        if (!breakdown.some(function(b) { return b.setor === numbers[0]; })) {
          breakdown.push({ setor: numbers[0], qtd: 0 });
        }
      }
    });
  }

  if (breakdown.length === 0) {
    var share = totalPaletes / candidateSectors.length;
    candidateSectors.forEach(function(sec) { breakdown.push({ setor: sec, qtd: share }); });
  }

  var sumQty = 0;
  breakdown.forEach(function(b) { sumQty += b.qtd; });
  if (sumQty === 0) sumQty = totalPaletes || 1;

  return breakdown.map(function(b) {
    var w = b.qtd / sumQty;
    var itemHoras    = Math.round(totalHoras   * w * 100) / 100;
    var itemPaletes  = b.qtd > 0 ? b.qtd : Math.round(totalPaletes * w * 100) / 100;
    var itemVph      = itemHoras > 0 ? Math.round((itemPaletes / itemHoras) * 10) / 10 : 0;
    return { setor: b.setor, qtdEnderecos: itemPaletes, horas: itemHoras, vph: itemVph };
  });
}

// ---------------------------------------------------------------------------
// doGet — leitura apenas. Sem escrita via GET.
// ---------------------------------------------------------------------------

function doGet(e) {
  e = e || { parameter: {} };
  var cb = e.parameter && e.parameter.callback;

  try {
    var ss = getTargetSpreadsheet_();
    var nomeDaAba = e.parameter && (e.parameter.aba || e.parameter.sheet);

    if (nomeDaAba) {
      var sheet = ss.getSheetByName(nomeDaAba);
      if (!sheet) return jsonOut_({ status: "erro", erro: "Aba não encontrada" }, cb);
      return jsonOut_({
        status: "sucesso",
        total: extrairDadosDaAba_(sheet).length,
        dados: extrairDadosDaAba_(sheet)
      }, cb);
    }

    var finalPayload = {};
    ss.getSheets().forEach(function(s) {
      finalPayload[s.getName()] = extrairDadosDaAba_(s);
    });
    return jsonOut_(finalPayload, cb);

  } catch (err) {
    return jsonOut_({ status: "erro", mensagem: String(err) }, cb);
  }
}

// ---------------------------------------------------------------------------
// doPost — roteia por tipo, batched, com token
// ---------------------------------------------------------------------------

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (lErr) {
    return jsonOut_({ status: "erro", mensagem: "Concorrência: não foi possível obter lock" });
  }

  try {
    var ss = getTargetSpreadsheet_();
    var dados = parseBody_(e);

    // Autenticação por token (opcional mas recomendada)
    var requiredToken = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
    if (requiredToken && dados.token !== requiredToken) {
      return jsonOut_({ status: "erro", mensagem: "Token inválido" });
    }

    // Roteamento por contrato
    if (dados.tipo === "SYNC_BATCH_CONSOLIDATED_REPRO") {
      return jsonOut_(handleConsolidatedBatch_(ss, dados));
    }
    return jsonOut_(handleSingleRecord_(ss, dados));

  } catch (err) {
    return jsonOut_({ status: "erro", mensagem: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); }
    catch (_) { return e.parameter || {}; }
  }
  return (e && e.parameter) || {};
}

// --------- Singular (operador Zebra) ---------------------------------------

function handleSingleRecord_(ss, dados) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Aba '" + SHEET_NAME + "' não encontrada");

  var breakdown = parseSectorBreakdown_(
    dados.setor,
    dados.observacoes || dados.detalhes,
    dados.qtdEnderecos || dados.paletes || dados.quantidade,
    dados.horas || dados.tempoGasto
  );

  var dataAtividade = safeCell_(dados.data || dados.dataAtividade ||
                                Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy"));
  var semana        = dados.semana    || getIsoWeek_(new Date());
  var semanaAno     = dados.semanaAno || new Date().getFullYear();
  var atividade     = safeCell_(dados.atividade   || "Reapro");
  var colaborador   = safeCell_((dados.colaborador || dados.nome || "OPERADOR").toString().toUpperCase());

  return writeRowsBatched_(sheet, breakdown, function(rec) {
    return [
      safeCell_(rec.setor), dataAtividade, semana, semanaAno,
      atividade, colaborador, rec.qtdEnderecos, rec.horas, rec.vph
    ];
  });
}

// --------- Consolidado (syncOrchestrator) ----------------------------------

function handleConsolidatedBatch_(ss, payload) {
  var diario  = payload.relatorio_diario  || {};
  var semanal = payload.relatorio_semanal || {};
  var mensal  = payload.relatorio_mensal  || {};
  var eventos = payload.eventos_pendentes || [];

  // 1. Aba de relatórios consolidados (1 linha por sync)
  var sheetRel = ss.getSheetByName(RELATORIOS_SHEET) || ss.insertSheet(RELATORIOS_SHEET);
  var rowRel = [
    new Date(),
    safeCell_(diario.data || ""),
    safeCell_(diario.dia  || ""),
    diario.totalDemanda    || 0,
    diario.totalRealizado  || 0,
    diario.saldoPendente   || 0,
    diario.coberturaGlobal || 0,
    safeCell_(diario.ephGlobal || ""),
    safeCell_(diario.vphGlobal || ""),
    semanal.semana || "",
    semanal.coberturaGlobal || 0,
    mensal.mes || "",
    mensal.coberturaGlobal || 0,
    eventos.length,
    payload.versao_schema || ""
  ];
  sheetRel.appendRow(rowRel);

  // 2. Eventos individuais → aba principal (formato singular)
  var sheetLogs = ss.getSheetByName(SHEET_NAME);
  if (!sheetLogs) throw new Error("Aba '" + SHEET_NAME + "' não encontrada");

  var eventRows = eventos.map(function(ev) {
    var dataEv = Utilities.formatDate(new Date(ev.timestamp || Date.now()),
                                       "America/Sao_Paulo", "dd/MM/yyyy");
    return [
      safeCell_(ev.setor || ""), dataEv,
      safeCell_(payload.semana || getIsoWeek_(new Date())),
      new Date().getFullYear(),
      safeCell_(ev.tipo || "REABASTECIMENTO"),
      safeCell_(ev.artigo || ""),
      ev.enderecosDelta || 0,
      0,   // horas desconhecidas no evento
      ev.volumesDelta   || 0
    ];
  });

  if (eventRows.length) {
    var startRow = findFirstAvailableRow_(sheetLogs, 2);
    var contiguous = isRangeEmpty_(sheetLogs, startRow, eventRows.length);
    if (contiguous) {
      sheetLogs.getRange(startRow, 1, eventRows.length, eventRows[0].length).setValues(eventRows);
    } else {
      // Escreve linha a linha respeitando buracos
      eventRows.forEach(function(r) {
        var tr = findFirstAvailableRow_(sheetLogs, startRow);
        sheetLogs.getRange(tr, 1, 1, r.length).setValues([r]);
      });
    }
  }

  return {
    status: "sucesso",
    modo: "consolidado",
    eventos_gravados: eventRows.length,
    relatorio_gravado: true
  };
}

// --------- Escrita em batch ------------------------------------------------

function writeRowsBatched_(sheet, breakdown, rowMapper) {
  var startRow = findFirstAvailableRow_(sheet, 2);
  var n = breakdown.length;
  var matrix = breakdown.map(rowMapper);

  // Se o range [startRow, startRow+n) está vazio, um único setValues resolve.
  if (isRangeEmpty_(sheet, startRow, n)) {
    sheet.getRange(startRow, 1, n, matrix[0].length).setValues(matrix);
    return {
      status: "sucesso",
      linhasGravadas: rangeArr_(startRow, n),
      totalRegistros: n
    };
  }

  // Senão, escreve individualmente respeitando buracos
  var gravadas = [];
  var cursor = startRow;
  matrix.forEach(function(row) {
    var tr = findFirstAvailableRow_(sheet, cursor);
    sheet.getRange(tr, 1, 1, row.length).setValues([row]);
    gravadas.push(tr);
    cursor = tr + 1;
  });
  return { status: "sucesso", linhasGravadas: gravadas, totalRegistros: gravadas.length };
}

function isRangeEmpty_(sheet, startRow, numRows) {
  var lastRow = sheet.getLastRow();
  if (startRow > lastRow) return true;
  var end = Math.min(startRow + numRows - 1, lastRow);
  var values = sheet.getRange(startRow, 1, end - startRow + 1, 9).getValues();
  for (var i = 0; i < values.length; i++) {
    for (var j = 0; j < values[i].length; j++) {
      if (values[i][j] !== null && values[i][j] !== undefined && String(values[i][j]).trim() !== "") {
        return false;
      }
    }
  }
  return true;
}

function rangeArr_(start, n) {
  var a = [];
  for (var i = 0; i < n; i++) a.push(start + i);
  return a;
}

function getIsoWeek_(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
