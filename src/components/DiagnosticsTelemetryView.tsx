import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Database, 
  Cpu, 
  Activity, 
  RefreshCw, 
  Download, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Zap, 
  Clock, 
  Layers 
} from 'lucide-react';
import { telemetry, TelemetryEntry } from '../utils/telemetry';
import { sheetsCircuitBreaker, globalJobGuard } from '../utils/circuitBreaker';

export default function DiagnosticsTelemetryView() {
  const [entries, setEntries] = useState<TelemetryEntry[]>(() => telemetry.getRecentLogs(50));
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  // Atualização em tempo real da telemetria
  useEffect(() => {
    const unsubscribe = telemetry.subscribe(() => {
      setEntries(telemetry.getRecentLogs(50));
    });
    return unsubscribe;
  }, []);

  // Busca métricas reais do servidor backend
  const fetchMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const res = await fetch('/api/metrics');
      if (res.ok) {
        const data = await res.json();
        setServerMetrics(data);
      }
    } catch (err) {
      console.warn('Não foi possível carregar /api/metrics:', err);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const summary = telemetry.getSummary();
  const circuitState = sheetsCircuitBreaker.getState();

  const filteredEntries = entries.filter(e => {
    if (filterLevel === 'ALL') return true;
    return e.level === filterLevel;
  });

  const handleExport = () => {
    const jsonStr = telemetry.exportAsJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-repro-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 font-mono">
      
      {/* CABEÇALHO COM OS 4 PILARES DE ARQUITETURA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* PILAR 1: RATE LIMITING */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] text-emerald-400 font-bold uppercase flex items-center gap-1.5">
              <ShieldCheck size={14} />
              <span>1. Rate Limiting</span>
            </span>
            <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black">
              ATIVO
            </span>
          </div>
          <div className="text-sm font-black text-white">
            150 <span className="text-xs text-slate-400 font-normal">req/min (Global)</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-tight">
            Proxy limitado a 45 req/min por IP. Protege contra DDoS, spam e estouro de cota do Google Sheets.
          </p>
        </div>

        {/* PILAR 2: N+1 & ÍNDICES DE BANCO */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] text-cyan-400 font-bold uppercase flex items-center gap-1.5">
              <Database size={14} />
              <span>2. Índices & Anti N+1</span>
            </span>
            <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black">
              IDB v2
            </span>
          </div>
          <div className="text-sm font-black text-white">
            6 Índices <span className="text-xs text-slate-400 font-normal">& Bulk Atomic</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-tight">
            Consultas O(1) com índices <code className="text-cyan-300">synced</code>, <code className="text-cyan-300">setor_data</code>. Gravação em lote sem N+1.
          </p>
        </div>

        {/* PILAR 3: CIRCUIT BREAKER & ANTI-LOOP */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] text-purple-400 font-bold uppercase flex items-center gap-1.5">
              <Zap size={14} />
              <span>3. Anti-Loop & Guard</span>
            </span>
            <span className={`text-[0.58rem] px-1.5 py-0.5 rounded font-black ${
              circuitState === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {circuitState}
            </span>
          </div>
          <div className="text-sm font-black text-white">
            JobGuard <span className="text-xs text-slate-400 font-normal">Mutex Lock</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-tight">
            Bloqueio de concorrência em background sync e corte de requisições com 3 falhas consecutivas.
          </p>
        </div>

        {/* PILAR 4: LOG & TELEMETRIA */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] text-amber-400 font-bold uppercase flex items-center gap-1.5">
              <Activity size={14} />
              <span>4. Telemetria Live</span>
            </span>
            <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black">
              {summary.total} logs
            </span>
          </div>
          <div className="text-sm font-black text-white flex items-center gap-2">
            <span>{summary.errors} erros</span>
            <span className="text-xs text-slate-400 font-normal">/ {summary.perf} timing</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 leading-tight">
            Monitoramento de latências em ms, erros não tratados e auditoria exportável.
          </p>
        </div>

      </div>

      {/* METRICAS DO SERVIDOR EM TEMPO REAL */}
      {serverMetrics && (
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-900 border border-white/10 text-emerald-400">
              <Cpu size={18} />
            </div>
            <div>
              <span className="text-xs font-black text-white uppercase block">Status do Servidor Node.js</span>
              <div className="flex items-center gap-3 text-[0.68rem] text-slate-400 mt-0.5">
                <span>Uptime: <strong className="text-white">{serverMetrics.uptimeSeconds}s</strong></span>
                <span>•</span>
                <span>Heap: <strong className="text-cyan-300">{serverMetrics.memory.heapUsedMb} MB</strong> / {serverMetrics.memory.heapTotalMb} MB</span>
                <span>•</span>
                <span>IPs Ativos no RateLimiter: <strong className="text-emerald-400">{serverMetrics.rateLimiters.global.activeIps}</strong></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchMetrics}
            disabled={isLoadingMetrics}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={12} className={isLoadingMetrics ? 'animate-spin' : ''} />
            <span>Atualizar Métricas</span>
          </button>
        </div>
      )}

      {/* FEED DE TELEMETRIA E LOGS */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-sm space-y-3">
        
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-white uppercase">Trilha de Telemetria & Diagnóstico</span>
            <span className="text-[0.62rem] text-slate-500">({filteredEntries.length} eventos)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filtro por nível */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-white/15">
              {['ALL', 'PERF', 'INFO', 'WARN', 'ERROR'].map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-0.5 text-[0.62rem] font-bold rounded-lg transition-all cursor-pointer ${
                    filterLevel === lvl
                      ? 'bg-emerald-500 text-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Exportar JSON */}
            <button
              type="button"
              onClick={handleExport}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 text-[0.68rem] font-bold rounded-xl border border-white/15 flex items-center gap-1 cursor-pointer"
              title="Baixar log completo em JSON"
            >
              <Download size={12} />
              <span>Exportar</span>
            </button>
          </div>
        </div>

        {/* Tabela / Lista de Logs */}
        <div className="max-h-[350px] overflow-y-auto space-y-1.5 pr-1">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              Nenhum evento registrado com o filtro selecionado.
            </div>
          ) : (
            filteredEntries.map(entry => {
              const badgeColor = 
                entry.level === 'ERROR' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                entry.level === 'WARN' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                entry.level === 'PERF' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

              return (
                <div 
                  key={entry.id}
                  className="p-2 rounded-xl bg-slate-900/80 border border-white/5 flex items-start justify-between gap-2 text-[0.68rem]"
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.6rem] text-slate-500 font-mono">
                        {entry.isoTime.substring(11, 19)}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[0.58rem] font-black border ${badgeColor}`}>
                        {entry.level}
                      </span>
                      <span className="font-bold text-slate-300 text-[0.65rem]">
                        [{entry.context}]
                      </span>
                      {entry.durationMs !== undefined && (
                        <span className="text-emerald-400 font-mono font-bold text-[0.62rem]">
                          ⏱️ {entry.durationMs.toFixed(1)}ms
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 truncate font-mono">
                      {entry.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
