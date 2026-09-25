/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SISTEMA DE GESTÃO DE METAS E ALERTAS DE PRODUTIVIDADE (VPH)
 * Notificações visuais e sonoras customizáveis para monitoramento em tempo real.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, 
  BellRing, 
  Volume2, 
  VolumeX, 
  Sliders, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown, 
  TrendingUp, 
  Users, 
  ShieldAlert, 
  RefreshCw, 
  Play, 
  Save, 
  Sparkles,
  Zap,
  Gauge
} from 'lucide-react';
import { Log } from '../types';
import { pdtAudio } from '../utils/pdtAudio';
import { formatDateToBR, parseDateString } from '../utils/dateUtils';

export interface VphAlertConfig {
  targetVph: number;
  warningVph: number;
  enableAudioAlert: boolean;
  enableVisualAlert: boolean;
  analysisPeriod: 'hoje' | 'todos';
  minimumHoursThreshold: number; // Mínimo de horas trabalhadas para disparar alerta (evita falsos alertas nos primeiros minutos)
}

const DEFAULT_CONFIG: VphAlertConfig = {
  targetVph: 45,
  warningVph: 30,
  enableAudioAlert: true,
  enableVisualAlert: true,
  analysisPeriod: 'hoje',
  minimumHoursThreshold: 0.25 // 15 minutos de operação antes de avaliar
};

const STORAGE_KEY = 'repro_vph_alert_settings_v1';

interface VphAlertManagementProps {
  logs: Log[];
  selectedDate: string; // YYYY-MM-DD
  activeSectorId: string;
  onAddToast: (msg: string, color?: string) => void;
  onAlertTriggered?: (belowCount: number, names: string[]) => void;
}

