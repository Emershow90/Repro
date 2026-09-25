/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MODO TV & TORRE DE RASTREAMENTO OPERACIONAL (CD REAPRO)
 * Transmissão em tempo real de qualquer local (IP Interno & IP Externo)
 * Localizador contínuo: "Onde está o Reapro agora", radar de ruas e produtividade.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Tv,
  Wifi,
  Globe,
  Radio,
  Clock,
  MapPin,
  User,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Copy,
  Check,
  QrCode,
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Box,
  Compass,
  Eye,
  Sliders,
  FileSpreadsheet,
  ListChecks
} from 'lucide-react';
import { useTvRadar } from '../hooks/useTvRadar';
import {
  fetchNetworkInfo,
  triggerTelemetrySimulation,
  subscribeToTelemetry,
  NetworkInfo,
  LiveTelemetrySnapshot,
  TelemetryHistoryItem
} from '../services/telemetryService';
import {
  SECTOR_STREET_GROUPS,
  SECTOR_87_STREETS,
  SECTOR_88_STREETS,
  SECTOR_89_STREETS,
  SECTOR_90_STREETS,
  inferSectorFromStreet
} from '../data/streetData';
import Warehouse3DViewer from './Warehouse3DViewer';
import ReplenishmentDetailsModal from './ReplenishmentDetailsModal';

interface TvRadarModuleProps {
  onClose?: () => void;
  isStandalone?: boolean;
}

