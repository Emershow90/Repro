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
    .reduce((acc, l) => acc + l.horas, 0);

  const horasIndiretas = logs
    .filter(l => l.tipo === 'indireta')
    .reduce((acc, l) => acc + l.horas, 0);

  const totalVolumes = logs.reduce((acc, l) => acc + l.volumes, 0);
  const totalHoras = horasDiretas + horasIndiretas;

  const vphDiretoVal = horasDiretas > 0 ? (totalVolumes / horasDiretas).toFixed(2) : "0.00";
  const vphGeralVal = totalHoras > 0 ? (totalVolumes / totalHoras).toFixed(2) : "0.00";

  const cards = [
    {
      title: 'Horas Diretas',
      subtitle: 'Produção em Linha',
      value: `${horasDiretas.toFixed(2)}h`,
      icon: Clock,
      color: 'text-emerald-400',
      borderGlow: 'hover:border-emerald-500/40',
      bgGlow: 'from-emerald-500/10 to-transparent'
    },
    {
      title: 'Horas Indiretas',
      subtitle: 'Apoio & Treino',
      value: `${horasIndiretas.toFixed(2)}h`,
      icon: Activity,
      color: 'text-amber-400',
      borderGlow: 'hover:border-amber-500/40',
      bgGlow: 'from-amber-500/10 to-transparent'
    },
    {
      title: 'Total Volumes',
      subtitle: 'Endereços Concluídos',
      value: totalVolumes.toLocaleString('pt-PT'),
      icon: Box,
      color: 'text-blue-400',
      borderGlow: 'hover:border-blue-500/40',
      bgGlow: 'from-blue-500/10 to-transparent'
    },
    {
      title: 'VPH Direto (Net)',
      subtitle: 'Produtividade Pura',
      value: vphDiretoVal,
      unit: 'VOL/H',
      icon: TrendingUp,
      color: 'text-emerald-400',
      borderGlow: 'hover:border-emerald-500/40',
      bgGlow: 'from-emerald-500/15 to-transparent',
      highlight: true
    },
    {
      title: 'VPH Geral (Bruto)',
      subtitle: 'Eficiência Total',
      value: vphGeralVal,
      unit: 'VOL/H',
      icon: Gauge,
      color: 'text-slate-200',
      borderGlow: 'hover:border-slate-500/40',
      bgGlow: 'from-slate-500/10 to-transparent'
    }
  ];

  return (
    <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden">
      {/* Decorative top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Métricas de Desempenho da Sessão
          </h2>
        </div>
        <span className="text-[0.6rem] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
          {logs.length} {logs.length === 1 ? 'registo' : 'registos'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`relative p-4 rounded-xl border border-white/10 bg-gradient-to-b ${c.bgGlow} bg-black/40 backdrop-blur-md ${c.borderGlow} transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group ${
                c.highlight ? 'ring-1 ring-emerald-500/30' : ''
              } ${i === 4 ? 'col-span-2 md:col-span-1' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.65rem] font-medium text-slate-400 uppercase tracking-wider">
                  {c.title}
                </span>
                <div className={`p-1.5 rounded-lg bg-white/5 border border-white/5 ${c.color} group-hover:scale-110 transition-transform`}>
                  <Icon size={14} />
                </div>
              </div>

              <div className="flex items-baseline gap-1">
                <p className={`text-xl font-extrabold font-mono tracking-tight ${c.color}`}>
                  {c.value}
                </p>
                {c.unit && (
                  <span className="text-[0.55rem] font-mono text-slate-500 font-bold">
                    {c.unit}
                  </span>
                )}
              </div>

              <p className="text-[0.58rem] text-slate-500 mt-1 font-mono">
                {c.subtitle}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