export default function VphAlertManagement({
  logs,
  selectedDate,
  activeSectorId,
  onAddToast,
  onAlertTriggered
}: VphAlertManagementProps) {
  // Carregar preferências persistidas do gestor
  const [config, setConfig] = useState<VphAlertConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        }
      } catch (err) {
        console.warn('Erro ao carregar configurações de alerta VPH:', err);
      }
    }
    return DEFAULT_CONFIG;
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>('TODOS');

  // Formata a data para comparar com logs (DD/MM/AAAA)
  const targetDateBR = useMemo(() => {
    const p = parseDateString(selectedDate) || new Date();
    return formatDateToBR(p);
  }, [selectedDate]);

  // Salvar configurações
  const handleSaveConfig = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setHasUnsavedChanges(false);
      onAddToast('Configurações de alerta VPH salvas com sucesso!', 'var(--color-success)');
    } catch (e) {
      onAddToast('Erro ao salvar configurações no navegador.', 'var(--color-danger)');
    }
  };

  // Teste sonoro do alerta
  const handleTestSound = () => {
    setIsPlayingTestSound(true);
    try {
      pdtAudio.playScanWarning();
      setTimeout(() => {
        pdtAudio.playScanWarning();
        setIsPlayingTestSound(false);
      }, 350);
      onAddToast('Alarme sonoro emitido para teste!', 'var(--color-info)');
    } catch {
      setIsPlayingTestSound(false);
    }
  };

  // Filtrar logs com base no período de análise
  const relevantLogs = useMemo(() => {
    if (config.analysisPeriod === 'hoje') {
      return logs.filter(l => l.data === targetDateBR);
    }
    return logs;
  }, [logs, config.analysisPeriod, targetDateBR]);

  // Agregar métricas por colaborador
  const collaboratorStats = useMemo(() => {
    const map = new Map<string, {
      nome: string;
      setor: string;
      volumes: number;
      enderecos: number;
      horas: number;
      atividadesCount: number;
      ultimaAtividade: string;
    }>();

    for (const log of relevantLogs) {
      const op = (log.colaborador || 'NÃO IDENTIFICADO').trim().toUpperCase();
      if (!op || op === 'NÃO IDENTIFICADO') continue;

      const current = map.get(op) || {
        nome: op,
        setor: log.setor || activeSectorId,
        volumes: 0,
        enderecos: 0,
        horas: 0,
        atividadesCount: 0,
        ultimaAtividade: log.atividade || 'Reabastecimento'
      };

      current.volumes += Number(log.volumes) || 0;
      current.enderecos += Number(log.enderecos) || 0;
      current.horas += Number(log.horas) || 0;
      current.atividadesCount += 1;
      current.ultimaAtividade = log.atividade || current.ultimaAtividade;

      map.set(op, current);
    }

    const list = Array.from(map.values()).map(item => {
      const vph = item.horas > 0 ? item.volumes / item.horas : 0;
      const roundedVph = Number(vph.toFixed(1));
      
      let status: 'meta' | 'atencao' | 'critico' | 'iniciando' = 'meta';

      if (item.horas < config.minimumHoursThreshold) {
        status = 'iniciando';
      } else if (roundedVph >= config.targetVph) {
        status = 'meta';
      } else if (roundedVph >= config.warningVph) {
        status = 'atencao';
      } else {
        status = 'critico';
      }

      return {
        ...item,
        vph: roundedVph,
        status,
        percentMeta: config.targetVph > 0 ? Math.min(200, Math.round((roundedVph / config.targetVph) * 100)) : 0
      };
    });

    // Ordenar: críticos primeiro, depois atenção, depois meta
    const statusOrder: Record<string, number> = { critico: 0, atencao: 1, iniciando: 2, meta: 3 };
    return list.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.vph - b.vph;
    });
  }, [relevantLogs, config.targetVph, config.warningVph, config.minimumHoursThreshold, activeSectorId]);

  // Contadores de status
  const criticalCount = useMemo(() => collaboratorStats.filter(c => c.status === 'critico').length, [collaboratorStats]);
  const warningCount = useMemo(() => collaboratorStats.filter(c => c.status === 'atencao').length, [collaboratorStats]);
  const targetMetCount = useMemo(() => collaboratorStats.filter(c => c.status === 'meta').length, [collaboratorStats]);

  // Disparo de notificação quando detectado colaboradores críticos
  useEffect(() => {
    if (criticalCount > 0 && config.enableVisualAlert) {
      const names = collaboratorStats.filter(c => c.status === 'critico').map(c => c.nome);
      if (onAlertTriggered) {
        onAlertTriggered(criticalCount, names);
      }
    }
  }, [criticalCount, config.enableVisualAlert, collaboratorStats, onAlertTriggered]);

  // Lista filtrada para exibição
  const displayedCollaborators = useMemo(() => {
    if (collaboratorFilter === 'CRITICO') return collaboratorStats.filter(c => c.status === 'critico');
    if (collaboratorFilter === 'ATENCAO') return collaboratorStats.filter(c => c.status === 'atencao');
    if (collaboratorFilter === 'META') return collaboratorStats.filter(c => c.status === 'meta');
    return collaboratorStats;
  }, [collaboratorStats, collaboratorFilter]);

  return (
    <div className="space-y-5 font-mono">
      
      {/* BANNER VISUAL DE ALERTA CRÍTICO ATIVO */}
      {config.enableVisualAlert && criticalCount > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border-2 border-rose-500/60 shadow-xl shadow-rose-950/40 relative overflow-hidden animate-pulse">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/30 text-rose-300 border border-rose-500/50">
                <ShieldAlert size={24} className="animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-rose-300 tracking-wider">
                    Alerta de Produtividade Abaixo da Meta
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-black">
                    {criticalCount} {criticalCount === 1 ? 'COLABORADOR' : 'COLABORADORES'}
                  </span>
                </div>
                <p className="text-[0.7rem] text-rose-200/90 mt-0.5">
                  Operando abaixo do limite crítico estipulado de <strong>{config.warningVph} VPH</strong> (Meta: <strong>{config.targetVph} VPH</strong>).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {config.enableAudioAlert && (
                <button
                  type="button"
                  onClick={handleTestSound}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Volume2 size={14} />
                  <span>Testar Alarme</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE CONFIGURAÇÕES DOS LIMITES */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-white/10 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Parâmetros de Produtividade &amp; Alertas VPH</span>
                {hasUnsavedChanges && (
                  <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Não Salvo
                  </span>
                )}
              </h2>
              <p className="text-[0.65rem] text-slate-400">
                Defina os gatilhos para alertas sonoros e indicadores luminosos no painel de gestão.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveConfig}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 transition-transform active:scale-95"
            >
              <Save size={14} />
              <span>Salvar Limites</span>
            </button>
          </div>
        </div>

        {/* CONTROLES INTERATIVOS DE SLIDER & INPUT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Meta Alvo Desejada (Target VPH) */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <TrendingUp size={14} />
                </div>
                <span className="text-xs font-black text-white uppercase">Meta Alvo Esperada</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="10"
                  max="150"
                  step="1"
                  value={config.targetVph}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(150, Number(e.target.value) || 10));
                    setConfig(prev => ({ ...prev, targetVph: val }));
                    setHasUnsavedChanges(true);
                  }}
                  className="w-16 px-2 py-1 bg-black border border-emerald-500/40 rounded-lg text-emerald-400 font-bold text-center text-sm font-mono focus:outline-none focus:border-emerald-400"
                />
                <span className="text-[10px] text-slate-400 font-bold">VPH</span>
              </div>
            </div>

            <p className="text-[0.62rem] text-slate-400 leading-snug">
              Produtividade padrão esperada por hora trabalhada para a equipe de reabastecimento.
            </p>

            {/* Slider */}
            <div className="space-y-1 pt-1">
              <input
                type="range"
                min="20"
                max="100"
                step="1"
                value={config.targetVph}
                onChange={(e) => {
                  setConfig(prev => ({ ...prev, targetVph: Number(e.target.value) }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-bold">
                <span>20 VPH</span>
                <span>50 VPH</span>
                <span>100 VPH</span>
              </div>
            </div>
          </div>

          {/* 2. Limite Crítico de Alerta (Warning VPH) */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                  <TrendingDown size={14} />
                </div>
                <span className="text-xs font-black text-white uppercase">Limite Crítico de Alerta</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="1"
                  value={config.warningVph}
                  onChange={(e) => {
                    const val = Math.max(5, Math.min(config.targetVph - 1, Number(e.target.value) || 5));
                    setConfig(prev => ({ ...prev, warningVph: val }));
                    setHasUnsavedChanges(true);
                  }}
                  className="w-16 px-2 py-1 bg-black border border-rose-500/40 rounded-lg text-rose-400 font-bold text-center text-sm font-mono focus:outline-none focus:border-rose-400"
                />
                <span className="text-[10px] text-slate-400 font-bold">VPH</span>
              </div>
            </div>

            <p className="text-[0.62rem] text-slate-400 leading-snug">
              Dispara alerta vermelho luminoso e aviso sonoro se o colaborador estiver abaixo deste valor.
            </p>

            {/* Slider */}
            <div className="space-y-1 pt-1">
              <input
                type="range"
                min="10"
                max={Math.max(15, config.targetVph - 1)}
                step="1"
                value={config.warningVph}
                onChange={(e) => {
                  setConfig(prev => ({ ...prev, warningVph: Number(e.target.value) }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-bold">
                <span>10 VPH</span>
                <span>{Math.round(config.targetVph / 2)} VPH</span>
                <span>{config.targetVph - 1} VPH</span>
              </div>
            </div>
          </div>
        </div>

        {/* TOGGLES DE SOM E VISUAL */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Toggle Visual */}
          <div 
            onClick={() => {
              setConfig(prev => ({ ...prev, enableVisualAlert: !prev.enableVisualAlert }));
              setHasUnsavedChanges(true);
            }}
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
              config.enableVisualAlert
                ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-md'
                : 'bg-slate-900 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <BellRing size={16} className={config.enableVisualAlert ? 'text-amber-400 animate-pulse' : 'text-slate-500'} />
              <div>
                <div className="text-xs font-black uppercase">Alerta Visual</div>
                <div className="text-[9px] text-slate-400">Banners &amp; Destaques</div>
              </div>
            </div>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
              config.enableVisualAlert ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'
            }`}>
              {config.enableVisualAlert ? 'ATIVO' : 'DESLIGADO'}
            </span>
          </div>

          {/* Toggle Áudio */}
          <div 
            onClick={() => {
              setConfig(prev => ({ ...prev, enableAudioAlert: !prev.enableAudioAlert }));
              setHasUnsavedChanges(true);
            }}
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
              config.enableAudioAlert
                ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-md'
                : 'bg-slate-900 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Volume2 size={16} className={config.enableAudioAlert ? 'text-cyan-400' : 'text-slate-500'} />
              <div>
                <div className="text-xs font-black uppercase">Alerta Sonoro</div>
                <div className="text-[9px] text-slate-400">Beeps Industriais</div>
              </div>
            </div>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
              config.enableAudioAlert ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-500'
            }`}>
              {config.enableAudioAlert ? 'ATIVO' : 'DESLIGADO'}
            </span>
          </div>

          {/* Período de Análise */}
          <div className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black uppercase text-white">Escopo Temporal</div>
              <div className="text-[9px] text-slate-400">Base para o cálculo</div>
            </div>
            <div className="flex items-center gap-1 bg-black p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setConfig(prev => ({ ...prev, analysisPeriod: 'hoje' }));
                  setHasUnsavedChanges(true);
                }}
                className={`px-2 py-1 rounded text-[10px] font-black uppercase transition-colors cursor-pointer ${
                  config.analysisPeriod === 'hoje' ? 'bg-emerald-500 text-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfig(prev => ({ ...prev, analysisPeriod: 'todos' }));
                  setHasUnsavedChanges(true);
                }}
                className={`px-2 py-1 rounded text-[10px] font-black uppercase transition-colors cursor-pointer ${
                  config.analysisPeriod === 'todos' ? 'bg-emerald-500 text-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Geral
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD DE MONITORAMENTO DOS COLABORADORES */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
              <Users size={16} className="text-cyan-400" />
              <span>Painel de Produtividade em Tempo Real ({collaboratorStats.length} Operadores)</span>
            </h3>
            <p className="text-[0.65rem] text-slate-400 mt-0.5">
              Classificação por conformidade com a meta de <strong>{config.targetVph} VPH</strong>
            </p>
          </div>

          {/* Filtros rápidos de visualização */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setCollaboratorFilter('TODOS')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                collaboratorFilter === 'TODOS' ? 'bg-white/20 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({collaboratorStats.length})
            </button>
            <button
              type="button"
              onClick={() => setCollaboratorFilter('CRITICO')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                collaboratorFilter === 'CRITICO' ? 'bg-rose-500 text-black font-black' : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
              }`}
            >
              Crítico ({criticalCount})
            </button>
            <button
              type="button"
              onClick={() => setCollaboratorFilter('ATENCAO')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                collaboratorFilter === 'ATENCAO' ? 'bg-amber-500 text-black font-black' : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              Atenção ({warningCount})
            </button>
            <button
              type="button"
              onClick={() => setCollaboratorFilter('META')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                collaboratorFilter === 'META' ? 'bg-emerald-500 text-black font-black' : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              Na Meta ({targetMetCount})
            </button>
          </div>
        </div>

        {/* LISTA / GRID DE COLABORADORES */}
        {displayedCollaborators.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs rounded-xl bg-slate-900/50 border border-white/5 space-y-2">
            <Users size={28} className="mx-auto text-slate-600" />
            <p>Nenhum colaborador encontrado para o filtro selecionado no período.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedCollaborators.map((colab) => {
              const isCritico = colab.status === 'critico';
              const isAtencao = colab.status === 'atencao';
              const isMeta = colab.status === 'meta';

              return (
                <div
                  key={colab.nome}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                    isCritico
                      ? 'bg-rose-950/30 border-rose-500/60 shadow-lg shadow-rose-950/20 ring-1 ring-rose-500/40'
                      : isAtencao
                      ? 'bg-amber-950/25 border-amber-500/50 shadow-md'
                      : 'bg-slate-900/80 border-emerald-500/30'
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-white uppercase truncate">
                        {colab.nome}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>Setor {colab.setor}</span>
                        <span>•</span>
                        <span>{colab.horas.toFixed(2)}h apontadas</span>
                      </div>
                    </div>

                    {/* Badge do Status */}
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${
                      isCritico
                        ? 'bg-rose-500 text-black animate-pulse font-black'
                        : isAtencao
                        ? 'bg-amber-500 text-black'
                        : colab.status === 'iniciando'
                        ? 'bg-slate-700 text-slate-300'
                        : 'bg-emerald-500 text-black'
                    }`}>
                      {isCritico ? 'Abaixo da Meta' : isAtencao ? 'Atenção' : colab.status === 'iniciando' ? 'Iniciando' : 'Na Meta'}
                    </span>
                  </div>

                  {/* VPH e Volumes */}
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 rounded-lg border border-white/5 text-center">
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold">VPH Atual</div>
                      <div className={`text-base font-black ${
                        isCritico ? 'text-rose-400' : isAtencao ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {colab.vph}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold">Volumes</div>
                      <div className="text-base font-black text-white">
                        {colab.volumes} cx
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso Visual em Relação à Meta */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                      <span className="text-slate-400">Progresso vs Meta ({config.targetVph} cx/h):</span>
                      <span className={isCritico ? 'text-rose-400' : isAtencao ? 'text-amber-400' : 'text-emerald-400'}>
                        {colab.percentMeta}%
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCritico
                            ? 'bg-rose-500'
                            : isAtencao
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, colab.percentMeta)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
