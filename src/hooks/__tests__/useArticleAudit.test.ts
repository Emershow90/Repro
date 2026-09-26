import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useArticleAudit } from '../useArticleAudit';

const makeLog = (obs: string, artigo = 'ART-1', rua = 'B4VD') => ({
  id: 1, colaborador: 'A', rua, artigo,
  observacoes: obs, volumes: 1, horas: 0.1,
  data: '2026-09-15', tipo: 'direta' as const,
  atividade: 'REPRO', dia: 'Seg', semana: 37, vph: '10',
  timestamp: 1, synced: false,
});

const makeWms = (ctnFilho: string, artigo = 'ART-1') => ({
  id: 'w1', ctnFilho, ctnPai: 'P1', artigo, enderecoFinal: 'B4VD-01',
});

describe('A-01: Proteção contra memory bomb', () => {
  it('rejeita range > 5000', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wms = [makeWms('500')];
    const logs = [makeLog('Lote: 1 a 999999')];

    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('PENDENTE');
    expect(result.current.lotesIgnorados).toBe(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('aceita "Lote: 180 até 182"', () => {
    const wms = [makeWms('181')];
    const logs = [makeLog('Lote: 180 até 182')];
    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('VALIDADO');
  });

  it('aceita "Lote: 180-182"', () => {
    const wms = [makeWms('182')];
    const logs = [makeLog('Lote: 180-182')];
    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('VALIDADO');
  });

  it('aceita "Lote: 180/182"', () => {
    const wms = [makeWms('180')];
    const logs = [makeLog('Lote: 180/182')];
    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('VALIDADO');
  });

  it('rejeita fim < inicio', () => {
    const wms = [makeWms('180')];
    const logs = [makeLog('Lote: 182 a 180')];
    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('PENDENTE');
  });

  it('detecta artigo divergente como INCONSISTENTE', () => {
    const wms = [makeWms('500', 'ART-ESPERADO')];
    const logs = [makeLog('Lote: 500 a 500', 'ART-ERRADO')];
    const { result } = renderHook(() => useArticleAudit(wms as any, logs as any));
    expect(result.current.auditResults[0].status).toBe('INCONSISTENTE');
    expect(result.current.summary.inconsistentes).toBe(1);
  });
});