export const TvRadarModule: React.FC<TvRadarModuleProps> = ({ onClose, isStandalone = false }) => {
  // 0. Modo de Exibição da Tela TV (Planta 3D / Split / Radar 2D)
  const [tvDisplayMode, setTvDisplayMode] = useState<'3D' | 'SPLIT' | 'RADAR_2D'>('3D');
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);

  // 1. Estado da Telemetria, Conexão e Polling em Tempo Real
  const [telemetry, setTelemetry] = useState<LiveTelemetrySnapshot | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'LIVE_SSE' | 'LIVE_POLL' | 'OFFLINE'>('CONNECTING');
  const [lastUpdateTs, setLastUpdateTs] = useState<number>(Date.now());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrType, setQrType] = useState<'internal' | 'external'>('internal');

  // Configurações de Polling e Fluxo Contínuo
  const [pollingRateMs, setPollingRateMs] = useState<number>(2000);
  const [preferPollingOnly, setPreferPollingOnly] = useState<boolean>(false);
  const [packetsReceived, setPacketsReceived] = useState<number>(0);
  const [pulseEffect, setPulseEffect] = useState<boolean>(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);
  const subHandleRef = useRef<{ unsubscribe: () => void; forcePoll: () => Promise<void>; setPollingRate: (ms: number) => void } | null>(null);

  // 2. Estado de Visualização e Filtro de Setores no Radar
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('TODOS');
  const [autoRotateSectors, setAutoRotateSectors] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // 3. Relógio Digital ao Vivo (TV Clock)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 4. Áudio Sintetizado Web Audio API para Alertas da Torre TV
  const playRadarChime = useCallback((type: 'beep' | 'success' | 'alert' = 'beep') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.1); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'alert') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        osc.frequency.setValueAtTime(987.77, now); // B5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Ignora falhas de áudio causadas por restrição de autoplay
    }
  }, [soundEnabled]);

  // 5. Rastreamento e Inscrição em Tempo Real (SSE + Polling Adaptativo)
  const prevStreetRef = useRef<string>('');

  useEffect(() => {
    // Carrega dados de rede (IP Interno & IP Externo)
    fetchNetworkInfo().then(info => {
      if (info) setNetworkInfo(info);
    });

    const handle = subscribeToTelemetry(
      (snapshot) => {
        setTelemetry(snapshot);
        setLastUpdateTs(Date.now());
        setPacketsReceived(prev => prev + 1);
        setPulseEffect(true);
        setTimeout(() => setPulseEffect(false), 600);

        if (snapshot.serverNetwork) {
          setNetworkInfo(snapshot.serverNetwork);
        }

        // Detecta mudança de rua do reapro para tocar o radar chime
        const activeStreet = snapshot.activeReapro?.rua || '';
        if (prevStreetRef.current && activeStreet && activeStreet !== prevStreetRef.current) {
          playRadarChime('success');
        }
        prevStreetRef.current = activeStreet;
      },
      {
        pollingIntervalMs: pollingRateMs,
        preferPolling: preferPollingOnly,
        onModeChange: (mode) => {
          setConnectionStatus(mode === 'SSE' ? 'LIVE_SSE' : 'LIVE_POLL');
        },
        onPulse: () => {
          setPulseEffect(true);
          setTimeout(() => setPulseEffect(false), 400);
        }
      }
    );

    subHandleRef.current = handle;

    return () => {
      handle.unsubscribe();
      subHandleRef.current = null;
    };
  }, [pollingRateMs, preferPollingOnly, playRadarChime]);

  // Força atualização manual imediata
  const handleManualPoll = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    if (subHandleRef.current) {
      await subHandleRef.current.forcePoll();
    }
    playRadarChime('beep');
    setTimeout(() => setIsManualRefreshing(false), 500);
  };

  // Alterna velocidade de polling
  const handleSetPollingSpeed = (speedMs: number) => {
    setPollingRateMs(speedMs);
    if (subHandleRef.current) {
      subHandleRef.current.setPollingRate(speedMs);
    }
  };

  // 6. Rotação Automática de Setores para Telas Passivas de Parede (a cada 15s)
  useEffect(() => {
    if (!autoRotateSectors) return;
    const sectors = ['TODOS', '87', '88', '89', '90'];
    const interval = setInterval(() => {
      setSelectedSectorFilter(prev => {
        const nextIdx = (sectors.indexOf(prev) + 1) % sectors.length;
        return sectors[nextIdx];
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRotateSectors]);

  // 7. Controle de Tela Cheia
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 8. Cópia de Link e URLs
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    });
  };

  // 9. Dados do Reapro Ativo
  const active = telemetry?.activeReapro;
  const isOperating = active && active.status === 'EM_ANDAMENTO';
  const streetCurrent = active?.rua || 'B4VD';
  const sectorCurrent = active?.setor || '87';
  const operatorName = active?.operador || 'EMERSON GONÇALVES';
  const volumeCount = active?.volumes || 0;
  const addressCount = active?.enderecos || 0;
  const demandCount = active?.demanda || 60;
  const vphCurrent = active?.vph || '48.0';
  const ephCurrent = active?.eph || '22.0';
  const currentAction = active?.ultimaAcao || 'Operação ativa no armazém';
  const progressPercent = demandCount > 0 ? Math.min(100, Math.round((volumeCount / demandCount) * 100)) : 0;

  // Formatação do Cronômetro da Rua Atual
  const formattedStopwatch = useMemo(() => {
    const secs = active?.tempoSegundos || 0;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [active?.tempoSegundos]);

  // Consolidados Totais do Reabastecimento (Respondendo: Quanto tempo fez? Quantos endereços geral ou por rua?)
  const tempoTotalGeral = useMemo(() => {
    let secs = active?.tempoSegundos || 0;
    if (active?.tempoTotalGeralSegundos && active.tempoTotalGeralSegundos > secs) {
      secs = active.tempoTotalGeralSegundos;
    } else if (active?.historicoHoje && Array.isArray(active.historicoHoje)) {
      for (const h of active.historicoHoje) {
        secs += h.tempoSegundos || (h.tempoMinutos ? h.tempoMinutos * 60 : Math.round(((h.volumes || 40) / 45) * 3600));
      }
    }
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const totalMinutos = Math.round(secs / 60);
    const formatted = h > 0 ? `${h}h ${m}m` : `${totalMinutos} min`;
    return { secs, h, m, totalMinutos, formatted };
  }, [active?.tempoSegundos, active?.tempoTotalGeralSegundos, active?.historicoHoje]);

  const enderecosTotalGeral = useMemo(() => {
    if (active?.enderecosTotalGeral && active.enderecosTotalGeral > 0) {
      return active.enderecosTotalGeral;
    }
    let total = active?.enderecos || 0;
    if (active?.historicoHoje && Array.isArray(active.historicoHoje)) {
      for (const h of active.historicoHoje) {
        total += h.enderecos || Math.max(1, Math.round((h.volumes || 40) / 2.3));
      }
    }
    return total;
  }, [active?.enderecos, active?.enderecosTotalGeral, active?.historicoHoje]);

  const volumesTotalGeral = useMemo(() => {
    if (active?.volumesTotalGeral && active.volumesTotalGeral > 0) {
      return active.volumesTotalGeral;
    }
    let total = active?.volumes || 0;
    if (active?.historicoHoje && Array.isArray(active.historicoHoje)) {
      for (const h of active.historicoHoje) {
        total += h.volumes || 0;
      }
    }
    return total;
  }, [active?.volumes, active?.volumesTotalGeral, active?.historicoHoje]);

  const tempoMedioPorEnderecoFormatado = useMemo(() => {
    if (enderecosTotalGeral <= 0 || tempoTotalGeral.secs <= 0) return '0m 00s';
    const avgSec = Math.round(tempoTotalGeral.secs / enderecosTotalGeral);
    const m = Math.floor(avgSec / 60);
    const s = avgSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }, [tempoTotalGeral.secs, enderecosTotalGeral]);

  // Lista de Ruas do Armazém com Status Operacional no Radar
  const radarStreets = useMemo(() => {
    const allGroups = SECTOR_STREET_GROUPS;
    const historyList = active?.historicoHoje || [];
    const completedSet = new Set(historyList.map((h: TelemetryHistoryItem) => h.rua.toUpperCase().trim()));

    const list: {
      rua: string;
      setor: string;
      status: 'AQUI_AGORA' | 'CONCLUIDA' | 'PENDENTE' | 'AGUARDANDO';
      demanda: number;
      realizado: number;
      vph?: string;
      eph?: string;
      enderecos?: number;
      tempoSegundos?: number;
      tempoFormatado?: string;
    }[] = [];

    allGroups.forEach(grp => {
      grp.streets.forEach(stName => {
        const isHere = stName.toUpperCase() === streetCurrent.toUpperCase();
        const isDone = completedSet.has(stName.toUpperCase());
        const histItem = historyList.find((h: TelemetryHistoryItem) => h.rua.toUpperCase() === stName.toUpperCase());

        let stStatus: 'AQUI_AGORA' | 'CONCLUIDA' | 'PENDENTE' | 'AGUARDANDO' = 'AGUARDANDO';
        if (isHere) {
          stStatus = 'AQUI_AGORA';
        } else if (isDone) {
          stStatus = 'CONCLUIDA';
        } else if (grp.sectorId === sectorCurrent) {
          stStatus = 'PENDENTE';
        }

        const histEnderecos = histItem?.enderecos || (isDone ? Math.max(1, Math.round((histItem?.volumes || 45) / 2.3)) : 0);
        const histTempoSec = histItem?.tempoSegundos || (histItem?.tempoMinutos ? histItem.tempoMinutos * 60 : (isDone ? 1800 : 0));
        const histTempoMins = Math.round(histTempoSec / 60);

        list.push({
          rua: stName,
          setor: grp.sectorId,
          status: stStatus,
          demanda: isHere ? demandCount : (stStatus === 'CONCLUIDA' ? (histItem?.volumes || 50) : 60),
          realizado: isHere ? volumeCount : (isDone ? (histItem?.volumes || 50) : 0),
          vph: histItem?.vph || (isHere ? vphCurrent : '45.0'),
          eph: histItem?.eph || (isHere ? ephCurrent : '22.0'),
          enderecos: isHere ? addressCount : histEnderecos,
          tempoSegundos: isHere ? (active?.tempoSegundos || 1140) : histTempoSec,
          tempoFormatado: isHere 
            ? `${Math.floor((active?.tempoSegundos || 1140) / 60)} min`
            : (histTempoSec > 0 ? `${histTempoMins} min` : (isDone ? '30 min' : '-'))
        });
      });
    });

    return list;
  }, [streetCurrent, sectorCurrent, demandCount, volumeCount, addressCount, vphCurrent, ephCurrent, active?.tempoSegundos, active?.historicoHoje]);

  // Filtro de Ruas visíveis
  const filteredRadarStreets = useMemo(() => {
    if (selectedSectorFilter === 'TODOS') return radarStreets;
    return radarStreets.filter(r => r.setor === selectedSectorFilter);
  }, [radarStreets, selectedSectorFilter]);

  // Simulação de teste em campo
  const handleSimulate = async () => {
    setIsSimulating(true);
    await triggerTelemetrySimulation();
    playRadarChime('beep');
    setTimeout(() => setIsSimulating(false), 600);
  };

  // Determina URLs de transmissão para exibir na tela
  const internalTvUrl = networkInfo?.tvUrlInternal || `http://localhost:3000/?mode=tv`;
  const externalTvUrl = networkInfo?.tvUrlExternal || (typeof window !== 'undefined' ? `${window.location.origin}/?mode=tv` : '');
  const viewerIp = networkInfo?.clientIp || '127.0.0.1';
  const isViewerInternal = networkInfo?.isClientInternal ?? true;

  return (
    <div
      id="tv-radar-root"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden antialiased"
    >
      {/* -------------------------------------------------------------
          1. BARRA SUPERIOR DA TORRE TV (HEADLINE, CLOCK, REDE E STATUS)
          ------------------------------------------------------------- */}
      <header className="bg-slate-900/90 border-b border-white/10 px-4 py-3 backdrop-blur-md sticky top-0 z-40 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Título & Indicador de Ao Vivo */}
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-center ${
              pulseEffect
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.6)] scale-105'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
            }`}>
              <Tv size={22} className={pulseEffect ? 'animate-bounce' : 'animate-pulse'} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg md:text-xl font-black tracking-wider uppercase text-white font-mono flex items-center gap-2">
                  <span>TORRE DE RASTREAMENTO</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-sans tracking-normal font-bold">
                    MODO TV 5.0
                  </span>
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full transition-all ${
                    pulseEffect ? 'bg-cyan-400 scale-125 shadow-[0_0_10px_#22d3ee]' : 'bg-emerald-400 animate-ping'
                  }`} />
                  <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] font-mono">
                    {connectionStatus === 'LIVE_SSE' ? 'STREAM SSE (TEMPO REAL)' : `POLLING ATIVO (${(pollingRateMs / 1000).toFixed(1)}s)`}
                  </span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-300 font-mono text-[11px] bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                  {packetsReceived} pacotes recebidos
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 text-[11px]">
                  Sem recarregar página
                </span>
              </div>
            </div>
          </div>

          {/* BOX DE TRANSMISSÃO IP (IP INTERNO & IP EXTERNO) */}
          <div className="hidden lg:flex items-center bg-slate-950/80 border border-white/10 rounded-xl p-1.5 px-3 space-x-4 shadow-inner">
            {/* IP Interno (Wi-Fi Galpão) */}
            <div className="flex items-center space-x-2 text-xs">
              <div className="p-1 rounded bg-cyan-500/10 text-cyan-400">
                <Wifi size={14} />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">IP Interno (Wi-Fi)</div>
                <div className="font-mono text-cyan-300 font-bold truncate max-w-[200px]" title={internalTvUrl}>
                  {internalTvUrl.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <button
                id="btn-copy-internal-ip"
                onClick={() => copyToClipboard(internalTvUrl, 'internal')}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                title="Copiar URL de Rede Local"
              >
                {copiedKey === 'internal' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>

            <div className="w-px h-6 bg-white/10" />

            {/* IP Externo / Nuvem */}
            <div className="flex items-center space-x-2 text-xs">
              <div className="p-1 rounded bg-purple-500/10 text-purple-400">
                <Globe size={14} />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">IP Externo / Nuvem</div>
                <div className="font-mono text-purple-300 font-bold truncate max-w-[200px]" title={externalTvUrl}>
                  {externalTvUrl ? externalTvUrl.replace(/^https?:\/\//, '') : 'Detectando...'}
                </div>
              </div>
              <button
                id="btn-copy-external-ip"
                onClick={() => copyToClipboard(externalTvUrl, 'external')}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                title="Copiar Link Remoto / Nuvem"
              >
                {copiedKey === 'external' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>

            {/* Botão de Abrir Modal QR Code */}
            <button
              id="btn-open-qr-modal"
              onClick={() => setShowQrModal(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10 transition-colors"
              title="Exibir QR Code para Celular ou Smart TV"
            >
              <QrCode size={13} />
              <span className="hidden xl:inline">Conectar TV</span>
            </button>
          </div>

          {/* Relógio Digital da Torre e Controles */}
          <div className="flex items-center space-x-3">
            {/* Relógio Gigante */}
            <div className="text-right hidden sm:block bg-slate-950/60 px-3 py-1 rounded-xl border border-white/5">
              <div className="text-xl md:text-2xl font-black font-mono tracking-tight text-white">
                {currentTime.toLocaleTimeString('pt-BR')}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                {currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
              </div>
            </div>

            {/* Botões de Ação da TV */}
            <div className="flex items-center space-x-1.5">
              {/* Seletor de Frequência de Polling Contínuo */}
              <div className="hidden md:flex items-center bg-slate-950/80 p-1 rounded-xl border border-white/10 text-xs font-mono">
                <span className="text-[10px] text-slate-500 uppercase px-1.5 font-bold">Taxa:</span>
                {[1000, 2000, 5000].map(ms => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => handleSetPollingSpeed(ms)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      pollingRateMs === ms
                        ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Atualizar dados automaticamente a cada ${ms / 1000} segundo(s)`}
                  >
                    {ms / 1000}s
                  </button>
                ))}
              </div>

              {/* Botão de Atualização Manual Imediata (Force Poll) */}
              <button
                id="btn-tv-manual-poll"
                type="button"
                onClick={handleManualPoll}
                disabled={isManualRefreshing}
                className="p-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 transition-all cursor-pointer"
                title="Forçar leitura imediata dos coletores agora"
              >
                <RefreshCw size={16} className={isManualRefreshing ? 'animate-spin text-cyan-400' : ''} />
              </button>

              {/* Botão de Detalhamento do Reabastecimento */}
              <button
                id="btn-tv-replenishment-details"
                type="button"
                onClick={() => setShowDetailsModal(true)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold transition-all shadow-[0_0_12px_rgba(16,185,129,0.25)] cursor-pointer"
                title="Abrir Detalhamento Completo do Reabastecimento (Tempo, Endereços e Produtividade)"
              >
                <FileSpreadsheet size={15} />
                <span className="hidden sm:inline">Detalhamento</span>
              </button>

              {/* Botão de Áudio */}
              <button
                id="btn-tv-audio-toggle"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (next) playRadarChime('beep');
                }}
                className={`p-2 rounded-xl border transition-all ${
                  soundEnabled
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
                title={soundEnabled ? 'Alertas Sonoros Ligados' : 'Ligar Alertas Sonoros da Torre'}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>

              {/* Botão de Simulação de Campo (Teste) */}
              <button
                id="btn-tv-simulate"
                onClick={handleSimulate}
                disabled={isSimulating}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition-all active:scale-95 disabled:opacity-50"
                title="Simula o avanço do reapro pelas ruas para testar a tela"
              >
                <RefreshCw size={14} className={isSimulating ? 'animate-spin' : ''} />
                <span className="hidden md:inline">Testar Rastreio</span>
              </button>

              {/* Botão de Tela Cheia */}
              <button
                id="btn-tv-fullscreen"
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
                title={isFullscreen ? 'Sair da Tela Cheia' : 'Modo Tela Cheia (F11)'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              {/* Botão Fechar (se não for standalone) */}
              {onClose && (
                <button
                  id="btn-tv-close"
                  onClick={onClose}
                  className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition-colors"
                >
                  Voltar ao Coletor
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Barra compacta de IP para telas menores */}
        <div className="lg:hidden mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="truncate">
            <span className="text-cyan-400">IP Interno:</span> {internalTvUrl.replace(/^https?:\/\//, '')}
          </div>
          <button
            onClick={() => setShowQrModal(true)}
            className="text-cyan-300 underline text-[11px] ml-2 flex-shrink-0"
          >
            Ver QR Code
          </button>
        </div>
      </header>

      {/* -------------------------------------------------------------
          2. CONTEÚDO PRINCIPAL: PLANTA 3D, COCKPIT DO REAPRO & RADAR
          ------------------------------------------------------------- */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 md:p-6 flex flex-col gap-6">

        {/* ========================================================= */}
        {/* SELETOR DE MODO DE VISUALIZAÇÃO DA TORRE TV */}
        {/* ========================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase font-bold pl-2 hidden sm:inline">Visão TV:</span>
            
            <button
              type="button"
              onClick={() => setTvDisplayMode('3D')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-black uppercase flex items-center space-x-2 transition-all cursor-pointer ${
                tvDisplayMode === '3D'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-[1.02]'
                  : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Layers size={14} />
              <span>1. Planta 3D (Pulmão Alto &amp; Docas)</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                tvDisplayMode === '3D' ? 'bg-black/20 text-black' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                DIGITAL TWIN
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTvDisplayMode('SPLIT')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-black uppercase flex items-center space-x-2 transition-all cursor-pointer ${
                tvDisplayMode === 'SPLIT'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-[1.02]'
                  : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Compass size={14} />
              <span>2. Tela Dividida (3D + Grade 2D)</span>
            </button>

            <button
              type="button"
              onClick={() => setTvDisplayMode('RADAR_2D')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-black uppercase flex items-center space-x-2 transition-all cursor-pointer ${
                tvDisplayMode === 'RADAR_2D'
                  ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-[1.02]'
                  : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Radio size={14} />
              <span>3. Radar 2D Tradicional</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 pr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden md:inline">Transmissão em Tempo Real</span>
          </div>
        </div>

        {/* PLANTA 3D DO ARMAZÉM DIGITAL TWIN (PULMÃO ALTO, PICKING, DOCAS & FLUXOS) */}
        {(tvDisplayMode === '3D' || tvDisplayMode === 'SPLIT') && (
          <Warehouse3DViewer
            streetCurrent={streetCurrent}
            sectorCurrent={sectorCurrent}
            operatorName={operatorName}
            volumeCount={volumeCount}
            demandCount={demandCount}
            vphCurrent={vphCurrent}
            selectedSectorFilter={selectedSectorFilter}
            radarStreets={radarStreets}
            tempoSegundos={active?.tempoSegundos || 1140}
            enderecosCount={addressCount}
            ephCurrent={ephCurrent}
            tempoTotalGeralSegundos={tempoTotalGeral.secs}
            enderecosTotalGeral={enderecosTotalGeral}
            volumesTotalGeral={volumesTotalGeral}
            onOpenDetails={() => setShowDetailsModal(true)}
            onSelectStreet={(st) => setSelectedSectorFilter(inferSectorFromStreet(st))}
          />
        )}

        {/* CARRO-CHEFE: "ONDE ESTÁ O REAPRO AGORA?" (STATUS CONCISO) */}
        <section
          id="reapro-live-hero"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/30 p-5 shadow-lg"
        >
          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Lado Esquerdo: Localização e Status */}
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Operação em Tempo Real
              </span>
              <div className="text-5xl md:text-6xl font-black font-mono text-white tracking-tight">
                {streetCurrent}
                <span className="text-xl text-slate-500 ml-3 font-normal">Setor {sectorCurrent}</span>
              </div>
              <div className="text-sm text-slate-400 flex items-center gap-3 font-mono">
                <span>{operatorName}</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-300">{currentAction}</span>
              </div>
            </div>

            {/* Lado Direito: Grid de Métricas Compacto */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full lg:w-auto">
              {[
                { label: 'TEMPO RUA', val: formattedStopwatch, color: 'text-cyan-300' },
                { label: 'ENDEREÇOS', val: addressCount, color: 'text-white' },
                { label: 'VOLUMES', val: `${volumeCount}/${demandCount}`, color: 'text-emerald-300' },
                { label: 'RITMO (CX/H)', val: vphCurrent, color: 'text-amber-300' },
              ].map(m => (
                <div key={m.label} className="bg-slate-950 p-3 rounded-lg border border-white/5 text-center">
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{m.label}</div>
                  <div className={`text-lg font-black font-mono ${m.color}`}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            3. RADAR VISUAL DO ARMAZÉM (GRADE DE RUAS DOS SETORES)
            ------------------------------------------------------------- */}
        <section className="bg-slate-900/80 rounded-2xl border border-white/10 p-4 md:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2">
              <Compass size={20} className="text-emerald-400" />
              <h2 className="text-base md:text-lg font-bold font-mono tracking-wider uppercase text-white">
                RADAR ESPACIAL DO ARMAZÉM
              </h2>
              <span className="text-xs text-slate-400 hidden sm:inline">
                (Visualização instantânea de todas as ruas)
              </span>
            </div>

            {/* Filtros de Setor e Toggle Auto-Rotate */}
            <div className="flex flex-wrap items-center gap-1.5">
              {['TODOS', '87', '88', '89', '90'].map(sec => (
                <button
                  key={sec}
                  onClick={() => {
                    setSelectedSectorFilter(sec);
                    setAutoRotateSectors(false);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedSectorFilter === sec
                      ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                  }`}
                >
                  {sec === 'TODOS' ? 'VISÃO 360°' : `SETOR ${sec}`}
                </button>
              ))}

              <button
                onClick={() => setAutoRotateSectors(!autoRotateSectors)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all flex items-center gap-1 ${
                  autoRotateSectors
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                }`}
                title="Alterna a exibição dos setores a cada 15 segundos automaticamente"
              >
                <RotateCcw size={12} className={autoRotateSectors ? 'animate-spin' : ''} />
                <span>Auto Giro</span>
              </button>
            </div>
          </div>

          {/* LEGENDA DO RADAR */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 py-1">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 border border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              <span className="text-emerald-300 font-bold">Reapro Ativo Agora</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-cyan-500/40 border border-cyan-400" />
              <span>Concluída Hoje</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/50" />
              <span>Demanda Pendente</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-slate-800 border border-white/10" />
              <span>Aguardando</span>
            </div>
          </div>

          {/* GRID DE CARDS DAS RUAS DO RADAR */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredRadarStreets.map(item => {
              const isCurrent = item.status === 'AQUI_AGORA';
              const isDone = item.status === 'CONCLUIDA';
              const isPending = item.status === 'PENDENTE';

              return (
                <div
                  key={item.rua}
                  className={`relative p-3 rounded-lg border flex flex-col gap-1.5 ${
                    isCurrent
                      ? 'bg-emerald-950 border-emerald-400 shadow-lg ring-1 ring-emerald-500/50'
                      : isDone
                      ? 'bg-cyan-950/20 border-cyan-500/20'
                      : 'bg-slate-900 border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`font-black font-mono ${isCurrent ? 'text-emerald-300' : isDone ? 'text-cyan-300' : 'text-slate-200'}`}>
                      {item.rua}
                    </span>
                    {isCurrent && <span className="text-[9px] font-bold text-emerald-400 animate-pulse uppercase">LIVE</span>}
                  </div>

                  {/* Barra de progresso simplificada */}
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${isCurrent ? 'bg-emerald-400' : isDone ? 'bg-cyan-400' : 'bg-slate-600'}`}
                      style={{ width: `${Math.min(100, Math.round((item.realizado / (item.demanda || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------------------
            4. TRILHA DE RASTREAMENTO DO DIA (HISTÓRICO DE RUAS DO TURNO)
            ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trilha de Deslocamento */}
          <div className="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-white/10 p-4 md:p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <MapPin size={18} className="text-cyan-400" />
                <h3 className="font-mono text-sm md:text-base font-bold uppercase text-white">
                  TRILHA DE DESLOCAMENTO DO REAPRO (HOJE)
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {active?.historicoHoje?.length || 0} ruas concluídas hoje
              </span>
            </div>

            {/* Breadcrumb Steps */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {active?.historicoHoje && active.historicoHoje.length > 0 ? (
                active.historicoHoje.map((h: TelemetryHistoryItem, i: number) => (
                  <React.Fragment key={h.rua + i}>
                    <div className="flex items-center space-x-2 bg-slate-950/80 border border-white/10 px-3 py-2 rounded-xl text-xs font-mono">
                      <CheckCircle2 size={13} className="text-cyan-400" />
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{h.rua}</span>
                          <span className="text-[10px] text-cyan-400 font-normal">
                            ({h.enderecos || Math.max(1, Math.round((h.volumes || 40) / 2.3))} end)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {h.volumes} cx • {h.tempoMinutos || Math.round((h.tempoSegundos || 1800) / 60)} min • {h.horario || 'Turno'}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={13} className="text-slate-600 flex-shrink-0" />
                  </React.Fragment>
                ))
              ) : (
                <div className="text-xs text-slate-400 font-mono italic">
                  Nenhuma rua anterior registrada neste turno. Operação iniciada diretamente na rua {streetCurrent}.
                </div>
              )}

              {/* Ponto Atual */}
              <div className="flex items-center space-x-2 bg-emerald-950/90 border border-emerald-500/60 px-3.5 py-2 rounded-xl text-xs font-mono shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <div>
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <span>{streetCurrent}</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-500 text-slate-950 font-sans font-bold">
                      AGORA
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-400/80">
                    {volumeCount} cx • Em andamento
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quadro de Produtividade Consolidada da Equipe */}
          <div className="bg-slate-900/80 rounded-2xl border border-white/10 p-4 md:p-5 shadow-xl space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
                <TrendingUp size={18} className="text-amber-400" />
                <h3 className="font-mono text-sm md:text-base font-bold uppercase text-white">
                  DESEMPENHO DO TURNO
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/5 space-y-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Total Bipado Hoje</div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {(active?.historicoHoje?.reduce((acc: number, h: TelemetryHistoryItem) => acc + (h.volumes || 0), 0) || 0) + volumeCount}
                    <span className="text-xs text-slate-400 font-normal ml-1">cx</span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/5 space-y-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Média Geral VPH</div>
                  <div className="text-2xl font-black font-mono text-cyan-300">
                    {vphCurrent}
                    <span className="text-xs text-slate-400 font-normal ml-1">cx/h</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Seu IP: <strong className="text-slate-200">{viewerIp}</strong></span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isViewerInternal ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' : 'bg-purple-950 text-purple-400 border border-purple-800'
              }`}>
                {isViewerInternal ? 'Conectado via Wi-Fi Interno' : 'Conectado via Nuvem / Externo'}
              </span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            5. DETALHAMENTO DO REABASTECIMENTO (QUADRO CONSOLIDADO NA TV)
            Respondendo:
            1. Quanto tempo (horas ou minutos) fiz o Reabastecimento?
            2. Quantos endereços geral ou por rua?
            3. Detalhamento do Reabastecimento por rua
            ------------------------------------------------------------- */}
        <section className="bg-slate-900/90 rounded-2xl border border-emerald-500/30 p-5 md:p-6 shadow-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h3 className="font-mono text-base md:text-lg font-black uppercase text-white tracking-wide flex items-center gap-2">
                  <span>DETALHAMENTO DO REABASTECIMENTO</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    CONSOLIDADO
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Visão executiva: tempo acumulado, endereços totais e desempenho por rua do armazém
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDetailsModal(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-mono font-black uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] cursor-pointer"
            >
              <ListChecks size={16} />
              <span>Abrir Raio-X Detalhado Completo</span>
            </button>
          </div>

          {/* Cards Rápidos de Resposta Direta na TV */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-slate-950/80 border border-emerald-500/40 p-4 rounded-xl shadow-inner space-y-1">
              <div className="text-[11px] font-mono uppercase text-emerald-400 flex items-center gap-1.5 font-bold">
                <Clock size={14} />
                <span>1. Quanto Tempo Fez?</span>
              </div>
              <div className="text-3xl font-black font-mono text-white">
                {tempoTotalGeral.formatted}
              </div>
              <div className="text-xs font-mono text-slate-400">
                Total de <strong className="text-emerald-300">{tempoTotalGeral.totalMinutos} minutos</strong> hoje
              </div>
              <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-white/5">
                Rua atual ({streetCurrent}): {formattedStopwatch}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-cyan-500/40 p-4 rounded-xl shadow-inner space-y-1">
              <div className="text-[11px] font-mono uppercase text-cyan-400 flex items-center gap-1.5 font-bold">
                <MapPin size={14} />
                <span>2. Quantos Endereços Geral?</span>
              </div>
              <div className="text-3xl font-black font-mono text-cyan-300">
                {enderecosTotalGeral} <span className="text-sm font-normal text-slate-400">end</span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Endereços reabastecidos no turno
              </div>
              <div className="text-[11px] font-mono text-cyan-400/80 pt-1 border-t border-white/5">
                Rua atual ({streetCurrent}): {addressCount} endereços
              </div>
            </div>

            <div className="bg-slate-950/80 border border-amber-500/40 p-4 rounded-xl shadow-inner space-y-1">
              <div className="text-[11px] font-mono uppercase text-amber-400 flex items-center gap-1.5 font-bold">
                <Box size={14} />
                <span>3. Volumes Realizados</span>
              </div>
              <div className="text-3xl font-black font-mono text-amber-300">
                {volumesTotalGeral} <span className="text-sm font-normal text-slate-400">cx</span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Caixas bipadas e guardadas hoje
              </div>
              <div className="text-[11px] font-mono text-amber-400/80 pt-1 border-t border-white/5">
                Rua atual ({streetCurrent}): {volumeCount} cx
              </div>
            </div>

            <div className="bg-slate-950/80 border border-purple-500/40 p-4 rounded-xl shadow-inner space-y-1">
              <div className="text-[11px] font-mono uppercase text-purple-400 flex items-center gap-1.5 font-bold">
                <Zap size={14} />
                <span>4. Velocidade &amp; Ritmo</span>
              </div>
              <div className="text-2xl font-black font-mono text-purple-200">
                {vphCurrent} <span className="text-xs font-normal text-slate-400">cx/h</span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                {ephCurrent} endereços/hora
              </div>
              <div className="text-[11px] font-mono text-purple-400/80 pt-1 border-t border-white/5">
                Média: {tempoMedioPorEnderecoFormatado} / endereço
              </div>
            </div>
          </div>

          {/* Tabela de Detalhamento por Rua Concluída & Em Andamento */}
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60 shadow-inner">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-white/10 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Rua</th>
                  <th className="py-3 px-4">Setor</th>
                  <th className="py-3 px-4">Tempo Dedicado</th>
                  <th className="py-3 px-4">Endereços</th>
                  <th className="py-3 px-4">Volumes</th>
                  <th className="py-3 px-4">VPH</th>
                  <th className="py-3 px-4">EPH</th>
                  <th className="py-3 px-4">Média / Endereço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {/* Rua Ativa Agora */}
                <tr className="bg-emerald-950/30 hover:bg-emerald-950/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      EM OPERAÇÃO
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-white text-sm">
                    {streetCurrent}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    Setor {sectorCurrent}
                  </td>
                  <td className="py-3 px-4 text-emerald-300 font-bold">
                    {formattedStopwatch} ({Math.round((active?.tempoSegundos || 1140) / 60)} min)
                  </td>
                  <td className="py-3 px-4 text-cyan-300 font-bold">
                    {addressCount} end
                  </td>
                  <td className="py-3 px-4 text-amber-300 font-bold">
                    {volumeCount} / {demandCount} cx
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {vphCurrent} cx/h
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {ephCurrent} end/h
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {addressCount > 0 && (active?.tempoSegundos || 0) > 0
                      ? `${Math.floor(((active?.tempoSegundos || 1140) / addressCount) / 60)}m ${Math.round(((active?.tempoSegundos || 1140) / addressCount) % 60)}s`
                      : '0m 45s'}
                  </td>
                </tr>

                {/* Ruas Anteriores do Turno de Hoje */}
                {active?.historicoHoje && active.historicoHoje.map((h: TelemetryHistoryItem, idx: number) => {
                  const sec = h.tempoSegundos || (h.tempoMinutos ? h.tempoMinutos * 60 : 1800);
                  const min = Math.round(sec / 60);
                  const ends = h.enderecos || Math.max(1, Math.round((h.volumes || 40) / 2.3));
                  const avgPerEnd = ends > 0 ? Math.round(sec / ends) : 0;
                  const avgM = Math.floor(avgPerEnd / 60);
                  const avgS = avgPerEnd % 60;

                  return (
                    <tr key={h.rua + idx} className="hover:bg-white/5 transition-colors text-slate-300">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 text-[10px] font-bold border border-cyan-800">
                          <CheckCircle2 size={11} className="text-cyan-400" />
                          CONCLUÍDA
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {h.rua}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        Setor {h.setor || inferSectorFromStreet(h.rua)}
                      </td>
                      <td className="py-3 px-4 text-slate-200">
                        {min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`} ({h.horario || 'Turno'})
                      </td>
                      <td className="py-3 px-4 text-cyan-300 font-bold">
                        {ends} end
                      </td>
                      <td className="py-3 px-4 text-amber-300 font-bold">
                        {h.volumes} cx
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {h.vph || '48.0'} cx/h
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {h.eph || '22.0'} end/h
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {avgM}m {String(avgS).padStart(2, '0')}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------
          MODAL DE CONECTIVIDADE / QR CODE (PARA TRANSMISSÃO EM SMART TV)
          ------------------------------------------------------------- */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <Tv size={20} className="text-cyan-400" />
                <h3 className="font-mono font-bold text-white text-base uppercase">
                  Conectar Tela ou Smart TV
                </h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            {/* Alternador de Tipo de Rede */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
              <button
                onClick={() => setQrType('internal')}
                className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 ${
                  qrType === 'internal'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wifi size={14} />
                <span>IP Interno (Wi-Fi)</span>
              </button>
              <button
                onClick={() => setQrType('external')}
                className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 ${
                  qrType === 'external'
                    ? 'bg-purple-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Globe size={14} />
                <span>IP Externo / Nuvem</span>
              </button>
            </div>

            {/* Detalhes do Endereço */}
            <div className="text-center space-y-3">
              <p className="text-xs text-slate-300">
                {qrType === 'internal'
                  ? 'Abra este endereço no navegador de qualquer Smart TV, monitor ou tablet conectado no mesmo Wi-Fi do galpão:'
                  : 'Abra este link em qualquer lugar (celular fora do galpão, gerência, filial ou home-office):'}
              </p>

              <div className="p-3 bg-slate-950 rounded-xl border border-white/10 font-mono text-xs text-cyan-300 break-all select-all">
                {qrType === 'internal' ? internalTvUrl : externalTvUrl}
              </div>

              {/* Botão Copiar */}
              <button
                onClick={() => copyToClipboard(qrType === 'internal' ? internalTvUrl : externalTvUrl, 'modal')}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {copiedKey === 'modal' ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span>Link Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copiar Link Completo</span>
                  </>
                )}
              </button>
            </div>

            {/* Dica Operacional para TV */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5 text-[11px] text-slate-400 space-y-1">
              <strong className="text-slate-200 block">💡 Dica para Smart TVs de Parede:</strong>
              <p>
                Pressione <strong>F11</strong> no teclado ou controle da TV para ocultar as barras de navegação e deixar o painel em modo radar full-screen 24/7.
              </p>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHAMENTO DO REABASTECIMENTO (RAIO-X DE RUAS, TEMPO E ENDEREÇOS) */}
      <ReplenishmentDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        telemetryActive={active}
      />
    </div>
  );
};

export default TvRadarModule;
