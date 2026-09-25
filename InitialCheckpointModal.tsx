/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Modal / Painel de Checkpoint de Início do Turno (Abertura Operacional)
 */

import React, { useState, useEffect } from 'react';
import { 
  PackageOpen, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Boxes, 
  User, 
  ShieldCheck, 
  X,
  Sparkles,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { Log } from '../types';
import { formatDateToBR, getDayOfWeekName, getWeekNumber } from '../utils/dateUtils';
import { pdtAudio } from '../utils/pdtAudio';
import { saveAuditLog } from '../services/dbLocal';
import { executeSupabaseBackupNow } from '../services/supabaseBackupService';

interface InitialCheckpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCheckpoint: (log: Log) => Promise<void>;
  activeOperator: string;
  activeSectorId: string;
  existingCheckpointLog?: Log | null;
  onAddToast: (msg: string, color?: string) => void;
  onTriggerSync?: () => Promise<void>;
}

export default function InitialCheckpointModal({
  isOpen,
  onClose,
  onSaveCheckpoint,
  activeOperator,
  activeSectorId,
  existingCheckpointLog,
  onAddToast,
  onTriggerSync
}: InitialCheckpointModalProps) {
  const todayDate = new Date();
  const todayBR = formatDateToBR(todayDate);

  const [operatorName, setOperatorName] = useState(activeOperator || 'EMERSON GONÇALVES');
  const [initialBoxes, setInitialBoxes] = useState<number | ''>('');
  const [targetStreets, setTargetStreets] = useState('B4VD, B3, B2');
  const [initialCages, setInitialCages] = useState<number | ''>('');
  const [openingNotes, setOpeningNotes] = useState('');
  
  // Checklist de abertura
  const [checkEquipments, setCheckEquipments] = useState(true);
  const [checkCorridors, setCheckCorridors] = useState(true);
  const [checkSafety, setCheckSafety] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (activeOperator) {
      setOperatorName(activeOperator);
    }
  }, [activeOperator]);

  // Se já existe um log de checkpoint hoje, pré-carrega
  useEffect(() => {
    if (existingCheckpointLog) {
      if (existingCheckpointLog.colaborador) setOperatorName(existingCheckpointLog.colaborador);
      if (existingCheckpointLog.volumes) setInitialBoxes(existingCheckpointLog.volumes);
      if (existingCheckpointLog.observacoes) setOpeningNotes(existingCheckpointLog.observacoes);
    }
  }, [existingCheckpointLog]);

  if (!isOpen) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(`repro_checkpoint_dismissed_${todayBR}`, 'true');
    } catch (e) {
      console.warn(e);
    }
    onClose();
  };

  const handleConfirmCheckpoint = async () => {
    const boxes = Number(initialBoxes) || 0;
    if (boxes < 0) {
      onAddToast('Informe uma quantidade válida de caixas.', 'var(--color-warning)');
      return;
    }

    setIsSubmitting(true);
    try {
      const checkpointLog: Log = {
        id: Date.now(),
        data: todayBR,
        dia: getDayOfWeekName(todayDate),
        semana: getWeekNumber(todayDate),
        atividade: 'INÍCIO_DIA - CHECKPOINT INICIAL',
        colaborador: operatorName.trim().toUpperCase() || 'OPERADOR REPRO',
        volumes: boxes,
        enderecos: 0,
        horas: 0,
        vph: "0.00",
        tipo: 'indireta',
        setor: activeSectorId || '87',
        synced: false,
        timestamp: Date.now(),
        observacoes: `[CHECKPOINT INÍCIO] Saldo inicial: ${boxes} caixas. Ruas planejadas: ${targetStreets || 'Geral'}. Gaiolas: ${initialCages || 0}. Obs: ${openingNotes.trim() || 'Abertura de turno conforme'}`
      };

      await onSaveCheckpoint(checkpointLog);

      // Auditoria
      await saveAuditLog({
        id: `audit-checkpoint-${Date.now()}`,
        timestamp: Date.now(),
        tipo: 'AUDITORIA_5S',
        setor: activeSectorId || '87',
        rua: targetStreets.split(',')[0]?.trim() || 'GERAL',
        operador: operatorName,
        contexto: {
          ctnPaiBipado: 'CHECKPOINT_INICIAL',
          ctnFilhoBipado: `${boxes} caixas em estoque/fila`,
          artigoEsperado: 'ABERTURA_CONFORME'
        },
        justificativa: `[CHECKPOINT INÍCIO DE TURNO] Saldo inicial de ${boxes} caixas registrado para cruzamento auditorial com o abastecimento do dia.`,
        synced: false
      });

      // Salva flag no storage
      try {
        localStorage.setItem(`repro_checkpoint_done_${todayBR}`, 'true');
        localStorage.setItem(`repro_checkpoint_dismissed_${todayBR}`, 'true');
      } catch (e) {
        console.warn(e);
      }

      // Sincronização em background
      executeSupabaseBackupNow().catch(err => console.warn('Backup Supabase:', err));
      if (onTriggerSync) {
        onTriggerSync().catch(err => console.warn('Sync Sheets:', err));
      }

      pdtAudio.playSuccessChime();
      onAddToast(`Checkpoint de início gravado com sucesso! Saldo inicial de ${boxes} caixas registrado.`, 'var(--color-success)');
      onClose();
    } catch (err: any) {
      onAddToast(`Erro ao gravar checkpoint: ${err?.message || 'Falha'}`, 'var(--color-danger)');
      pdtAudio.playScanError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAlreadyRegistered = Boolean(existingCheckpointLog);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in font-mono">
      <div className="w-full max-w-xl bg-slate-950 border-2 border-emerald-500/50 rounded-2xl shadow-2xl shadow-emerald-950/50 overflow-hidden my-auto">
        
        {/* HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border-b border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-inner">
              <PackageOpen size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  Checkpoint de Início do Turno
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                  Abertura
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/70">
                Registro do saldo inicial em fila/pulmão para auditoria comparativa
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar / Lembrar mais tarde"
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
          
          {isAlreadyRegistered && (
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                Já existe um registro de início hoje: <strong>{existingCheckpointLog?.volumes} caixas</strong> às {new Date(existingCheckpointLog?.timestamp || Date.now()).toLocaleTimeString('pt-BR')}. Você pode atualizar o saldo abaixo se desejar.
              </span>
            </div>
          )}

          {/* Banner Informativo */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs space-y-1.5">
            <span className="font-bold text-white uppercase flex items-center gap-1.5 text-[11px] text-emerald-300">
              <Sparkles size={14} /> Auditoria Operacional REPRO
            </span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              O registro das caixas presentes na fila ou no pulmão no início do expediente permite que a liderança cruze a <strong>demanda inicial</strong> com o total de <strong>volumes reabastecidos</strong> ao final do dia.
            </p>
          </div>

          {/* Dados do Operador e Setor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
                <User size={12} className="text-emerald-400" /> Operador Responsável:
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value.toUpperCase())}
                placeholder="OPERADOR"
                className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white uppercase font-bold focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
                <MapPin size={12} className="text-teal-400" /> Setor Ativo:
              </label>
              <input
                type="text"
                disabled
                value={`Setor ${activeSectorId} • ${todayBR}`}
                className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-400 font-bold"
              />
            </div>
          </div>

          {/* Quantidade Inicial de Caixas & Gaiolas */}
          <div className="p-4 bg-slate-900/80 rounded-xl border border-emerald-500/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-emerald-300 uppercase flex items-center gap-1.5">
                  <Boxes size={14} className="text-emerald-400" /> Caixas em Fila / Pulmão Inicial:
                </label>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={initialBoxes}
                  onChange={(e) => setInitialBoxes(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex: 150 caixas"
                  className="w-full bg-slate-950 border-2 border-emerald-500/40 rounded-xl px-3 py-2.5 text-base font-black text-white focus:outline-none focus:border-emerald-400 font-mono shadow-inner"
                  autoFocus
                />
                <span className="text-[9px] text-slate-400 block">Total de CTNs estimados no início da operação</span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
                  <PackageOpen size={14} className="text-teal-400" /> Gaiolas / Paletes na Fila (Opcional):
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={initialCages}
                  onChange={(e) => setInitialCages(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex: 4 gaiolas"
                  className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-emerald-400 font-mono"
                />
                <span className="text-[9px] text-slate-400 block">Unidades de transporte aguardando</span>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase">
                Ruas Foco / Planejadas para o Turno:
              </label>
              <input
                type="text"
                value={targetStreets}
                onChange={(e) => setTargetStreets(e.target.value.toUpperCase())}
                placeholder="Ex: B4VD, B3, B2..."
                className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Checklist de Condições Iniciais */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-white/10 space-y-2 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" /> Checklist de Abertura do Posto:
            </span>
            <div className="space-y-1.5 text-[11px] text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkEquipments}
                  onChange={(e) => setCheckEquipments(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                />
                <span>PDT com bateria carregada e leitor testado.</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkCorridors}
                  onChange={(e) => setCheckCorridors(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                />
                <span>Corredores de circulação e saídas de emergência desobstruídos.</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkSafety}
                  onChange={(e) => setCheckSafety(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                />
                <span>Uso obrigatório de EPIs e equipamentos de proteção no setor.</span>
              </label>
            </div>
          </div>

          {/* Observações de Abertura */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-300 uppercase">
              Observações Iniciais / Ocorrências do Turno Anterior:
            </label>
            <input
              type="text"
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder="Ex: Pulmão recebido com 3 gaiolas da rua B4 aguardando separação..."
              className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
            />
          </div>

          {/* AÇÕES */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-slate-400 hover:text-white text-xs font-bold uppercase cursor-pointer"
            >
              Pular / Lembrar Mais Tarde
            </button>

            <button
              type="button"
              onClick={handleConfirmCheckpoint}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-black text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
            >
              <CheckCircle2 size={16} />
              <span>{isSubmitting ? 'Gravando...' : 'Registrar Checkpoint de Início'}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
