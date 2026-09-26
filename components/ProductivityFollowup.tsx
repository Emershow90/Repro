import React, { useMemo, useState } from 'react';
import { OperationalEvent } from '../types';
import { TrendingUp, Clock, ShieldCheck, Activity, Calendar } from 'lucide-react';
import { calculateProductivityMetrics } from '../productivityHelper';

interface ProductivityFollowupProps {
  events: OperationalEvent[];
}

export default function ProductivityFollowup({ events }: ProductivityFollowupProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const metrics = useMemo(() => {
    return calculateProductivityMetrics(events, selectedDate);
  }, [events, selectedDate]);

  const totalVphNet = metrics.length > 0 
    ? Math.round(metrics.reduce((acc, m) => acc + m.vphNet, 0) / metrics.length) 
    : 0;

  const totalColisoesEvitadas = metrics.reduce((acc, m) => acc + m.colisoesEvitadas, 0);
  const totalColisoesAssumidas = metrics.reduce((acc, m) => acc + m.colisoesAssumidas, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-800 p-4 rounded-lg">
        <h2 className="text-white font-bold tracking-widest flex items-center gap-2">
          <TrendingUp className="text-emerald-400" /> Follow-Up de Produtividade (VPH Net)
        </h2>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-700 text-white px-3 py-1 rounded border border-slate-600 focus:outline-none focus:border-emerald-500 text-sm font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-bold text-slate-500 uppercase">VPH Net Médio</h3>
            <TrendingUp size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-800 mt-2">{totalVphNet}</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-bold text-emerald-700 uppercase">Colisões Evitadas</h3>
            <ShieldCheck size={20} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-emerald-800 mt-2">{totalColisoesEvitadas}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-bold text-amber-700 uppercase">Colisões Assumidas</h3>
            <Activity size={20} className="text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-800 mt-2">{totalColisoesAssumidas}</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-bold text-purple-700 uppercase">Operadores Ativos</h3>
            <Clock size={20} className="text-purple-500" />
          </div>
          <p className="text-3xl font-black text-purple-800 mt-2">{metrics.length}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Métricas Detalhadas - {selectedDate.split('-').reverse().join('/')}</h3>
        </div>
        
        {metrics.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-mono text-sm">
            Nenhum dado operacional para esta data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-semibold">Operador</th>
                  <th className="p-3 font-semibold text-right">Volumes</th>
                  <th className="p-3 font-semibold text-right">Endereços</th>
                  <th className="p-3 font-semibold text-right">H. Líquidas</th>
                  <th className="p-3 font-semibold text-right">H. Pausa</th>
                  <th className="p-3 font-semibold text-right">VPH Net</th>
                  <th className="p-3 font-semibold text-right">Col. Evitadas</th>
                  <th className="p-3 font-semibold text-right">Col. Assumidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {metrics.map(m => (
                  <tr key={m.operador} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-700 font-sans">{m.operador}</td>
                    <td className="p-3 text-right">{m.totalVolumes}</td>
                    <td className="p-3 text-right">{m.totalEnderecos}</td>
                    <td className="p-3 text-right">{m.horasTrabalhadasLiquidas.toFixed(2)}h</td>
                    <td className="p-3 text-right">{m.horasPausa.toFixed(2)}h</td>
                    <td className="p-3 text-right font-bold text-blue-600">{m.vphNet}</td>
                    <td className="p-3 text-right text-emerald-600">{m.colisoesEvitadas}</td>
                    <td className="p-3 text-right text-amber-600">{m.colisoesAssumidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
