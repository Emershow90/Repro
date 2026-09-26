import React, { useEffect, useState } from 'react';
import { ShieldAlert, Clock, UserX, Trash2, MapPin, Search } from 'lucide-react';
import { getAuditLogs, deleteAuditLog, AuditLog } from '../services/dbLocal';

interface AuditLogsPanelProps {
  onInspectCtn?: (ctn: string) => void;
}

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({ onInspectCtn }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getAuditLogs();
      // Ordena do mais recente para o mais antigo
      setLogs(data.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
      console.error("Erro ao carregar logs de auditoria:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('Deseja descartar este registro de auditoria local?')) {
      await deleteAuditLog(id);
      fetchLogs();
    }
  };

  return (
    <div className="bg-[#15181e] rounded-sm border border-rose-500/20 overflow-hidden mt-6">
      <div className="px-5 py-4 border-b border-rose-500/20 bg-rose-500/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          <div>
            <h3 className="text-sm font-bold text-rose-100 uppercase tracking-widest">
              Divergências de Processo
            </h3>
            <p className="text-[10px] text-rose-400/70 font-mono mt-0.5">
              Monitoramento de Inversões e Falhas de Vinculação
            </p>
          </div>
        </div>
        <span className="text-xs font-bold font-mono bg-rose-500/20 text-rose-300 px-3 py-1 rounded-sm border border-rose-500/30">
          {logs.length} Registros
        </span>
      </div>

      <div className="overflow-x-auto max-h-[400px]">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-[#0d0f12] text-[10px] uppercase tracking-widest text-slate-500 sticky top-0 z-10">
            <tr>
              <th className="px-5 py-3 font-semibold">Data/Hora</th>
              <th className="px-5 py-3 font-semibold">Operador</th>
              <th className="px-5 py-3 font-semibold">Local</th>
              <th className="px-5 py-3 font-semibold">Tipo de Falha</th>
              <th className="px-5 py-3 font-semibold">Contexto (Pai ↔ Filho)</th>
              <th className="px-5 py-3 font-semibold text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs font-mono">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Carregando trilha de auditoria...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-emerald-500/70 font-sans">
                  Nenhuma divergência registrada. Operação limpa.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-rose-500/5 transition-colors">
                  <td className="px-5 py-3 text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-bold text-rose-300 uppercase">
                    <div className="flex items-center gap-1.5">
                      <UserX className="w-3 h-3 text-rose-400/50" />
                      {log.operador}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      {log.setor} / {log.rua}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-sm text-[10px] font-bold text-rose-400">
                      {log.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">
                    <div className="flex flex-col gap-0.5 text-[10px]">
                      <span>
                        <strong className="text-slate-300">Lido no Pai:</strong>{' '}
                        {onInspectCtn && log.contexto.ctnPaiBipado ? (
                          <button
                            type="button"
                            onClick={() => onInspectCtn(log.contexto.ctnPaiBipado)}
                            className="text-purple-400 hover:text-purple-300 underline font-bold transition-colors"
                            title="Rastrear genealogia deste CTN Pai"
                          >
                            {log.contexto.ctnPaiBipado}
                          </button>
                        ) : (
                          log.contexto.ctnPaiBipado
                        )}
                      </span>
                      <span><strong className="text-slate-300">Lido no Filho:</strong> {log.contexto.ctnFilhoBipado}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {onInspectCtn && log.contexto.ctnPaiBipado && (
                        <button
                          type="button"
                          onClick={() => onInspectCtn(log.contexto.ctnPaiBipado)}
                          className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                          title="Rastrear Árvore Genealógica"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(log.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Descartar Log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
