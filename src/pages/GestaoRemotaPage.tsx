/**
 * GestaoRemotaPage.tsx
 * Página autônoma de Gestão Remota — rota /gestao
 *
 * Totalmente independente do IndexedDB local do coletor.
 * Alimentada exclusivamente pelo Supabase Realtime (WebSocket).
 * Pode ser acessada de qualquer dispositivo, IP ou rede autorizada.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Activity, Wifi, WifiOff, RefreshCw, MapPin, Package,
  Clock, User, Zap, AlertTriangle, CheckCircle2, Radio,
  BarChart3, TrendingUp, Eye, LogIn, Terminal, Database
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RemoteEvent {
  id: string;
  timestamp: number;
  tipo: string;
  session_id?: string;
  setor?: string;
  rua?: string;
  colaborador?: string;
  endereco?: string;
  status?: string;
  enderecos_delta?: number;
  volumes_delta?: number;
  justification?: string;
  ml_data?: {
    artigo?: string;
    quantidade?: number;
    timeElapsedSeconds?: number;
    vphEstimado?: number;
  };
  created_at?: string;
}

interface OperatorSummary {
  colaborador: string;
  enderecos: number;
  volumes: number;
  lastSeen: number;
  ruaAtual?: string;
  setorAtual?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  return `${Math.floor(minutes / 60)}h atrás`;
}

function tipoLabel(tipo: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    INICIAR_TAREFA:        { label: 'Iniciou Rua',        color: '#60a5fa' },
    ENDERECO_CONCLUIDO:    { label: 'Endereço Concluído', color: '#34d399' },
    VALIDACAO_QUANTIDADE:  { label: 'Divergência Qtd.',   color: '#fbbf24' },
    TEMPO_RUA_ML:          { label: 'ML — Tempo Rua',     color: '#a78bfa' },
    FINALIZACAO:           { label: 'Rua Finalizada',      color: '#f472b6' },
    PAUSA:                 { label: 'Pausa',               color: '#94a3b8' },
    RETOMADA:              { label: 'Retomada',            color: '#60a5fa' },
    DESFAZER:              { label: 'Desfez Ação',         color: '#f87171' },
  };
  return map[tipo] ?? { label: tipo, color: '#94a3b8' };
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function GestaoRemotaPage() {
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<RemoteEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [tick, setTick] = useState(0);

  // Config inline (para não depender de localStorage do operador)
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
  const channelRef = useRef<any>(null);

  // ── Inicializa Supabase + busca histórico + assina realtime ──────────────
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      setError('Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas.');
      setIsLoading(false);
      return;
    }

    const client = createClient(supabaseUrl, supabaseKey);
    setSupabaseClient(client);

    // 1. Buscar últimos 200 eventos do dia de hoje
    async function fetchInitial() {
      setIsLoading(true);
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data, error: fetchError } = await client
          .from('operational_events')
          .select('*')
          .gte('timestamp', todayStart.getTime())
          .order('timestamp', { ascending: false })
          .limit(200);

        if (fetchError) throw fetchError;
        setEvents((data || []) as RemoteEvent[]);
      } catch (err: any) {
        setError(`Erro ao buscar eventos: ${err?.message || err}`);
      } finally {
        setIsLoading(false);
      }
    }

    fetchInitial();

    // 2. Assinar Realtime — push imediato de novos eventos
    const channel = client
      .channel('gestao-remota-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'operational_events' },
        (payload) => {
          const newEvent = payload.new as RemoteEvent;
          setEvents(prev => [newEvent, ...prev].slice(0, 500)); // cap 500
          setLastUpdate(Date.now());
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'operational_events' },
        (payload) => {
          const updated = payload.new as RemoteEvent;
          setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
          setLastUpdate(Date.now());
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      client.removeChannel(channel);
      setIsConnected(false);
    };
  }, [supabaseUrl, supabaseKey]);

  // Relógio de 1s para "x segundos atrás"
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Métricas derivadas ────────────────────────────────────────────────────

  const todayEvents = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return events.filter(e => e.timestamp >= todayStart.getTime());
  }, [events]);

  const operatorSummaries = useMemo((): OperatorSummary[] => {
    const map: Record<string, OperatorSummary> = {};
    for (const e of todayEvents) {
      if (!e.colaborador) continue;
      if (!map[e.colaborador]) {
        map[e.colaborador] = { colaborador: e.colaborador, enderecos: 0, volumes: 0, lastSeen: 0 };
      }
      const s = map[e.colaborador];
      s.enderecos += e.enderecos_delta || 0;
      s.volumes   += e.volumes_delta   || 0;
      if (e.timestamp > s.lastSeen) {
        s.lastSeen    = e.timestamp;
        s.ruaAtual    = e.rua;
        s.setorAtual  = e.setor;
      }
    }
    return Object.values(map).sort((a, b) => b.lastSeen - a.lastSeen);
  }, [todayEvents]);

  const totalVolumes   = useMemo(() => todayEvents.reduce((a, e) => a + (e.volumes_delta   || 0), 0), [todayEvents]);
  const totalEnderecos = useMemo(() => todayEvents.reduce((a, e) => a + (e.enderecos_delta || 0), 0), [todayEvents]);
  const divergencias   = useMemo(() => todayEvents.filter(e => e.tipo === 'VALIDACAO_QUANTIDADE').length, [todayEvents]);
  const activeOperators = useMemo(() => {
    const cutoff = Date.now() - 15 * 60 * 1000; // ativos nos últimos 15min
    return operatorSummaries.filter(o => o.lastSeen > cutoff).length;
  }, [operatorSummaries, tick]);

  const handleRefresh = useCallback(async () => {
    if (!supabaseClient) return;
    setIsLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabaseClient
        .from('operational_events')
        .select('*')
        .gte('timestamp', todayStart.getTime())
        .order('timestamp', { ascending: false })
        .limit(200);
      setEvents((data || []) as RemoteEvent[]);
      setLastUpdate(Date.now());
    } finally {
      setIsLoading(false);
    }
  }, [supabaseClient]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!supabaseUrl || !supabaseKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="max-w-md w-full border border-rose-500/40 bg-rose-500/10 rounded-2xl p-8 text-center space-y-4">
          <AlertTriangle className="mx-auto text-rose-400" size={40} />
          <h1 className="text-xl font-bold text-rose-300 font-mono">Configuração Incompleta</h1>
          <p className="text-slate-400 text-sm">
            As variáveis <code className="text-rose-300">VITE_SUPABASE_URL</code> e{' '}
            <code className="text-rose-300">VITE_SUPABASE_ANON_KEY</code> não estão definidas.
            Configure-as no arquivo <code>.env</code> e reinicie o servidor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">

      {/* ── PARALLAX ORBS ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-80 h-80 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── HEADER ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/60" />
              <h1 className="text-2xl font-black tracking-widest uppercase font-mono text-white">
                GESTÃO <span className="text-emerald-400 font-normal text-base opacity-80">// Monitoramento Remoto</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-mono tracking-wider pl-5">
              Independente do dispositivo do operador — qualquer IP autorizado
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Realtime badge */}
            <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${
              isConnected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {isConnected ? 'REALTIME ATIVO' : 'CONECTANDO...'}
            </span>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin text-emerald-400' : 'text-slate-400'} />
            </button>

            {/* Link de volta */}
            <a
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all"
            >
              <Terminal size={11} />
              Terminal
            </a>
          </div>
        </header>

        {/* ── ERRO ── */}
        {error && (
          <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm flex items-center gap-3">
            <AlertTriangle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Operadores Ativos', value: activeOperators, icon: <User size={18} />, color: 'emerald', sub: 'últimos 15 min' },
            { label: 'Volumes Hoje',      value: totalVolumes,     icon: <Package size={18} />, color: 'blue',    sub: 'total realizado' },
            { label: 'Endereços Hoje',   value: totalEnderecos,   icon: <MapPin size={18} />, color: 'purple',  sub: 'total processado' },
            { label: 'Divergências',      value: divergencias,     icon: <AlertTriangle size={18} />, color: 'amber', sub: 'eventos de alerta' },
          ].map(({ label, value, icon, color, sub }) => (
            <div
              key={label}
              className={`relative overflow-hidden rounded-2xl border bg-black/40 backdrop-blur-md p-5 space-y-2 border-${color}-500/20`}
            >
              <div className={`p-2 w-fit rounded-xl bg-${color}-500/10 text-${color}-400`}>
                {icon}
              </div>
              <div className={`text-3xl font-black text-${color}-300 font-mono`}>
                {value.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-slate-400 font-medium">{label}</div>
              <div className="text-[10px] text-slate-600 font-mono">{sub}</div>
              <div className={`absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-${color}-500/50 to-transparent`} />
            </div>
          ))}
        </div>

        {/* ── GRID PRINCIPAL ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── OPERADORES ATIVOS ── */}
          <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Activity size={14} className="text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 font-mono">Operadores</h2>
            </div>

            {operatorSummaries.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4 font-mono">Nenhum operador registrado hoje.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {operatorSummaries.map(op => {
                  const isActive = Date.now() - op.lastSeen < 15 * 60 * 1000;
                  return (
                    <div key={op.colaborador} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-all">
                      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white font-mono truncate">{op.colaborador}</span>
                          <span className="text-[10px] text-slate-500 shrink-0 ml-2">{timeAgo(op.lastSeen)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {op.ruaAtual && <span className="text-blue-400">Rua {op.ruaAtual}</span>}
                          {op.setorAtual && <span className="text-slate-500"> • Setor {op.setorAtual}</span>}
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] font-mono">
                          <span className="text-emerald-400">{op.enderecos} end.</span>
                          <span className="text-blue-400">{op.volumes} vol.</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── FEED DE EVENTOS EM TEMPO REAL ── */}
          <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-blue-400 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 font-mono">Feed Ao Vivo</h2>
              </div>
              <span className="text-[10px] text-slate-600 font-mono">
                Atualizado {timeAgo(lastUpdate)}
              </span>
            </div>

            {isLoading && events.length === 0 ? (
              <div className="flex items-center justify-center py-10 gap-3">
                <RefreshCw size={16} className="animate-spin text-emerald-400" />
                <span className="text-slate-500 text-sm font-mono">Carregando eventos...</span>
              </div>
            ) : todayEvents.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-10 font-mono">
                Nenhum evento registrado hoje. Aguardando operação...
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {todayEvents.slice(0, 80).map(ev => {
                  const { label, color } = tipoLabel(ev.tipo);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-all group"
                    >
                      {/* Dot */}
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold font-mono" style={{ color }}>
                              {label}
                            </span>
                            {ev.colaborador && (
                              <span className="text-[10px] text-slate-400 font-mono">{ev.colaborador}</span>
                            )}
                            {ev.rua && (
                              <span className="text-[10px] text-blue-400 font-mono">Rua {ev.rua}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-600 shrink-0 font-mono">
                            {formatTimestamp(ev.timestamp)}
                          </span>
                        </div>

                        {/* Detalhes */}
                        <div className="mt-1 flex gap-3 flex-wrap text-[10px] font-mono text-slate-500">
                          {ev.endereco && <span>📍 {ev.endereco}</span>}
                          {(ev.volumes_delta || 0) > 0 && <span className="text-emerald-400">+{ev.volumes_delta} vol.</span>}
                          {(ev.enderecos_delta || 0) > 0 && <span className="text-blue-400">+{ev.enderecos_delta} end.</span>}
                          {ev.ml_data?.vphEstimado && (
                            <span className="text-purple-400">
                              VPH estimado: {ev.ml_data.vphEstimado} — {ev.ml_data.timeElapsedSeconds}s
                            </span>
                          )}
                          {ev.justification && (
                            <span className="text-amber-400/80 truncate max-w-[200px]">{ev.justification}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── FOOTER ── */}
        <footer className="text-center text-[10px] text-slate-700 font-mono border-t border-white/5 pt-4">
          REPRO // GESTÃO REMOTA — SUPABASE REALTIME — INDEPENDENTE DE DISPOSITIVO E IP
          {' '}•{' '}
          {new Date().toLocaleDateString('pt-BR')}
        </footer>
      </div>
    </div>
  );
}
