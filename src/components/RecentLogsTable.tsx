/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { pingGoogleSheetsEndpoint } from '../sheetService';
import { ListFilter, Download, Trash2, RefreshCw, CheckCircle, AlertTriangle, Cloud } from 'lucide-react';

interface RecentLogsTableProps {
  logs: Log[];
  onDeleteLog: (id: number) => void;
  onExportBackup: () => void;
  onClearDb: () => void;
  onRetrySync?: (log: Log) => void;
  apiUrl?: string;
}

export default function RecentLogsTable({
  logs,
  onDeleteLog,
  onExportBackup,
  onClearDb,
  onRetrySync,
  apiUrl = ''
}: RecentLogsTableProps) {
  const handleTestConnection = () => {
    if (apiUrl) {
      pingGoogleSheetsEndpoint(apiUrl);
    } else {
      console.warn('URL do Google Sheets não configurada para teste de ping.');
    }
  };

  return (
    <section className="border-panel p-5 md:p-6 rounded-2xl relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 border-b border-white/10 pb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ListFilter size={15} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Registo de Operações Recentes
            </h2>
            <p className="text-[0.6rem] text-slate-400 font-mono mt-0.5">
              Leitura e sincronização segura em tempo real
            </p>
          </div>
        </div>

        {apiUrl && (
          <button
            onClick={handleTestConnection}
            className="text-[0.6rem] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 font-mono shadow-sm"
            title="Clique para executar um ping de conectividade"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Testar Planilha (Ping)</span>
          </button>
        )}
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="text-[0.6rem] uppercase tracking-wider text-slate-400 border-b border-white/10 bg-black/30 font-mono">
              <th className="p-3 font-semibold text-center">Nuvem</th>
              <th className="p-3 font-semibold">Setor</th>
              <th className="p-3 font-semibold">Data</th>
              <th className="p-3 font-semibold text-white">Atividade</th>
              <th className="p-3 font-semibold text-emerald-400">Colaborador</th>
              <th className="p-3 font-semibold text-right">Volumes</th>
              <th className="p-3 font-semibold text-right">Horas</th>
              <th className="p-3 font-semibold text-right text-emerald-400">VPH</th>
              <th className="p-3 font-semibold text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[0.72rem] font-medium font-mono text-slate-300">
            {logs.slice(0, 15).map((log) => {
              const ehIndireta = log.tipo === 'indireta';
              const isFailed = !log.synced;
              
              const badgeClass = ehIndireta
                ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10';

              const rowBgClass = isFailed
                ? 'bg-rose-500/10 border-l-4 border-l-rose-500 border-b border-rose-500/20 text-rose-300 hover:bg-rose-500/15'
                : 'hover:bg-white/5 border-b border-white/5';

              return (
                <tr key={log.id} className={`${rowBgClass} transition-colors`}>
                  <td 
                    className="p-3 text-center cursor-pointer" 
                    title={log.synced ? 'Sincronizado na Nuvem' : 'Falha na Sincronização (Clique para testar)'}
                    onClick={handleTestConnection}
                  >
                    {log.synced ? (
                      <span className="text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[0.62rem] inline-flex items-center gap-1">
                        <CheckCircle size={10} />
                        <span>Nuvem</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold px-2 py-0.5 bg-rose-500/20 border border-rose-500/40 rounded-full text-[0.62rem] inline-flex items-center gap-1 animate-pulse">
                        <AlertTriangle size={10} />
                        <span>FALHO</span>
                      </span>
                    )}
                  </td>
                  <td className={`p-3 font-bold ${isFailed ? 'text-rose-400' : 'text-emerald-400'}`}>
                    Setor {log.setor || '87'}
                  </td>
                  <td className="p-3 text-slate-400">{log.data}</td>
                  <td className="p-3 text-white">
                    <span className={`px-2.5 py-1 rounded-lg border ${badgeClass} text-[0.62rem] uppercase font-bold tracking-wider`}>
                      {log.atividade}
                    </span>
                  </td>
                  <td className={`p-3 font-bold uppercase ${isFailed ? 'text-rose-300' : ehIndireta ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {log.colaborador}
                  </td>
                  <td className="p-3 text-right text-white font-mono">
                    {ehIndireta ? '-' : log.volumes.toLocaleString('pt-PT')}
                  </td>
                  <td className={`p-3 text-right font-bold ${isFailed ? 'text-rose-400' : 'text-amber-400'}`}>
                    <div>{log.horas.toFixed(2)}h</div>
                    {log.horaInicio && log.horaFim && (
                      <div className="text-[0.58rem] font-normal text-slate-400 font-mono">
                        {log.horaInicio} - {log.horaFim}
                      </div>
                    )}
                  </td>
                  <td className={`p-3 text-right font-black ${isFailed ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {ehIndireta ? <span className="text-slate-500 text-[0.6rem]">IND</span> : log.vph}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {!log.synced && onRetrySync && (
                        <button
                          onClick={() => onRetrySync(log)}
                          className="px-2 py-1 text-[0.58rem] font-bold uppercase bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500 hover:text-black rounded-lg cursor-pointer transition-all flex items-center gap-1"
                          title="Tentar sincronizar novamente"
                        >
                          <RefreshCw size={10} />
                          <span>Reenviar</span>
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg cursor-pointer transition-colors"
                        title="Excluir Registro"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center p-8 text-slate-500 font-mono text-xs">
                  Nenhum registo gravado nesta sessão
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-5 flex flex-wrap gap-3 justify-between items-center border-t border-white/10 pt-4">
        <button
          onClick={onExportBackup}
          className="text-[0.65rem] text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 px-3.5 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer font-bold flex items-center gap-1.5 font-mono"
        >
          <Download size={13} />
          <span>Baixar Backup Completo (JSON)</span>
        </button>
        <button
          onClick={onClearDb}
          className="text-[0.65rem] text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 px-3.5 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer font-bold flex items-center gap-1.5 font-mono"
        >
          <Trash2 size={13} />
          <span>Limpar Base Local</span>
        </button>
      </div>
    </section>
  );
}
