/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Log } from '../types';
import { Trophy, ArrowUpDown, UserCheck, Award } from 'lucide-react';

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
    <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Trophy size={14} />
          </div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Ranking de Performance
          </h2>
        </div>
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 font-mono">
          <button
            onClick={() => setOrderBy('vph')}
            className={`text-[0.62rem] px-2.5 py-1 rounded-lg cursor-pointer transition-all font-bold uppercase ${
              orderBy === 'vph'
                ? 'bg-emerald-500 text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            VPH
          </button>
          <button
            onClick={() => setOrderBy('vol')}
            className={`text-[0.62rem] px-2.5 py-1 rounded-lg cursor-pointer transition-all font-bold uppercase ${
              orderBy === 'vol'
                ? 'bg-emerald-500 text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Volumes
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="text-[0.6rem] uppercase tracking-wider text-slate-400 border-b border-white/10 font-mono">
              <th className="p-2.5 pb-3 w-10 text-center">Pos</th>
              <th className="p-2.5 pb-3">Colaborador</th>
              <th className="p-2.5 pb-3 text-right">Volumes</th>
              <th className="p-2.5 pb-3 text-right">Horas</th>
              <th className="p-2.5 pb-3 text-right text-emerald-400">VPH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[0.72rem] font-medium font-mono text-slate-300">
            {rankList.map((r, idx) => {
              const isTop1 = idx === 0;
              const isTop2 = idx === 1;
              const isTop3 = idx === 2;

              return (
                <tr 
                  key={idx} 
                  className={`border-b border-white/5 transition-colors ${
                    isTop1 
                      ? 'bg-amber-500/5 hover:bg-amber-500/10' 
                      : isTop2 
                      ? 'bg-slate-300/5 hover:bg-slate-300/10' 
                      : isTop3 
                      ? 'bg-amber-700/5 hover:bg-amber-700/10' 
                      : 'hover:bg-white/5'
                  }`}
                >
                  <td className="p-2.5 text-center">
                    {isTop1 ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-black text-[0.65rem] font-black shadow-sm">1</span>
                    ) : isTop2 ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-300 text-black text-[0.65rem] font-black shadow-sm">2</span>
                    ) : isTop3 ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-700 text-white text-[0.65rem] font-black shadow-sm">3</span>
                    ) : (
                      <span className="text-slate-500 text-[0.65rem]">{idx + 1}º</span>
                    )}
                  </td>
                  <td className="p-2.5 text-white font-bold uppercase">
                    {r.colab}
                  </td>
                  <td className="p-2.5 text-right text-slate-300">
                    {r.vol.toLocaleString('pt-PT')}
                  </td>
                  <td className="p-2.5 text-right text-slate-400">
                    {r.hrs.toFixed(2)}h
                  </td>
                  <td className="p-2.5 text-right text-emerald-400 font-extrabold text-sm">
                    {r.vph.toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {rankList.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center p-6 text-slate-500 font-mono text-xs">
                  Sem dados de ranking para a seleção atual
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
