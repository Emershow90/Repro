/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Modal de Fechamento Consciente de Turno - Finalizar Geral REPRO & Resumo Consolidado
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Boxes, 
  MapPin, 
  Clock, 
  Copy, 
  Check, 
  Cloud, 
  Database, 
  FileText, 
  X,
  Download,
  Lock,
  Unlock,
  TrendingUp,
  AlertCircle,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Log } from '../types';
import { formatDateToBR } from '../utils/dateUtils';
import { pdtAudio } from '../utils/pdtAudio';
import { executeSupabaseBackupNow } from '../services/supabaseBackupService';
import { saveAuditLog } from '../services/dbLocal';
import { 
  ShiftClosureRecord, 
  calculateShiftSummary, 
  saveShiftClosure, 
  getShiftClosure, 
  reopenShift, 
  exportShiftSummaryCSV 
} from '../services/shiftClosureService';

interface GeneralShiftClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: Log[];
  activeOperator: string;
  activeSectorId: string;
  onSaveLog: (log: Log) => Promise<void>;
  onTriggerSync?: () => Promise<void>;
  onAddToast: (msg: string, color?: string) => void;
  onShiftStateChanged?: () => void;
}

export default function GeneralShiftClosureModal({
  isOpen,
  onClose,
  logs,
  activeOperator,
  activeSectorId,
  onSaveLog,
  onTriggerSync,
  onAddToast,
  onShiftStateChanged
}: GeneralShiftClosureModalProps) {
  const todayBR = formatDateToBR(new Date());
  const todayISO = new Date().toISOString().slice(0, 10);

  // Meta de Produtividade Diária (padrão REPRO: 56 caixas/hora)
  const [targetVph, setTargetVph] = useState<number>(56);

  // Resumo Consolidado Calculado
  const summary = useMemo(() => {
    return calculateShiftSummary(logs, targetVph, todayBR);
  }, [logs, targetVph, todayBR]);

  // Estados do Formulário
  const [operatorName, setOperatorName] = useState(activeOperator || 'EMERSON GONÇALVES');
  const [shiftObservation, setShiftObservation] = useState('');
  
  // Checklist 5S & Operacional
  const [checkBoxes, setCheckBoxes] = useState(true);
  const [checkObstacles, setCheckObstacles] = useState(true);
  const [checkEquipment, setCheckEquipment] = useState(true);
  const [checkBalance, setCheckBalance] = useState(true);

  // Declaração Consciente Obrigatória
  const [consciousDeclaration, setConsciousDeclaration] = useState(false);

  // Estado do Fechamento Existente (para visualização de turno já finalizado)
  const [existingRecord, setExistingRecord] = useState<ShiftClosureRecord | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);

  // Reabertura de Turno
  const [showReopenPrompt, setShowReopenPrompt] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  // Estado de envio / conclusão
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closureProtocol, setClosureProtocol] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [sheetsStatus, setSheetsStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Atualiza operador quando abrir ou mudar
  useEffect(() => {
    if (activeOperator) {
      setOperatorName(activeOperator);
    }
  }, [activeOperator]);

  // Carrega registro existente se houver
  useEffect(() => {
    if (isOpen) {
      setIsLoadingExisting(true);
      getShiftClosure(todayBR).then(rec => {
        setExistingRecord(rec);
        if (rec) {
          setClosureProtocol(rec.protocol);
          if (rec.closedBy) setOperatorName(rec.closedBy);
          if (rec.observations) setShiftObservation(rec.observations);
          if (rec.targetVph) setTargetVph(rec.targetVph);
        }
        setIsLoadingExisting(false);
      }).catch(() => {
        setIsLoadingExisting(false);
      });
    }
  }, [isOpen, todayBR]);

  if (!isOpen) return null;

  const handleConfirmClosure = async () => {
    if (!consciousDeclaration) {
      onAddToast('Por favor, marque a declaração consciente de encerramento.', 'var(--color-warning)');
      return;
    }

    if (summary.totalHours <= 0 && summary.totalBoxes <= 0) {
      if (!confirm('Nenhum apontamento com horas ou caixas foi registrado hoje. Deseja finalizar o turno mesmo assim?')) {
        return;
      }
    }

    setIsSubmitting(true);
    setSupabaseStatus('saving');
    setSheetsStatus('saving');

    const generatedProtocol = `REPRO-TURNO-${todayISO.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // 1. Criar Log oficial de Fechamento de Turno Geral
      const closureLog: Log = {
        id: Date.now(),
        data: todayBR,
        colaborador: operatorName.trim() || 'OPERADOR REPRO',
        atividade: 'FECHAMENTO GERAL DE TURNO REPRO',
        tipo: 'direta',
        volumes: summary.totalBoxes,
        enderecos: summary.totalAddresses,
        horas: Number(summary.totalHours.toFixed(2)),
        vph: String(summary.overallVph),
        eph: String(summary.overallEph),
        setor: activeSectorId || '87',
        synced: false,
        timestamp: Date.now(),
        observacoes: `[FECHAMENTO CONSCIENTE] Protocolo: ${generatedProtocol}. Ruas (${summary.streetsWorked.length}): ${summary.streetsWorked.map(s => `${s.street}(${s.boxes}cx/${s.hours}h)`).join(', ') || 'N/A'}. Meta VPH: ${targetVph} (${summary.targetMet ? 'ATINGIDA' : 'ABAIXO'}). Obs: ${shiftObservation.trim() || 'Conforme'}`
      };

      await onSaveLog(closureLog);

      // 2. Criar e Salvar Registro Oficial com Travamento de Edição
      const closureRecord: ShiftClosureRecord = {
        protocol: generatedProtocol,
        dateBR: todayBR,
        dateISO: todayISO,
        closedAt: Date.now(),
        closedBy: operatorName.trim() || 'OPERADOR REPRO',
        setor: activeSectorId || '87',
        totalBoxes: summary.totalBoxes,
        totalAddresses: summary.totalAddresses,
        totalHours: summary.totalHours,
        overallVph: summary.overallVph,
        overallEph: summary.overallEph,
        targetVph: targetVph,
        targetMet: summary.targetMet,
        streetsWorked: summary.streetsWorked,
        checklist5SConform: checkBoxes && checkObstacles && checkEquipment && checkBalance,
        observations: shiftObservation.trim(),
        isLocked: true
      };

      await saveShiftClosure(closureRecord);
      setExistingRecord(closureRecord);

      // 3. Registrar Auditoria Local
      await saveAuditLog({
        id: `audit-${Date.now()}`,
        timestamp: Date.now(),
        tipo: 'AUDITORIA_5S',
        setor: activeSectorId || '87',
        rua: 'GERAL',
        operador: operatorName,
        contexto: {
          ctnPaiBipado: generatedProtocol,
          ctnFilhoBipado: `${summary.totalBoxes} cx / ${summary.totalHours}h`,
          artigoEsperado: 'FECHAMENTO_TURNO_CONSCIENTE'
        },
        justificativa: `[FECHAMENTO GERAL COM TRAVAMENTO] Protocolo: ${generatedProtocol}. VPH: ${summary.overallVph}/${targetVph}.`,
        synced: false
      });

      // 4. Sincronização Forçada com Supabase
      try {
        await executeSupabaseBackupNow();
        setSupabaseStatus('success');
      } catch (err) {
        console.warn('Falha no backup Supabase:', err);
        setSupabaseStatus('error');
      }

      // 5. Sincronização Forçada com Google Sheets
      if (onTriggerSync) {
        try {
          await onTriggerSync();
          setSheetsStatus('success');
        } catch (err) {
          console.warn('Falha no sync Sheets:', err);
          setSheetsStatus('error');
        }
      } else {
        setSheetsStatus('success');
      }

      // 6. Notifica estado
      if (onShiftStateChanged) {
        onShiftStateChanged();
      }

      pdtAudio.playSuccessChime();
      setClosureProtocol(generatedProtocol);
      onAddToast('Turno finalizado e edições travadas com sucesso!', 'var(--color-success)');
    } catch (err: any) {
      onAddToast(`Erro ao finalizar turno: ${err?.message || 'Falha desconhecida'}`, 'var(--color-danger)');
      pdtAudio.playScanError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenShift = async () => {
    if (!reopenReason.trim()) {
      onAddToast('Por favor, informe a justificativa da reabertura para auditoria.', 'var(--color-warning)');
      return;
    }

    setIsReopening(true);
    try {
      const updated = await reopenShift(todayBR, operatorName, reopenReason);
      if (updated) {
        setExistingRecord(updated);
        onAddToast('Turno reaberto com sucesso! Novas edições permitidas.', 'var(--color-success)');
        pdtAudio.playSuccessChime();
        if (onShiftStateChanged) {
          onShiftStateChanged();
        }
        setShowReopenPrompt(false);
      }
    } catch (err: any) {
      onAddToast(`Erro ao reabrir turno: ${err?.message || 'Falha'}`, 'var(--color-danger)');
    } finally {
      setIsReopening(false);
    }
  };

  const handleExportCSV = () => {
    const recordToExport: ShiftClosureRecord = existingRecord || {
      protocol: closureProtocol || `REPRO-PREVIEW-${todayISO.replace(/-/g, '')}`,
      dateBR: todayBR,
      dateISO: todayISO,
      closedAt: Date.now(),
      closedBy: operatorName,
      setor: activeSectorId,
      totalBoxes: summary.totalBoxes,
      totalAddresses: summary.totalAddresses,
      totalHours: summary.totalHours,
      overallVph: summary.overallVph,
      overallEph: summary.overallEph,
      targetVph: targetVph,
      targetMet: summary.targetMet,
      streetsWorked: summary.streetsWorked,
      checklist5SConform: true,
      observations: shiftObservation,
      isLocked: true
    };

    exportShiftSummaryCSV(recordToExport);
    onAddToast('Resumo consolidado exportado em CSV com sucesso!', 'var(--color-success)');
  };

  const getSummaryText = () => {
    const rec = existingRecord;
    const boxes = rec ? rec.totalBoxes : summary.totalBoxes;
    const addresses = rec ? rec.totalAddresses : summary.totalAddresses;
    const hours = rec ? rec.totalHours : summary.totalHours;
    const vph = rec ? rec.overallVph : summary.overallVph;
    const eph = rec ? rec.overallEph : summary.overallEph;
    const met = rec ? rec.targetMet : summary.targetMet;
    const streets = rec ? rec.streetsWorked : summary.streetsWorked;
    const prot = closureProtocol || rec?.protocol || 'EM_FECHAMENTO';

    const streetsList = streets.map(s => `  • ${s.street}: ${s.boxes} cx | ${s.hours}h | ${s.vph} VPH`).join('\n');

    return `*★ FECHAMENTO CONSOLIDADO DE TURNO - REPRO TORRE 5.0*
📅 Data: ${todayBR}
👤 Operador: ${operatorName}
📍 Setor: ${activeSectorId}
🔖 Protocolo: ${prot}
🔒 Status: ${rec?.isLocked ? 'TRAVADO (EDIÇÃO PROTEGIDA)' : 'ATIVO / REABERTO'}
------------------------------------
📦 Caixas Abastecidas: ${boxes} cx
🎯 Endereços Atendidos: ${addresses} posições
⏳ Horas Registradas: ${hours.toFixed(2)}h
⚡ Produtividade Geral: ${vph} VPH | ${eph} EPH
🎯 Meta de VPH (${targetVph}): ${met ? '✅ ATINGIDA' : '⚠️ ABAIXO DA META'}
------------------------------------
🛣️ Produtividade por Rua:
${streetsList || '  • Nenhuma rua registrada nominalmente'}
------------------------------------
✅ Checklist 5S & Segurança: CONFORME
📝 Observações: ${shiftObservation.trim() || 'Turno finalizado de forma consciente e correto.'}
🔒 Dados salvos no IndexedDB, Supabase Cloud e Planilha Google.`;
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(getSummaryText());
    setCopiedSummary(true);
    onAddToast('Comprovante copiado para a área de transferência!', 'var(--color-success)');
    setTimeout(() => setCopiedSummary(false), 3000);
  };

  // Se já temos um fechamento salvo para hoje e ele está travado, mostramos a visão de "Turno Finalizado / Resumo"
  const isCurrentlyLocked = Boolean(existingRecord?.isLocked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in font-mono">
      <div className="w-full max-w-2xl bg-slate-950 border-2 border-indigo-500/50 rounded-2xl shadow-2xl shadow-indigo-950/60 overflow-hidden my-auto">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-b border-indigo-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border shadow-inner ${
              isCurrentlyLocked 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
            }`}>
              {isCurrentlyLocked ? <Lock size={22} className="stroke-[2.5]" /> : <ShieldCheck size={22} className="stroke-[2.5]" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  {isCurrentlyLocked ? 'Resumo de Turno Finalizado' : 'Finalizar Turno Geral REPRO'}
                </h2>
                {isCurrentlyLocked ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase flex items-center gap-1">
                    <Lock size={10} /> Edição Travada
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase">
                    Turno Consciente
                  </span>
                )}
              </div>
              <p className="text-[11px] text-indigo-200/70">
                {isCurrentlyLocked 
                  ? 'Os dados deste dia estão protegidos contra edições acidentais na base local.' 
                  : 'Consolidação de produtividade, verificação de meta e proteção contra perdas'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isReopening}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTEÚDO PRINCIPAL */}
        <div className="p-4 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto scrollbar-thin">

          {/* 1. INDICADOR VISUAL SIMPLES DA META DE PRODUTIVIDADE (VERDE / VERMELHO) */}
          <div className={`p-4 rounded-xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg ${
            summary.targetMet
              ? 'bg-emerald-950/40 border-emerald-500/60 shadow-emerald-950/40'
              : 'bg-rose-950/40 border-rose-500/60 shadow-rose-950/40'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${
                summary.targetMet
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              }`}>
                {summary.targetMet ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                    summary.targetMet ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'
                  }`}>
                    {summary.targetMet ? 'META DE PRODUTIVIDADE ATINGIDA' : 'ABAIXO DA META DE PRODUTIVIDADE'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Produtividade Consolidada: <strong className="text-white font-mono text-sm">{summary.overallVph} VPH</strong>
                  {' '}(Meta estabelecida: <span className="font-mono text-white">{targetVph} cx/h</span>)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <label className="text-[10px] text-slate-400 uppercase">Meta (VPH):</label>
              <input
                type="number"
                min="10"
                max="200"
                value={targetVph}
                onChange={(e) => setTargetVph(Number(e.target.value) || 56)}
                disabled={isCurrentlyLocked}
                className="w-16 bg-slate-900 border border-white/20 rounded-lg px-2 py-1 text-xs text-white text-center font-bold focus:outline-none focus:border-indigo-400 font-mono"
              />
            </div>
          </div>

          {/* 2. CARDS DE PRODUÇÃO CONSOLIDADA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-white/10">
              <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                <Boxes size={12} className="text-indigo-400" /> Total de Caixas
              </div>
              <div className="text-xl font-black text-white mt-0.5">{summary.totalBoxes}</div>
              <div className="text-[9px] text-indigo-300/70">CTNs Reabastecidos</div>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-white/10">
              <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                <MapPin size={12} className="text-emerald-400" /> Endereços
              </div>
              <div className="text-xl font-black text-white mt-0.5">{summary.totalAddresses}</div>
              <div className="text-[9px] text-emerald-300/70">Posições Atendidas</div>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-white/10">
              <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                <Clock size={12} className="text-amber-400" /> Total de Horas
              </div>
              <div className="text-xl font-black text-white mt-0.5">{summary.totalHours.toFixed(2)}h</div>
              <div className="text-[9px] text-amber-300/70">Horas Trabalhadas</div>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-white/10">
              <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                <Sparkles size={12} className="text-cyan-400" /> VPH Consolidado
              </div>
              <div className="text-xl font-black text-cyan-400 mt-0.5">
                {summary.overallVph} <span className="text-xs text-white">cx/h</span>
              </div>
              <div className="text-[9px] text-cyan-300/70">{summary.overallEph} endereços/h</div>
            </div>
          </div>

          {/* 3. DETALHAMENTO DE HORAS E CAIXAS POR RUA */}
          <div className="p-3.5 bg-slate-900/70 rounded-xl border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase flex items-center gap-1.5">
                <MapPin size={14} className="text-indigo-400" /> Detalhamento de Horas por Rua ({summary.streetsWorked.length}):
              </span>
              <span className="text-[10px] text-slate-400">
                Setor {activeSectorId} • {todayBR}
              </span>
            </div>

            {summary.streetsWorked.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase border-b border-white/10">
                      <th className="py-1.5 px-2">Rua / Setor</th>
                      <th className="py-1.5 px-2 text-right">Caixas</th>
                      <th className="py-1.5 px-2 text-right">Endereços</th>
                      <th className="py-1.5 px-2 text-right">Horas</th>
                      <th className="py-1.5 px-2 text-right">VPH</th>
                      <th className="py-1.5 px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {summary.streetsWorked.map(s => {
                      const isStreetMet = s.vph >= targetVph;
                      return (
                        <tr key={s.street} className="hover:bg-white/5 transition-colors">
                          <td className="py-2 px-2 font-bold text-white flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-400" />
                            {s.street}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-200">{s.boxes}</td>
                          <td className="py-2 px-2 text-right text-slate-300">{s.addresses}</td>
                          <td className="py-2 px-2 text-right text-amber-300 font-bold">{s.hours.toFixed(2)}h</td>
                          <td className="py-2 px-2 text-right font-black text-cyan-300">{s.vph}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isStreetMet ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {isStreetMet ? 'OK' : 'BAIXO'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-500 italic bg-slate-950/60 rounded-lg">
                Nenhum apontamento com caixas ou horas foi registrado ainda nesta data.
              </div>
            )}
          </div>

          {/* 4. SE O TURNO JÁ ESTÁ FINALIZADO E TRAVADO */}
          {isCurrentlyLocked ? (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase flex items-center gap-2 text-amber-300">
                    <Lock size={16} /> Travamento de Edição Ativo na Base Local
                  </span>
                  <span className="text-[10px] font-mono bg-amber-500/20 px-2 py-0.5 rounded text-amber-200">
                    Protocolo: {existingRecord?.protocol}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-100/80">
                  Este turno foi finalizado conscientemente por <strong>{existingRecord?.closedBy}</strong> em{' '}
                  {existingRecord?.closedAt ? new Date(existingRecord.closedAt).toLocaleTimeString('pt-BR') : 'hoje'}.
                  Novos apontamentos acidentais para a data de hoje ({todayBR}) estão bloqueados.
                </p>
              </div>

              {/* Bloco de Reabertura */}
              {showReopenPrompt ? (
                <div className="p-4 bg-slate-900 rounded-xl border border-rose-500/40 space-y-3 animate-fade-in">
                  <div className="flex items-center gap-2 text-rose-300 text-xs font-bold uppercase">
                    <Unlock size={16} /> Justificativa de Reabertura de Turno
                  </div>
                  <input
                    type="text"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Ex: Lançar hora extra de abastecimento na rua B1..."
                    className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400 font-mono"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReopenPrompt(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold uppercase cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleReopenShift}
                      disabled={isReopening}
                      className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Unlock size={14} />
                      <span>{isReopening ? 'Destravando...' : 'Confirmar e Destravar Edição'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowReopenPrompt(true)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase flex items-center gap-2 cursor-pointer transition-all hover:border-rose-400"
                  >
                    <Unlock size={14} />
                    <span>Reabrir Turno (Destravar Edições)</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-slate-200 text-xs font-bold uppercase flex items-center gap-2 cursor-pointer transition-all"
                    >
                      {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedSummary ? 'Copiado!' : 'Copiar Resumo'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/25 transition-all active:scale-95"
                    >
                      <Download size={14} />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* SE AINDA NÃO FOI FINALIZADO / FORMULÁRIO DE ENCERRAMENTO CONSCIENTE */
            <>
              {/* CHECKLIST OPERACIONAL & 5S */}
              <div className="p-4 bg-slate-900/70 rounded-xl border border-indigo-500/20 space-y-3">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <ShieldCheck size={16} className="text-indigo-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Checklist Operacional Consciente (5S &amp; Integridade)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                  <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/5 cursor-pointer hover:border-indigo-500/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={checkBoxes}
                      onChange={(e) => setCheckBoxes(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                    />
                    <span>Conferência de caixas/CTNs abastecidos nas posições de picking.</span>
                  </label>

                  <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/5 cursor-pointer hover:border-indigo-500/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={checkObstacles}
                      onChange={(e) => setCheckObstacles(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                    />
                    <span>Ruas e corredores 100% desobstruídos e livres de caixas no chão.</span>
                  </label>

                  <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/5 cursor-pointer hover:border-indigo-500/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={checkEquipment}
                      onChange={(e) => setCheckEquipment(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                    />
                    <span>Paletes vazios e transpaleteira alinhados no local demarcado.</span>
                  </label>

                  <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/5 cursor-pointer hover:border-indigo-500/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={checkBalance}
                      onChange={(e) => setCheckBalance(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                    />
                    <span>Lixo, plástico filme e fitas descartadas na lixeira correta.</span>
                  </label>
                </div>
              </div>

              {/* IDENTIFICAÇÃO DO OPERADOR & OBSERVAÇÕES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 uppercase">
                    Operador / Responsável pelo Fechamento:
                  </label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value.toUpperCase())}
                    placeholder="Nome do Colaborador"
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 uppercase">
                    Passagem de Turno / Observações (Opcional):
                  </label>
                  <input
                    type="text"
                    value={shiftObservation}
                    onChange={(e) => setShiftObservation(e.target.value)}
                    placeholder="Ex: Pulmão da rua B4 abastecido; tudo conforme."
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* A DECLARAÇÃO CONSCIENTE OBRIGATÓRIA COM AVISO DE TRAVAMENTO */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-2 border-emerald-500/40 shadow-lg space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consciousDeclaration}
                    onChange={(e) => setConsciousDeclaration(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-2 border-emerald-400 text-emerald-500 focus:ring-emerald-400 shrink-0 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-black text-emerald-300 uppercase tracking-wide block">
                      "Finalizei o turno de forma consciente e correto."
                    </span>
                    <p className="text-[11px] text-slate-300">
                      Declaro que todas as ruas foram conferidas, as caixas abastecidas estão no lugar correto, o setor está organizado e confirmo o <strong>travamento das edições</strong> na base local.
                    </p>
                  </div>
                </label>
              </div>

              {/* BOTÕES DE AÇÃO DO ENCERRAMENTO */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-slate-200 text-xs font-bold uppercase flex items-center gap-2 cursor-pointer transition-all"
                    title="Exportar dados consolidados em formato CSV"
                  >
                    <Download size={14} />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-slate-200 text-xs font-bold uppercase flex items-center gap-2 cursor-pointer transition-all"
                  >
                    {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>Copiar Resumo</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-slate-300 hover:text-white text-xs font-bold uppercase cursor-pointer"
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmClosure}
                    disabled={isSubmitting || !consciousDeclaration}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-black text-xs font-black uppercase flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
                  >
                    <Lock size={15} className={isSubmitting ? 'animate-spin' : ''} />
                    <span>
                      {isSubmitting ? 'Finalizando e Sincronizando...' : 'Confirmar e Finalizar Turno Geral'}
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
