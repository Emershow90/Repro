/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Serviço de Fechamento de Turno Geral, Travamento de Edição e Resumo CSV
 */

import { Log } from '../types';
import { getState, saveState, saveAuditLog } from './dbLocal';
import { formatDateToBR } from '../utils/dateUtils';

export interface StreetProductivity {
  street: string;
  boxes: number;
  addresses: number;
  hours: number;
  vph: number;
  eph: number;
}

export interface ShiftClosureRecord {
  protocol: string;
  dateBR: string; // ex: '19/09/2026'
  dateISO: string; // ex: '2026-09-19'
  closedAt: number; // timestamp
  closedBy: string;
  setor: string;
  totalBoxes: number;
  totalAddresses: number;
  totalHours: number;
  overallVph: number;
  overallEph: number;
  targetVph: number;
  targetMet: boolean;
  streetsWorked: StreetProductivity[];
  checklist5SConform: boolean;
  observations?: string;
  isLocked: boolean;
  reopenedAt?: number;
  reopenedBy?: string;
  reopenReason?: string;
}

const STORAGE_LOCK_KEY_PREFIX = 'repro_shift_locked_';
const STORAGE_CLOSURE_KEY_PREFIX = 'repro_shift_closure_';

/**
 * Verifica de forma síncrona (com cache local) se o turno para a data está travado
 */
export function isShiftLocked(dateBR?: string): boolean {
  const targetDate = dateBR || formatDateToBR(new Date());
  try {
    const item = localStorage.getItem(`${STORAGE_LOCK_KEY_PREFIX}${targetDate}`);
    return item === 'true';
  } catch {
    return false;
  }
}

/**
 * Obtém os detalhes do fechamento do turno para a data especificada
 */
