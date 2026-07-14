/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';

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

  return (
    <section className="border-panel p-6 rounded-sm">
      <h2 className="text-xs font-bold text-white uppercase tracking-widest mb-4 opacity-60">
        [MÉTRICAS DE DESEMPENHO DA SESSÃO]
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
        <div className="bg-terminal-bg/40 p-3 border border-terminal-border/40 rounded-sm">
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Horas Diretas</p>
          <p className="text-lg font-bold text-white">{horasDiretas.toFixed(2)}h</p>
        </div>
        <div className="bg-terminal-bg/40 p-3 border border-terminal-border/40 rounded-sm">
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Horas Indiretas</p>
          <p className="text-lg font-bold text-warning">{horasIndiretas.toFixed(2)}h</p>
        </div>
        <div className="bg-terminal-bg/40 p-3 border border-terminal-border/40 rounded-sm">
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Total Volumes</p>
          <p className="text-lg font-bold text-white">{totalVolumes.toLocaleString('pt-PT')}</p>
        </div>
        <div className="bg-terminal-bg/40 p-3 border border-terminal-border/40 rounded-sm">
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">VPH Direto (Net)</p>
          <p className="text-lg font-bold text-terminal-accent">{vphDiretoVal}</p>
        </div>
        <div className="bg-terminal-bg/40 p-3 border border-terminal-border/40 rounded-sm col-span-2 lg:col-span-1">
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">VPH Geral (Bruto)</p>
          <p className="text-lg font-bold text-terminal-text/80">{vphGeralVal}</p>
        </div>
      </div>
    </section>
  );
}
