/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';

interface RecentLogsTableProps {
  logs: Log[];
  onDeleteLog: (id: number) => void;
  onExportBackup: () => void;
  onClearDb: () => void;
}

export default function RecentLogsTable({
  logs,
  onDeleteLog,
  onExportBackup,
  onClearDb
}: RecentLogsTableProps) {
  return (
    <section className="border-panel p-6 rounded-sm">
      <div className="flex flex-col sm:flex-row justify-espaçado items-start sm:items-centralizados mb-6 border-b border-terminal-border/40 pb-3">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
            REGISTO DE OPERAÇÕES RECENTES
          </h2>
          <p className="text-[0.55rem] tracking-widest text-terminal-text opacity-40 mt-1">
            Leitura e distribuição segura em tempo real
          </p>
        </div>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 border-b border-terminal-border/40 bg-terminal-bg/50">
              <th className="p-3 font-medium text-center">Nuvem</th>
              <th className="p-3 font-medium">Data</th>
              <th className="p-3 font-medium text-white">Atividade</th>
              <th className="p-3 font-medium text-terminal-accent">Colaborador</th>
              <th className="p-3 font-medium text-para-a-direita">Volumes</th>
              <th className="p-3 font-medium text-para-a-direita">Horas</th>
              <th className="p-3 font-medium text-para-a-direita text-terminal-accent">VPH</th>
              <th className="p-3 font-medium text-center">Del</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-terminal-border/40 text-[0.7rem] font-medium text-terminal-text/80">
            {logs.slice(0, 15).map((log) => {
              const ehIndireta = log.tipo === 'indireta';
              const badgeClass = ehIndireta
                ? 'border-warning/30 text-warning bg-warning/5'
                : 'border-terminal-accent/30 text-terminal-accent bg-terminal-accent/5';
                
              return (
                <tr key={log.id} className="hover:bg-terminal-bg border-b border-terminal-border/40 transition-colors">
                  <td className="p-3 text-center" title={log.synced ? 'Salvo na Nuvem' : 'Pendente'}>
                    {log.synced ? (
                      <span className="text-terminal-accent font-bold">✓</span>
                    ) : (
                      <span className="text-warning font-bold animate-pulse">⏳</span>
                    )}
                  </td>
                  <td className="p-3 text-terminal-text opacity-50">{log.data}</td>
                  <td className="p-3 text-white">
                    <span className={`px-2 py-0.5 rounded-sm border ${badgeClass} text-[0.6rem] uppercase`}>
                      {log.atividade}
                    </span>
                  </td>
                  <td className={`p-3 font-bold uppercase ${ehIndireta ? 'text-warning/80' : 'text-terminal-accent'}`}>
                    {log.colaborador}
                  </td>
                  <td className="p-3 text-para-a-direita text-white">
                    {log.volumes}
                  </td>
                  <td className="p-3 text-para-a-direita text-warning font-bold">
                    {log.horas.toFixed(2)}h
                  </td>
                  <td className="p-3 text-para-a-direita text-terminal-accent font-bold">
                    {log.vph}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => onDeleteLog(log.id)}
                      className="text-danger font-bold hover:opacity-70 cursor-pointer"
                    >
                      X
                    </button>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center p-6 text-terminal-text opacity-30 tracking-widest text-[0.6rem]">
                  BASE LOCAL VAZIA
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 flex flex-wrap gap-4 justify-espaçado items-centralizados border-t border-terminal-border/40 pt-4">
        <button
          onClick={onExportBackup}
          className="text-[0.65rem] text-info border border-info/50 hover:bg-info/20 px-3 py-1 rounded uppercase tracking-widest transition-colors cursor-pointer font-bold"
        >
          📥 Baixar Backup Completo (Todos os Dados)
        </button>
        <button
          onClick={onClearDb}
          className="text-[0.65rem] text-danger border border-danger hover:bg-danger hover:text-white px-3 py-1 rounded uppercase tracking-widest transition-colors cursor-pointer font-bold"
        >
          Apagar Base de Dados
        </button>
      </div>
    </section>
  );
}
