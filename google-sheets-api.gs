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
