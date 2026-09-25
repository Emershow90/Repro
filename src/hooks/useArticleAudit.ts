/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Motor de Auditoria de Artigos (Cross-Validation e Gestão Local IndexedDB)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Log } from '../types';
import { WmsDumpRecord } from '../utils/wmsParser';
import { ArticleAddressRecord, loadArticleAddressRecords } from '../services/articleAddressService';

export type AuditStatus = 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE' | 'PENDENTE';

export interface AuditRecord {
  id: string;
  ctnFilho: string;
  ctnPai: string;
  artigoEsperado: string;
  artigoBipado: string | null;
  enderecoEsperado: string; // Endereço de destino WMS (Z.ap)
  ruaOperacao: string | null; // Rua onde o operador bipou
  status: AuditStatus;
  mensagem: string;
}

export interface AuditSummary {
  total: number;
  validados: number;
  alertas: number;
  inconsistentes: number;
  pendentes: number;
}

export function useArticleAudit(wmsData?: WmsDumpRecord[], logs?: Log[]) {
  const [records, setRecords] = useState<ArticleAddressRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadArticleAddressRecords();
      setRecords(data);
    } catch (err) {
      console.error('Erro ao carregar registros de auditoria:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRecords();
  }, [refreshRecords]);

  const { auditResults, summary } = useMemo(() => {
    const rawWms = wmsData || [];
    const rawLogs = logs || [];

    // 1. Tabela Hash de Bipes Realizados (Lookup rápido O(1))
    // Mapeia o CTN Filho para o dado real da operação
    const realizedBoxes = new Map<string, { rua: string; artigo: string }>();

    rawLogs.forEach(log => {
      // Extrair o range de caixas da string "Palete: X | Lote: Y a Z"
      const match = log.observacoes?.match(/Lote:\s*(\d+)\s*a\s*(\d+)/i);
      
      if (match) {
        const inicio = parseInt(match[1], 10);
        const fim = parseInt(match[2], 10);
        
        if (!isNaN(inicio) && !isNaN(fim)) {
          // Expande o range (ex: 180 a 182 vira [180, 181, 182])
          for (let caixa = inicio; caixa <= fim; caixa++) {
            realizedBoxes.set(caixa.toString(), {
              rua: log.rua || '',
              artigo: log.artigo || ''
            });
          }
        }
      }
    });

    const initialSummary: AuditSummary = { total: rawWms.length, validados: 0, alertas: 0, inconsistentes: 0, pendentes: 0 };

    // 2. Diffing: WMS Planejado VS Realizado
    const results: AuditRecord[] = rawWms.map(wmsItem => {
      const realized = realizedBoxes.get(wmsItem.ctnFilho);

      const record: AuditRecord = {
        id: wmsItem.id,
        ctnFilho: wmsItem.ctnFilho,
        ctnPai: wmsItem.ctnPai,
        artigoEsperado: wmsItem.artigo,
        artigoBipado: realized ? realized.artigo : null,
        enderecoEsperado: wmsItem.enderecoFinal,
        ruaOperacao: realized ? realized.rua : null,
        status: 'PENDENTE',
        mensagem: 'Aguardando bipe do operador.'
      };

      if (!realized) {
        initialSummary.pendentes++;
        return record;
      }

      // Validação de Integridade do Artigo
      if (realized.artigo !== wmsItem.artigo) {
        record.status = 'INCONSISTENTE';
        record.mensagem = `FALHA CRÍTICA: Esperado ${wmsItem.artigo}, Bipado ${realized.artigo}.`;
        initialSummary.inconsistentes++;
      } 
      // Validação Flexível de Endereço
      else {
        record.status = 'VALIDADO';
        record.mensagem = `Lote movido corretamente na rua ${realized.rua}.`;
        initialSummary.validados++;
      }

      return record;
    });

    return { auditResults: results, summary: initialSummary };
  }, [wmsData, logs]);

  return {
    records,
    setRecords,
    loading,
    refreshRecords,
    auditResults,
    summary
  };
}

export default useArticleAudit;
