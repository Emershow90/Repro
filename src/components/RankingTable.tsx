/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Log } from '../types';

interface RankingTableProps {
  logs: Log[];
}

export default function RankingTable({ logs }: RankingTableProps) {
  const [orderBy, setOrderBy] = useState<'vph' | 'vol'>('vph');

  // Aggregate stats per operator
  const operatorsMap: { [key: string]: { colab: string; vol: number; hrs: number; vph: number } } = {};
  
  logs.forEach(l => {
    const colabKey = l.colaborador.toUpperCase().trim();
    if (!colabKey) return;
    
    if (!operatorsMap[colabKey]) {
      operatorsMap[colabKey] = { colab: l.colaborador, vol: 0, hrs: 0, vph: 0 };
    }
    operatorsMap[colabKey].vol += l.volumes;
    operatorsMap[colabKey].hrs += l.horas;
  });

  const rankList = Object.values(operatorsMap).map(o => {
    o.vph = o.hrs > 0 ? o.vol / o.hrs : 0;
    return o;
  });

  // Sort rank list
  rankList.sort((a, b) => {
    if (orderBy === 'vph') {
      return b.vph - a.vph;
    } else {
      return b.vol - a.vol;
    }
  });

  return (
    <section className="border-panel p-6 rounded-sm">
      <div className="flex justify-espaçado items-centralizados mb-4 border-b border-terminal-border/40 pb-2">
        <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
          [RANKING DE PERFORMANCE]
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setOrderBy('vph')}
            className={`text-[0.6rem] px-2 py-1 rounded-sm cursor-pointer border ${
              orderBy === 'vph'
                ? 'border-terminal-accent text-terminal-accent font-bold bg-terminal-accent/5'
                : 'border-terminal-border text-terminal-text opacity-70 hover:opacity-100'
            }`}
          >
            ORD VPH
          </button>
          <button
            onClick={() => setOrderBy('vol')}
            className={`text-[0.6rem] px-2 py-1 rounded-sm cursor-pointer border ${
              orderBy === 'vol'
                ? 'border-terminal-accent text-terminal-accent font-bold bg-terminal-accent/5'
                : 'border-terminal-border text-terminal-text opacity-70 hover:opacity-100'
            }`}
          >
            ORD VOL
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="text-[0.55rem] uppercase text-terminal-text opacity-40 border-b border-terminal-border/40">
              <th className="p-2 pb-3 w-8 text-center">#</th>
              <th className="p-2 pb-3">Colaborador</th>
              <th className="p-2 pb-3 text-para-a-direita">Volumes</th>
              <th className="p-2 pb-3 text-para-a-direita">Horas</th>
              <th className="p-2 pb-3 text-para-a-direita text-terminal-accent">VPH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-terminal-border/40 text-[0.7rem] font-medium text-terminal-text/80">
            {rankList.map((r, idx) => (
              <tr key={idx} className="border-b border-terminal-border/40 hover:bg-terminal-bg/30">
                <td className="p-2 text-center text-terminal-text opacity-50">{idx + 1}º</td>
                <td className="p-2 text-white font-medium uppercase">{r.colab}</td>
                <td className="p-2 text-para-a-direita text-terminal-text opacity-80">
                  {r.vol.toLocaleString('pt-PT')}
                </td>
                <td className="p-2 text-para-a-direita text-terminal-text opacity-80">
                  {r.hrs.toFixed(2)}h
                </td>
                <td className="p-2 text-para-a-direita text-terminal-accent font-bold">
                  {r.vph.toFixed(2)}
                </td>
              </tr>
            ))}
            {rankList.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center p-3 text-terminal-text opacity-40">
                  SEM DADOS DE RANKING
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
