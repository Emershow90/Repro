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
      title: 'Produtividade Direta (VPH)',
      subtitle: 'Vol/h (Volumes por Hora Líquida)',
      value: vphDiretoVal,
      unit: 'Vol/h (VPH)',
      icon: TrendingUp,
      color: 'text-emerald-400',
      borderGlow: 'hover:border-emerald-500/40',
      bgGlow: 'from-emerald-500/15 to-transparent',
      highlight: true
    },
    {
      title: 'Produtividade Geral (VPH/UPH)',
      subtitle: 'Vol/h & Unid/h Bruto Total',
      value: vphGeralVal,
      unit: 'Vol/h (VPH)',
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

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`p-2 rounded-lg border border-white/10 bg-black/40 ${i === 4 ? 'col-span-2' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.6rem] font-medium text-slate-400 uppercase tracking-wider">
                  {c.title}
                </span>
                <Icon size={12} className={c.color} />
              </div>

              <div className="flex items-baseline gap-1">
                <p className={`text-lg font-bold font-mono ${c.color}`}>
                  {c.value}
                </p>
                {c.unit && (
                  <span className="text-[0.5rem] font-mono text-slate-500">
                    {c.unit}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
