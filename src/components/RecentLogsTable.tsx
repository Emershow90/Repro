/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { pingGoogleSheetsEndpoint } from '../sheetService';

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
    <section className="border-panel p-6 rounded-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-terminal-border/40 pb-3 gap-2">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
            REGISTO DE OPERAÇÕES RECENTES
          </h2>
          <p className="text-[0.55rem] tracking-widest text-terminal-text opacity-40 mt-1">
            Leitura e distribuição segura em tempo real
          </p>
        </div>

        {apiUrl && (
          <button
            onClick={handleTestConnection}
            className="text-[0.55rem] font-bold uppercase tracking-wider bg-terminal-panel border border-terminal-border text-terminal-text/80 hover:text-terminal-accent hover:border-terminal-accent px-2.5 py-1 rounded-sm cursor-pointer transition-all flex items-center gap-1 font-mono"
            title="Clique para executar um ping rápido e ver logs detalhados no console"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
            <span>Testar Conexão (Ping)</span>
          </button>
        )}
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-40 border-b border-terminal-border/40 bg-terminal-bg/50">
              <th className="p-3 font-medium text-center">Nuvem</th>
              <th className="p-3 font-medium">Setor</th>
              <th className="p-3 font-medium">Data</th>
              <th className="p-3 font-medium text-white">Atividade</th>
              <th className="p-3 font-medium text-terminal-accent">Colaborador</th>
              <th className="p-3 font-medium text-right">Volumes</th>
              <th className="p-3 font-medium text-right">Horas</th>
              <th className="p-3 font-medium text-right text-terminal-accent">VPH</th>
              <th className="p-3 font-medium text-center">Ações / Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-terminal-border/40 text-[0.7rem] font-medium text-terminal-text/80">
            {logs.slice(0, 15).map((log) => {
              const ehIndireta = log.tipo === 'indireta';
              const isFailed = !log.synced;
              
              const badgeClass = ehIndireta
                ? 'border-warning/30 text-warning bg-warning/5'
                : 'border-terminal-accent/30 text-terminal-accent bg-terminal-accent/5';

              const rowBgClass = isFailed
                ? 'bg-danger/10 border-l-4 border-l-danger border-b border-danger/30 text-danger/90 hover:bg-danger/15'
                : 'hover:bg-terminal-bg border-b border-terminal-border/40';

              return (
                <tr key={log.id} className={`${rowBgClass} transition-colors`}>
                  <td 
                    className="p-3 text-center cursor-pointer" 
                    title={log.synced ? 'Sincronizado na Nuvem (Clique para testar conexão)' : 'Falha na Sincronização (Clique para testar conexão)'}
                    onClick={handleTestConnection}
                  >
                    {log.synced ? (
                      <span className="text-terminal-accent font-bold px-1.5 py-0.5 bg-terminal-accent/10 border border-terminal-accent/30 rounded-sm">✓ Nuvem</span>
                    ) : (
                      <span className="text-danger font-bold px-1.5 py-0.5 bg-danger/20 border border-danger/50 rounded-sm flex items-center justify-center gap-1 animate-pulse">
                        ⚠️ FALHO
                      </span>
                    )}
                  </td>
                  <td className={`p-3 font-mono font-bold ${isFailed ? 'text-danger' : 'text-terminal-accent'}`}>
                    Setor {log.setor || '87'}
                  </td>
                  <td className="p-3 text-terminal-text opacity-70">{log.data}</td>
                  <td className="p-3 text-white">
                    <span className={`px-2 py-0.5 rounded-sm border ${badgeClass} text-[0.6rem] uppercase`}>
                      {log.atividade}
                    </span>
                  </td>
                  <td className={`p-3 font-bold uppercase ${isFailed ? 'text-danger' : ehIndireta ? 'text-warning/80' : 'text-terminal-accent'}`}>
                    {log.colaborador}
                  </td>
                  <td className="p-3 text-right text-white font-mono">
                    {log.volumes}
                  </td>
                  <td className={`p-3 text-right font-mono font-bold ${isFailed ? 'text-danger' : 'text-warning'}`}>
                    {log.horas.toFixed(2)}h
                  </td>
                  <td className={`p-3 text-right font-mono font-bold ${isFailed ? 'text-danger' : 'text-terminal-accent'}`}>
                    {log.vph}
                  </td>
                  <td className="p-3 text-center flex items-center justify-center gap-2">
                    {!log.synced && onRetrySync && (
                      <button
                        onClick={() => onRetrySync(log)}
                        className="px-2 py-1 text-[0.55rem] font-bold uppercase tracking-wider bg-danger/20 border border-danger/60 text-danger hover:bg-danger hover:text-white rounded-sm cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                        title="Tentar enviar novamente para o Google Sheets"
                      >
                        🔄 Tentar Novamente
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteLog(log.id)}
                      className="text-danger/80 hover:text-danger font-bold hover:bg-danger/10 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                      title="Excluir Registro"
                    >
                      X
                    </button>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center p-6 text-terminal-text opacity-30 tracking-widest text-[0.6rem]">
                  BASE LOCAL VAZIA
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 flex flex-wrap gap-4 justify-between items-center border-t border-terminal-border/40 pt-4">
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
