/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { PieChart, Zap } from 'lucide-react';

interface BreakdownPanelProps {
  logs: Log[];
}

export default function BreakdownPanel({ logs }: BreakdownPanelProps) {
  const totalVolumes = logs.reduce((acc, l) => acc + l.volumes, 0);

  const activities = [
    {
      name: 'REPRO',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/30',
      barColor: 'bg-emerald-400'
    },
    {
      name: 'ELOG',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
      barColor: 'bg-amber-400'
    },
    {
      name: 'DIVERSOS',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/30',
      barColor: 'bg-blue-400'
    }
  ];

  return (
    <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden">
      <div className="flex items-center gap-2 mb-5 border-b border-white/10 pb-3">
        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <PieChart size={14} />
        </div>
        <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
          Breakdown por Atividade Direta
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {activities.map(act => {
          const actLogs = logs.filter(l => {
            let isMatch = false;
            if (l.atividade === act.name) isMatch = true;
            if (act.name === 'DIVERSOS') {
              if (l.atividade === 'PENDÊNCIAS' || l.atividade === 'DIVERSOS') {
                isMatch = true;
              }
            }
            return isMatch;
          });

          const hrs = actLogs.reduce((acc, l) => acc + l.horas, 0);
          const vols = actLogs.reduce((acc, l) => acc + l.volumes, 0);
          
          const vph = hrs > 0 ? (vols / hrs).toFixed(2) : '0.00';
          const perc = totalVolumes > 0 ? ((vols / totalVolumes) * 100).toFixed(1) : '0.0';

          return (
            <div
              key={act.name}
              className={`p-4 rounded-xl border transition-all duration-300 ${act.bgColor} ${
                hrs > 0 ? 'opacity-100 shadow-md' : 'opacity-40'
              }`}
            >
              <div className="flex justify-between items-center mb-2.5">
                <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${act.color}`}>
                  {act.name}
                </h3>
                <span className="text-xs font-mono text-slate-400">{hrs.toFixed(2)}h</span>
              </div>
              
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-[0.6rem] text-slate-400 uppercase tracking-wider font-mono">Volume</p>
                  <p className="text-lg font-bold text-white font-mono">{vols.toLocaleString('pt-PT')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.6rem] text-slate-400 uppercase tracking-wider font-mono">VPH</p>
                  <p className={`text-lg font-extrabold font-mono ${act.color}`}>
                    {vph}
                  </p>
                </div>
              </div>
              
              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden mt-3 border border-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${act.barColor}`}
                  style={{ width: `${perc}%` }}
                />
              </div>
              <div className="flex justify-end mt-1.5">
                <span className="text-[0.55rem] text-slate-400 uppercase font-mono">
                  {perc}% do total
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
