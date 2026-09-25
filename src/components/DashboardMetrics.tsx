/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { Activity, Clock, Box, TrendingUp, Gauge } from 'lucide-react';

interface MetricsProps {
  logs: Log[];
}

export default function DashboardMetrics({ logs }: MetricsProps) {
  const horasDiretas = logs
    .filter(l => l.tipo !== 'indireta')
    .reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

  const horasIndiretas = logs
    .filter(l => l.tipo === 'indireta')
    .reduce((acc, l) => acc + (Number(l.horas) || 0), 0);

  const totalVolumes = logs.reduce((acc, l) => acc + (Number(l.volumes) || 0), 0);
  const totalHoras = horasDiretas + horasIndiretas;

  const vphDiretoCalc = horasDiretas > 0 ? totalVolumes / horasDiretas : 0;
  const vphGeralCalc = totalHoras > 0 ? totalVolumes / totalHoras : 0;

  const vphDiretoVal = isFinite(vphDiretoCalc) ? vphDiretoCalc.toFixed(1) : "0.0";
  const vphGeralVal = isFinite(vphGeralCalc) ? vphGeralCalc.toFixed(1) : "0.0";

  const cards = [
    {
      title: 'Horas Diretas',
      subtitle: 'Produção em Linha',
      value: `${horasDiretas.toFixed(2)}h`,
      icon: Clock,
      color: 'text-emerald-400',
      borderGlow: 'hover:border-emerald-500/40',
      bgBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    {
      title: 'Horas Indiretas',
      subtitle: 'Apoio & Paradas',
      value: `${horasIndiretas.toFixed(2)}h`,
      icon: Activity,
      color: 'text-amber-400',
      borderGlow: 'hover:border-amber-500/40',
      bgBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    },
    {
      title: 'Total Volumes',
      subtitle: 'Caixas Concluídas',
      value: totalVolumes.toLocaleString('pt-PT'),
      icon: Box,
      color: 'text-cyan-400',
      borderGlow: 'hover:border-cyan-500/40',
      bgBadge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    },
    {
      title: 'Produtividade Direta',
      subtitle: 'Vol/h Líquido',
      value: vphDiretoVal,
      unit: 'VPH',
      icon: TrendingUp,
      color: 'text-emerald-400',
      borderGlow: 'hover:border-emerald-500/50',
      bgBadge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      highlight: true
    },
    {
      title: 'Produtividade Geral',
      subtitle: 'Vol/h Total do Turno',
      value: vphGeralVal,
      unit: 'VPH Global',
      icon: Gauge,
      color: 'text-indigo-300',
      borderGlow: 'hover:border-indigo-500/40',
      bgBadge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
    }
  ];

  return (
    <section className="repro-card p-4 sm:p-5 rounded-2xl relative overflow-hidden">
      {/* Decorative top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <TrendingUp size={14} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Métricas Operacionais da Sessão
            </h2>
            <p className="text-[0.62rem] text-slate-400 font-sans">
              Consolidação de horas trabalhadas, volumes expedidos e taxa de rendimento (VPH)
            </p>
          </div>
        </div>
        <span className="badge-emerald">
          {logs.length} {logs.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`repro-card-sub p-3.5 flex flex-col justify-between transition-all duration-200 ${c.borderGlow} ${
                c.highlight ? 'border-emerald-500/30 shadow-sm shadow-emerald-500/10' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider font-sans">
                  {c.title}
                </span>
                <div className={`p-1 rounded-md border ${c.bgBadge}`}>
                  <Icon size={12} />
                </div>
              </div>

              <div className="space-y-0.5 mt-1">
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${c.color}`}>
                    {c.value}
                  </p>
                  {c.unit && (
                    <span className="text-[0.6rem] font-bold font-mono text-slate-400">
                      {c.unit}
                    </span>
                  )}
                </div>
                <p className="text-[0.58rem] text-slate-400 font-sans truncate">
                  {c.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
