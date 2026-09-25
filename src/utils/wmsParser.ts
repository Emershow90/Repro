/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * WMS Data Parser - Processa o dump de 11 colunas do AS400/WMS
 */

export interface WmsDumpRecord {
  id: string;
  data: string;          // Coluna 0: Data
  ctnPai: string;        // Coluna 1: Cont. Pai (Palete)
  enderecoOrigem: string;// Coluna 2: Endereço Origem
  zonaOrigem: string;    // Coluna 3: Zona
  artigo: string;        // Coluna 4: Artigo (SKU)
  ctnFilho: string;      // Coluna 5: Cont. Novo (Caixa)
  enderecoTampao: string;// Coluna 6: Endereço Tampão
  zonaDestino: string;   // Coluna 7: Zona Destino
  enderecoFinal: string; // Coluna 8: End. Final (Z.ap)
  unidade: string;       // Coluna 9: Uni
  quantidade: number;    // Coluna 10: Qtd
}

/**
 * Converte o texto colado da planilha numa matriz de registos WMS estruturados.
 * Ignora linhas vazias e o cabeçalho se ele for colado por engano.
 */
export function parsePastedSpreadsheetText(rawText: string): WmsDumpRecord[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const records: WmsDumpRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Ignora linhas em branco

    // O Excel/Sheets usa tabulação (\t) para separar colunas na área de transferência
    const columns = line.split('\t');

    // Validação flexível: garante que temos dados suficientes, mas evita quebrar 
    // se faltar a última coluna por erro de cópia.
    if (columns.length < 5) continue; 

    // Ignora a linha se for o cabeçalho colado (verifica pela palavra "Data" ou "Cont")
    if (columns[0].toLowerCase().includes('data') && columns[1].toLowerCase().includes('cont')) {
      continue;
    }

    try {
      const record: WmsDumpRecord = {
        id: `wms_${Date.now()}_${i}`, // Chave única para o IndexedDB
        data: columns[0]?.trim() || '',
        ctnPai: columns[1]?.trim() || '',
        enderecoOrigem: columns[2]?.trim() || '',
        zonaOrigem: columns[3]?.trim() || '',
        artigo: columns[4]?.trim() || '',
        ctnFilho: columns[5]?.trim() || '',
        enderecoTampao: columns[6]?.trim() || '',
        zonaDestino: columns[7]?.trim() || '',
        enderecoFinal: columns[8]?.trim() || '',
        unidade: columns[9]?.trim() || '',
        quantidade: parseInt(columns[10]?.trim(), 10) || 0,
      };

      // Só adiciona se tiver os dados vitais para a operação
      if (record.ctnPai && record.artigo && record.ctnFilho) {
        records.push(record);
      }
    } catch (err) {
      console.warn(`Erro ao processar a linha ${i}:`, line, err);
    }
  }

  return records;
}

/**
 * Função utilitária para gerar o formato de exportação inverso.
 * Transforma os dados do IndexedDB de volta para texto compatível com Excel.
 */
export function generateExportText(records: WmsDumpRecord[]): string {
  const header = "Data\tCont. Pai (Palete)\tEndereço Origem\tZona\tArtigo (SKU)\tCont. Novo (Caixa)\tEndereço Tampão\tZona Destino\tEnd. Final (Z.ap)\tUni\tQtd";
  
  const rows = records.map(r => {
    return `${r.data}\t${r.ctnPai}\t${r.enderecoOrigem}\t${r.zonaOrigem}\t${r.artigo}\t${r.ctnFilho}\t${r.enderecoTampao}\t${r.zonaDestino}\t${r.enderecoFinal}\t${r.unidade}\t${r.quantidade}`;
  });

  return [header, ...rows].join('\n');
}
