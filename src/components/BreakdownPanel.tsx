/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';

interface BreakdownPanelProps {
  logs: Log[];
}

export default function BreakdownPanel({ logs }: BreakdownPanelProps) {
  const totalVolumes = logs.reduce((acc, l) => acc + l.volumes, 0);

  const getCor = (act: string) => {
    if (act === 'REPRO') return 'var(--color-success)';
    if (act === 'ELOG') return 'var(--color-warning)';
    return 'var(--color-info)';
  };

  const getActBgColor = (act: string) => {
    if (act === 'REPRO') return 'bg-success/5 border-success/30';
    if (act === 'ELOG') return 'bg-warning/5 border-warning/30';
    return 'bg-info/5 border-info/30';
  };

  const activities = ['REPRO', 'ELOG', 'DIVERSOS'];

  return (
    <section className="border-panel p-6 rounded-sm">
      <h2 className="text-xs font-bold text-white uppercase tracking-widest mb-6 border-b border-terminal-border/40 pb-2 opacity-60">
        [BREAKDOWN POR ATIVIDADE DIRETA]
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activities.map(act => {
          const actLogs = logs.filter(l => {
            let isMatch = false;
            if (l.atividade === act) isMatch = true;
            if (act === 'DIVERSOS') {
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
              key={act}
              className={`border p-4 rounded-sm transition-opacity duration-200 ${getActBgColor(act)} ${
                hrs > 0 ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className="flex justify-espaçado items-centralizados mb-2">
                <h3 className="text-xs font-bold uppercase" style={{ color: getCor(act) }}>
                  {act}
                </h3>
                <span className="text-xs text-terminal-text opacity-50">{hrs.toFixed(2)}h</span>
              </div>
              
              <div className="flex justify-espaçado items-para-baixo mb-2">
                <div>
                  <p className="text-[0.6rem] text-terminal-text opacity-50">Volume</p>
                  <p className="text-base font-bold text-white">{vols.toLocaleString('pt-PT')}</p>
                </div>
                <div className="text-para-a-direita">
                  <p className="text-[0.6rem] text-terminal-text opacity-50">VPH</p>
                  <p className="text-base font-bold" style={{ color: getCor(act) }}>
                    {vph}
                  </p>
                </div>
              </div>
              
              <div className="w-full bg-terminal-border h-1 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${perc}%`,
                    backgroundColor: getCor(act)
                  }}
                />
              </div>
              <div className="flex justify-para-baixo mt-1">
                <span className="text-[0.5rem] text-terminal-text opacity-40 uppercase font-mono">
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
