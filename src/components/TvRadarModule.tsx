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
  Sliders
} from 'lucide-react';
import {
  subscribeToTelemetry,
  fetchNetworkInfo,
  triggerTelemetrySimulation,
  LiveTelemetrySnapshot,
  NetworkInfo,
  TelemetryPayload
} from '../services/telemetryService';
import {
  SECTOR_STREET_GROUPS,
  SECTOR_87_STREETS,
  SECTOR_88_STREETS,
  SECTOR_89_STREETS,
  SECTOR_90_STREETS
} from '../data/streetData';

interface TvRadarModuleProps {
  onClose?: () => void;
  isStandalone?: boolean;
}

export const TvRadarModule: React.FC<TvRadarModuleProps> = ({ onClose, isStandalone = false }) => {
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

  // Lista de Ruas do Armazém com Status Operacional no Radar
  const radarStreets = useMemo(() => {
    const allGroups = SECTOR_STREET_GROUPS;
    const historyList = active?.historicoHoje || [];
    const completedSet = new Set(historyList.map(h => h.rua.toUpperCase().trim()));

    const list: {
      rua: string;
      setor: string;
      status: 'AQUI_AGORA' | 'CONCLUIDA' | 'PENDENTE' | 'AGUARDANDO';
      demanda: number;
      realizado: number;
      vph?: string;
    }[] = [];

    allGroups.forEach(grp => {
      grp.streets.forEach(stName => {
        const isHere = stName.toUpperCase() === streetCurrent.toUpperCase();
        const isDone = completedSet.has(stName.toUpperCase());
        const histItem = historyList.find(h => h.rua.toUpperCase() === stName.toUpperCase());

        let stStatus: 'AQUI_AGORA' | 'CONCLUIDA' | 'PENDENTE' | 'AGUARDANDO' = 'AGUARDANDO';
        if (isHere) {
          stStatus = 'AQUI_AGORA';
        } else if (isDone) {
          stStatus = 'CONCLUIDA';
        } else if (grp.sectorId === sectorCurrent) {
          stStatus = 'PENDENTE';
        }

        list.push({
          rua: stName,
          setor: grp.sectorId,
          status: stStatus,
          demanda: isHere ? demandCount : (stStatus === 'CONCLUIDA' ? (histItem?.volumes || 50) : 60),
          realizado: isHere ? volumeCount : (isDone ? (histItem?.volumes || 50) : 0),
          vph: histItem?.vph
        });
      });
    });

    return list;
  }, [streetCurrent, sectorCurrent, demandCount, volumeCount, active?.historicoHoje]);

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
          2. CONTEÚDO PRINCIPAL: COCKPIT DO REAPRO + RADAR DE RUAS
          ------------------------------------------------------------- */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 md:p-6 flex flex-col gap-6">
        {/* CARRO-CHEFE: "ONDE ESTÁ O REAPRO AGORA?" (LOCALIZAÇÃO EXATA) */}
        <section
          id="reapro-live-hero"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border-2 border-emerald-500/40 p-5 md:p-8 shadow-[0_0_50px_rgba(16,185,129,0.15)]"
        >
          {/* Efeito de radar no fundo do card */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full border border-emerald-500/10 pointer-events-none animate-ping duration-1000" />
          <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none text-emerald-400">
            <Radio size={360} />
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Lado Esquerdo: Localização Exata e Operador */}
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-black tracking-wider uppercase shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  ONDE ESTÁ O REAPRO AGORA
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-white/10 text-xs font-mono">
                  DISPOSITIVO: {active?.deviceId || 'ZEBRA-01'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-mono">
                  IP: {active?.clientIp || '192.168.1.104'} ({active?.isInternalIp ? 'Rede Interna' : 'Externo'})
                </span>
              </div>

              {/* RUA E SETOR EM DESTAQUE GIGANTE */}
              <div className="flex flex-wrap items-baseline gap-4">
                <div className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white font-mono flex items-center gap-3">
                  <span className="text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                    {streetCurrent}
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-300 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-slate-800 border border-white/10 font-mono text-cyan-300">
                    SETOR {sectorCurrent}
                  </span>
                  <span className="text-slate-400 font-normal text-sm sm:text-base">
                    ({sectorCurrent === '87' ? 'Solo' : 'Volumosos'})
                  </span>
                </div>
              </div>

              {/* Nome do Colaborador e Última Ação */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-slate-300">
                <div className="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                  <User size={16} className="text-cyan-400" />
                  <span className="font-semibold text-white tracking-wide">{operatorName}</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-emerald-300/90 font-mono bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-900/50">
                  <Radio size={13} className="animate-pulse" />
                  <span>{currentAction}</span>
                </div>
              </div>
            </div>

            {/* Lado Direito: Cronômetro da Rua, Progresso e Tacômetro */}
            <div className="w-full lg:w-auto flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-4 border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-8">
              {/* Cronômetro Decorrido na Rua Atual */}
              <div className="flex items-center justify-between sm:justify-start lg:justify-end gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Clock size={24} className="animate-spin" style={{ animationDuration: '60s' }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
                    Tempo na Rua Atual
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-300 tracking-wider">
                    {formattedStopwatch}
                  </div>
                </div>
              </div>

              {/* Progresso de Caixas da Rua Atual */}
              <div className="bg-slate-950/80 border border-white/10 p-3.5 rounded-xl min-w-[260px] space-y-2 shadow-inner">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400">Meta da Rua:</span>
                  <span className="font-bold text-white">
                    <strong className="text-emerald-400 text-base">{volumeCount}</strong> / {demandCount} cx
                  </span>
                </div>
                {/* Barra de Progresso */}
                <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-emerald-300 transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-slate-400">
                  <span>{progressPercent}% Concluído</span>
                  <span className="text-cyan-300">{addressCount} endereços visitados</span>
                </div>
              </div>

              {/* Tacômetro de VPH / Ritmo de Reabastecimento */}
              <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                <Zap size={18} className="text-amber-400" />
                <div className="text-xs">
                  <span className="text-slate-400">Ritmo Atual: </span>
                  <strong className="text-amber-300 font-mono text-sm">{vphCurrent} cx/h</strong>
                  <span className="text-slate-500 mx-1.5">•</span>
                  <span className="text-slate-400">EPH: </span>
                  <strong className="text-cyan-300 font-mono text-sm">{ephCurrent} end/h</strong>
                </div>
              </div>
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
                  className={`relative p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-emerald-950/80 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/50 scale-[1.02] z-10'
                      : isDone
                      ? 'bg-cyan-950/30 border-cyan-500/40 text-slate-200'
                      : isPending
                      ? 'bg-amber-950/20 border-amber-500/30 text-slate-300'
                      : 'bg-slate-950/50 border-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {/* Radar Wave Ping se for a rua atual */}
                  {isCurrent && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border border-white" />
                    </span>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                      SETOR {item.setor}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wide animate-pulse">
                        AO VIVO
                      </span>
                    )}
                    {isDone && <CheckCircle2 size={14} className="text-cyan-400" />}
                  </div>

                  <div className="my-2">
                    <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                      isCurrent ? 'text-emerald-300' : isDone ? 'text-cyan-200' : 'text-white'
                    }`}>
                      {item.rua}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between mt-1">
                      <span>{isCurrent ? 'Bipando:' : isDone ? 'Atendida:' : 'Demanda:'}</span>
                      <strong className={isCurrent ? 'text-emerald-400' : isDone ? 'text-cyan-300' : 'text-slate-300'}>
                        {item.realizado} / {item.demanda} cx
                      </strong>
                    </div>
                  </div>

                  {/* Barra de progresso individual da rua */}
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${
                        isCurrent
                          ? 'bg-emerald-400'
                          : isDone
                          ? 'bg-cyan-400'
                          : 'bg-amber-400/50'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((item.realizado / (item.demanda || 1)) * 100))}%`
                      }}
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
                active.historicoHoje.map((h, i) => (
                  <React.Fragment key={h.rua + i}>
                    <div className="flex items-center space-x-2 bg-slate-950/80 border border-white/10 px-3 py-2 rounded-xl text-xs font-mono">
                      <CheckCircle2 size={13} className="text-cyan-400" />
                      <div>
                        <div className="font-bold text-white">{h.rua}</div>
                        <div className="text-[10px] text-slate-400">
                          {h.volumes} cx • {h.horario || 'Turno'}
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
                    {(active?.historicoHoje?.reduce((acc, h) => acc + (h.volumes || 0), 0) || 0) + volumeCount}
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
    </div>
  );
};

export default TvRadarModule;
