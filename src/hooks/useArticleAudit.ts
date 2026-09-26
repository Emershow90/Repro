/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Motor de Auditoria de Artigos (Cross-Validation e Gestão Local IndexedDB)
 *
 * A-01 aplicado (2026-09-26): MAX_LOTE_RANGE + regex robusta + parser puro.
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
  enderecoEsperado: string;
  ruaOperacao: string | null;
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

/* ============================================================
 * A-01: Proteção contra memory bomb em ranges de lote
 * ============================================================ */

const MAX_LOTE_RANGE = 5000;

/**
 * Regex robusta — aceita as variações operacionais comuns:
 *   "Lote: 180 a 182"
 *   "Lote: 180 até 182"
 *   "Lote: 180-182"
 *   "Lote 180/182"
 *   "Palete: X | Lote: 180 a 182"
 */
const LOTE_REGEX = /\bLote:?\s*(\d+)\s*(?:a|até|-|\/|–|—)\s*(\d+)/i;

interface ParsedLote {
  inicio: number;
  fim: number;
  total: number;
}

/**
 * Função pura — testável e sem efeitos colaterais.
 * Retorna null se:
 *   - A observação não casa com o padrão
 *   - O range é inválido (fim < inicio)
 *   - O range excede MAX_LOTE_RANGE (proteção anti memory bomb)
 */
function parseLoteFromObservation(obs: string | undefined): ParsedLote | null {
  if (!obs || typeof obs !== 'string') return null;

  const match = obs.match(LOTE_REGEX);
  if (!match) return null;

  const inicio = parseInt(match[1], 10);
  const fim = parseInt(match[2], 10);

  if (isNaN(inicio) || isNaN(fim) || inicio < 0 || fim < 0) return null;
  if (fim < inicio) return null;

  const total = fim - inicio + 1;

  if (total > MAX_LOTE_RANGE) {
    console.warn(
      `[useArticleAudit] Range ignorado por exceder limite seguro: ` +
      `${inicio}-${fim} (${total} un > ${MAX_LOTE_RANGE}).`
    );
    return null;
  }

  return { inicio, fim, total };
}

/* ============================================================
 * HOOK PRINCIPAL
 * ============================================================ */

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

  const { auditResults, summary, lotesIgnorados } = useMemo(() => {
    const rawWms = wmsData || [];
    const rawLogs = logs || [];

    // 1. Tabela hash de bipes realizados (lookup O(1))
    const realizedBoxes = new Map<string, { rua: string; artigo: string }>();
    let ignoredCount = 0;

    rawLogs.forEach((log) => {
      const lote = parseLoteFromObservation(log.observacoes);
      if (!lote) {
        // Só conta como "ignorado" se a observação *parecia* um lote
        if (log.observacoes && LOTE_REGEX.test(log.observacoes)) {
          ignoredCount++;
        }
        return;
      }

      // Defesa em profundidade (parser já validou)
      const effectiveEnd = Math.min(lote.fim, lote.inicio + MAX_LOTE_RANGE - 1);

      for (let caixa = lote.inicio; caixa <= effectiveEnd; caixa++) {
        realizedBoxes.set(String(caixa), {
          rua: log.rua || '',
          artigo: log.artigo || '',
        });
      }
    });

    if (ignoredCount > 0 && import.meta.env.DEV) {
      console.warn(
        `[useArticleAudit] ${ignoredCount} lote(s) ignorado(s) nesta rodada por exceder limite.`
      );
    }

    // 2. Diffing: WMS planejado vs. realizado
    const initialSummary: AuditSummary = {
      total: rawWms.length,
      validados: 0,
      alertas: 0,
      inconsistentes: 0,
      pendentes: 0,
    };

    const results: AuditRecord[] = rawWms.map((wmsItem) => {
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
        mensagem: 'Aguardando bipe do operador.',
      };

      if (!realized) {
        initialSummary.pendentes++;
        return record;
      }

      if (realized.artigo !== wmsItem.artigo) {
        record.status = 'INCONSISTENTE';
        record.mensagem = `FALHA CRÍTICA: Esperado ${wmsItem.artigo}, Bipado ${realized.artigo}.`;
        initialSummary.inconsistentes++;
      } else {
        record.status = 'VALIDADO';
        record.mensagem = `Lote movido corretamente na rua ${realized.rua}.`;
        initialSummary.validados++;
      }

      return record;
    });

    return {
      auditResults: results,
      summary: initialSummary,
      lotesIgnorados: ignoredCount,
    };
  }, [wmsData, logs]);

  return {
    records,
    setRecords,
    loading,
    refreshRecords,
    auditResults,
    summary,
    lotesIgnorados,
  };
}

export default useArticleAudit;
