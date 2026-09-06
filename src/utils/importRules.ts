import { useState, useEffect } from 'react';

/**
 * Função utilitária para buscar e converter CSV público de regras
 * Espera formato: enderecoPere,contenantPere,contenantFils,artigo,quantidadePadrao
 */
export async function importarRegrasPlanilha(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao buscar CSV: ${response.statusText}`);
    
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    // Ignora cabeçalho se existir
    const dataLines = lines.slice(1);
    
    const regras = dataLines.map(line => {
      const [enderecoPere, contenantPere, contenantFils, artigo, quantidadePadrao] = line.split(',');
      return {
        enderecoPere: enderecoPere.trim(),
        contenantPere: contenantPere.trim(),
        contenantFils: contenantFils.trim(),
        artigo: artigo.trim(),
        quantidadePadrao: parseInt(quantidadePadrao.trim(), 10)
      };
    });

    return regras;
  } catch (error) {
    console.error('Erro ao importar regras:', error);
    throw error;
  }
}