export async function getShiftClosure(dateBR?: string): Promise<ShiftClosureRecord | null> {
  const targetDate = dateBR || formatDateToBR(new Date());
  
  // 1. Tenta IndexedDB
  try {
    const fromDb = await getState<ShiftClosureRecord>(`${STORAGE_CLOSURE_KEY_PREFIX}${targetDate}`);
    if (fromDb) return fromDb;
  } catch (err) {
    console.warn('Erro ao ler fechamento do IndexedDB:', err);
  }

  // 2. Fallback para localStorage
  try {
    const raw = localStorage.getItem(`${STORAGE_CLOSURE_KEY_PREFIX}${targetDate}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Erro ao ler fechamento do localStorage:', err);
  }

  return null;
}

/**
 * Salva o registro de fechamento de turno e ativa o travamento de edição
 */
export async function saveShiftClosure(record: ShiftClosureRecord): Promise<void> {
  const targetDate = record.dateBR;
  
  // Salva no localStorage para verificação instantânea
  try {
    localStorage.setItem(`${STORAGE_LOCK_KEY_PREFIX}${targetDate}`, record.isLocked ? 'true' : 'false');
    localStorage.setItem(`${STORAGE_CLOSURE_KEY_PREFIX}${targetDate}`, JSON.stringify(record));
  } catch (e) {
    console.warn('Falha ao salvar fechamento no localStorage:', e);
  }

  // Salva no IndexedDB state
  try {
    await saveState(`${STORAGE_CLOSURE_KEY_PREFIX}${targetDate}`, record);
    await saveState(`${STORAGE_LOCK_KEY_PREFIX}${targetDate}`, record.isLocked);
  } catch (e) {
    console.warn('Falha ao salvar fechamento no IndexedDB:', e);
  }
}

/**
 * Reabre conscientemente o turno travado para permitir edições e novos apontamentos
 */
export async function reopenShift(
  dateBR: string,
  reopenedBy: string,
  reason: string
): Promise<ShiftClosureRecord | null> {
  const current = await getShiftClosure(dateBR);
  if (!current) return null;

  const updated: ShiftClosureRecord = {
    ...current,
    isLocked: false,
    reopenedAt: Date.now(),
    reopenedBy: reopenedBy.toUpperCase(),
    reopenReason: reason.trim() || 'Ajuste ou novos apontamentos operacionais'
  };

  await saveShiftClosure(updated);

  // Registra no histórico de auditoria
  try {
    await saveAuditLog({
      id: `audit-reopen-${Date.now()}`,
      timestamp: Date.now(),
      tipo: 'AUDITORIA_5S',
      setor: updated.setor || '87',
      rua: 'GERAL',
      operador: reopenedBy.toUpperCase(),
      contexto: {
        ctnPaiBipado: updated.protocol,
        ctnFilhoBipado: `Reabertura Turno ${dateBR}`,
        artigoEsperado: 'REABERTURA_CONSCIENTE'
      },
      justificativa: `[REABERTURA DE TURNO] Protocolo: ${updated.protocol}. Motivo: ${reason}`,
      synced: false
    });
  } catch (err) {
    console.warn('Erro ao salvar auditoria de reabertura:', err);
  }

  return updated;
}

/**
 * Calcula a produtividade consolidada do dia, detalhamento de horas por rua e conformidade com a meta
 */
export function calculateShiftSummary(
  logs: Log[],
  targetVph = 56,
  targetDateBR?: string
): {
  totalBoxes: number;
  totalAddresses: number;
  totalHours: number;
  overallVph: number;
  overallEph: number;
  targetMet: boolean;
  streetsWorked: StreetProductivity[];
  todayLogs: Log[];
} {
  const targetDate = targetDateBR || formatDateToBR(new Date());
  const todayISO = new Date().toISOString().slice(0, 10);

  // Filtra logs do dia alvo (desconsiderando logs de fechamento de turno anteriores para não duplicar contagem)
  const todayLogs = logs.filter(l => {
    const isSameDate = l.data === targetDate || l.data === todayISO;
    const isClosure = l.atividade?.toUpperCase().includes('FECHAMENTO GERAL DE TURNO');
    const isCheckpoint = l.atividade?.toUpperCase().includes('INÍCIO_DIA');
    return isSameDate && !isClosure && !isCheckpoint;
  });

  const totalBoxes = todayLogs.reduce((acc, l) => acc + (Number(l.volumes) || 0), 0);
  const totalAddresses = todayLogs.reduce((acc, l) => acc + (Number(l.enderecos) || 0), 0);
  const totalHours = todayLogs.reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

  const overallVph = totalHours > 0 ? Math.round(totalBoxes / totalHours) : 0;
  const overallEph = totalHours > 0 ? Math.round(totalAddresses / totalHours) : 0;

  // Agrupamento por rua
  const streetMap = new Map<string, { boxes: number; addresses: number; hours: number }>();

  todayLogs.forEach(l => {
    let streetName = l.rua ? l.rua.toUpperCase().trim() : '';

    if (!streetName && l.atividade) {
      const match = l.atividade.match(/Rua\s+([A-Z0-9_-]+)/i);
      if (match && match[1]) {
        streetName = match[1].toUpperCase();
      } else if (l.atividade.length <= 8 && /^[A-Z0-9_-]+$/.test(l.atividade)) {
        streetName = l.atividade.toUpperCase();
      }
    }

    if (!streetName) {
      streetName = l.tipo === 'indireta' ? 'ATIVIDADES INDIRETAS' : 'GERAL';
    }

    const current = streetMap.get(streetName) || { boxes: 0, addresses: 0, hours: 0 };
    current.boxes += Number(l.volumes) || 0;
    current.addresses += Number(l.enderecos) || 0;
    current.hours += Number(l.horas) || 0;
    streetMap.set(streetName, current);
  });

  const streetsWorked: StreetProductivity[] = Array.from(streetMap.entries()).map(([street, data]) => {
    const vph = data.hours > 0 ? Math.round(data.boxes / data.hours) : 0;
    const eph = data.hours > 0 ? Math.round(data.addresses / data.hours) : 0;
    return {
      street,
      boxes: data.boxes,
      addresses: data.addresses,
      hours: Number(data.hours.toFixed(2)),
      vph,
      eph
    };
  }).sort((a, b) => b.boxes - a.boxes);

  const targetMet = overallVph >= targetVph && overallVph > 0;

  return {
    totalBoxes,
    totalAddresses,
    totalHours: Number(totalHours.toFixed(2)),
    overallVph,
    overallEph,
    targetMet,
    streetsWorked,
    todayLogs
  };
}

/**
 * Gera e realiza o download do resumo consolidado do turno em arquivo CSV
 */
export function exportShiftSummaryCSV(record: ShiftClosureRecord): void {
  const lines: string[] = [];

  // Cabeçalho do Relatório
  lines.push('RELATORIO CONSOLIDADO DE FECHAMENTO DE TURNO - REPRO');
  lines.push(`Protocolo;${record.protocol}`);
  lines.push(`Data do Turno;${record.dateBR}`);
  lines.push(`Operador Responsavel;${record.closedBy}`);
  lines.push(`Setor;${record.setor}`);
  lines.push(`Horario de Fechamento;${new Date(record.closedAt).toLocaleTimeString('pt-BR')}`);
  lines.push(`Status de Travamento;${record.isLocked ? 'TRAVADO (EDICAO BLOQUEADA)' : 'REABERTO'}`);
  if (record.reopenedAt) {
    lines.push(`Reaberto Em;${new Date(record.reopenedAt).toLocaleString('pt-BR')}`);
    lines.push(`Reaberto Por;${record.reopenedBy || 'N/A'}`);
    lines.push(`Motivo da Reabertura;${record.reopenReason || 'N/A'}`);
  }
  lines.push('');

  // Indicadores Gerais
  lines.push('INDICADORES CONSOLIDADOS DO DIA');
  lines.push(`Total de Caixas / Volumes;${record.totalBoxes}`);
  lines.push(`Total de Enderecos Atendidos;${record.totalAddresses}`);
  lines.push(`Total de Horas Trabalhadas;${record.totalHours.toFixed(2)}h`);
  lines.push(`VPH Consolidado (Caixas/Hora);${record.overallVph}`);
  lines.push(`EPH Consolidado (Enderecos/Hora);${record.overallEph}`);
  lines.push(`Meta de Produtividade (VPH);${record.targetVph}`);
  lines.push(`Status da Meta;${record.targetMet ? 'META ATINGIDA (CONFORME)' : 'ABAIXO DA META'}`);
  lines.push(`Checklist 5S & Seguranca;${record.checklist5SConform ? 'CONFORME' : 'NAO CONFORME'}`);
  lines.push(`Observacoes;${(record.observations || 'Nenhuma ressalva').replace(/;/g, ',')}`);
  lines.push('');

  // Detalhamento de Horas e Volumes por Rua
  lines.push('DETALHAMENTO DE HORAS E VOLUMES POR RUA');
  lines.push('Rua;Caixas;Enderecos;Horas;VPH (Cx/h);EPH (End/h)');
  record.streetsWorked.forEach(s => {
    lines.push(`${s.street};${s.boxes};${s.addresses};${s.hours.toFixed(2)};${s.vph};${s.eph}`);
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeDate = record.dateBR.replace(/\//g, '-');
  link.setAttribute('href', url);
  link.setAttribute('download', `resumo_turno_${safeDate}_${record.protocol}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
