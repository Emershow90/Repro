import React, { useState } from 'react';
import { AuditRecord, AuditSummary } from '../hooks/useArticleAudit';
import { CheckCircle2, AlertTriangle, XCircle, Search, Box, MapPin } from 'lucide-react';

interface AuditBoardProps {
  auditResults: AuditRecord[];
  summary: AuditSummary;
}

export const AuditBoard: React.FC<AuditBoardProps> = ({ auditResults, summary }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredResults = auditResults.filter(r => 
    r.ctnFilho.includes(searchTerm) || 
    r.artigoEsperado.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Validados', val: summary.validados, color: 'text-emerald-400', icon: CheckCircle2 },
          { label: 'Alertas', val: summary.alertas, color: 'text-amber-400', icon: AlertTriangle },
          { label: 'Inconsistentes', val: summary.inconsistentes, color: 'text-rose-400', icon: XCircle },
          { label: 'Pendentes', val: summary.pendentes, color: 'text-slate-400', icon: Box },
        ].map(item => (
          <div key={item.label} className="bg-slate-900 border border-white/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <item.icon size={16} className={item.color} />
              <span className="text-xs font-mono uppercase">{item.label}</span>
            </div>
            <div className={`text-2xl font-black font-mono ${item.color}`}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input 
          type="text"
          placeholder="Buscar por CTN ou SKU..."
          className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white font-mono"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tabela */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-950 text-slate-400 uppercase">
            <tr>
              <th className="p-3">CTN</th>
              <th className="p-3">Artigo</th>
              <th className="p-3">Status</th>
              <th className="p-3">Observação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredResults.map(r => (
              <tr key={r.id} className="hover:bg-white/5">
                <td className="p-3 text-cyan-300">{r.ctnFilho}</td>
                <td className="p-3">{r.artigoEsperado}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                    r.status === 'VALIDADO' ? 'bg-emerald-500/20 text-emerald-400' :
                    r.status === 'INCONSISTENTE' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-3 text-slate-400">{r.mensagem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
