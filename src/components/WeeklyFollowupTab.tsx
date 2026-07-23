/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent } from 'react';
import { Log } from '../types';
import { useFollowup } from '../hooks/useFollowup';
import { useSectorStore, VALID_SECTORS } from '../stores/sectorStore';
import { 
  testApiConnection, 
  syncOfflineQueue, 
  fetchFromCloud 
} from '../sheetService';
import { saveLog, getLogs } from '../dbLocal';
import { 
  TrendingUp, 
  Layers, 
  Calendar, 
  Users, 
  Clock, 
  Briefcase, 
  Download, 
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  BarChart2,
  ListOrdered,
  RefreshCw,
  Link as LinkIcon,
  FileSpreadsheet,
  FileText,
  ChevronDown
} from 'lucide-react';

function obterSemanaDoAno(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface WeeklyFollowupTabProps {
  logs: Log[];
  apiUrl?: string;
  onAddToast: (msg: string, color?: string) => void;
  onRefreshLogs?: () => void;
}

export default function WeeklyFollowupTab({
  logs,
  apiUrl = '',
  onAddToast,
  onRefreshLogs
}: WeeklyFollowupTabProps) {
  const { activeSectorId, updateActiveSector } = useSectorStore();

  // Available weeks list from logs
  const weeksList = Array.from(new Set(logs.map(l => l.semana))).sort((a, b) => b - a);

  // Selected week state
  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    if (weeksList.length > 0) return weeksList[0];
    return obterSemanaDoAno(new Date());
  });

  // Unsynced count calculation
  const unsyncedCount = logs.filter(l => !l.synced).length;

  // Action loading states
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // File input ref for CSV/JSON import
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Custom hook for modular Follow-up calculations
  const {
    weekLogs,
    kpis,
    activitiesSummary,
    operatorsSummary,
    weeklyConsolidation,
    monthlyConsolidation,
    weekPeriodStr
  } = useFollowup(logs, selectedWeek, activeSectorId);

  // --- CONNECTIVITY ACTIONS ---
  const handleTestConnection = async () => {
    if (!apiUrl) {
      onAddToast('URL de integração não configurada.', 'var(--color-warning)');
      return;
    }
    setIsTestingConn(true);
    onAddToast('A testar ligação com a planilha Google...', 'var(--color-info)');
    
    const res = await testApiConnection(apiUrl);
    setIsTestingConn(false);
    
    if (res.success) {
      onAddToast(res.message, 'var(--color-success)');
    } else {
      onAddToast(res.message, 'var(--color-danger)');
    }
  };

  const handleSyncQueue = async () => {
    if (!apiUrl) {
      onAddToast('Configure a URL de integração da planilha nas definições.', 'var(--color-warning)');
      return;
    }
    setIsSyncing(true);
    onAddToast('A sincronizar registos com a aba Controle de horas - Repro...', 'var(--color-info)');

    try {
      const res = await syncOfflineQueue(apiUrl);
      if (onRefreshLogs) onRefreshLogs();

      if (res.successCount > 0) {
        onAddToast(`${res.successCount} registos sincronizados com sucesso!`, 'var(--color-success)');
      } else if (res.failedCount > 0) {
        onAddToast(`Falha ao enviar ${res.failedCount} registos. Tente novamente.`, 'var(--color-danger)');
      } else {
        onAddToast('Todos os registos já se encontram sincronizados.', 'var(--color-success)');
      }
    } catch (err) {
      console.error(err);
      onAddToast('Erro durante a sincronização.', 'var(--color-danger)');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportFromGoogleSheet = async () => {
    if (!apiUrl) {
      onAddToast('URL de integração não configurada.', 'var(--color-warning)');
      return;
    }
    setIsImporting(true);
    onAddToast('A descarregar dados da aba Controle de horas - Repro...', 'var(--color-info)');

    try {
      const cloudLogs = await fetchFromCloud(apiUrl);
      const localLogs = await getLogs();
      let importedCount = 0;

      for (const remote of cloudLogs) {
        const exists = localLogs.some(l => String(l.id) === String(remote.id));
        if (!exists) {
          await saveLog(remote);
          importedCount++;
        }
      }

      if (importedCount > 0) {
        onAddToast(`${importedCount} novos registos importados com sucesso!`, 'var(--color-success)');
        if (onRefreshLogs) onRefreshLogs();
      } else {
        onAddToast('A base local já se encontra totalmente atualizada com a planilha.', 'var(--color-info)');
      }
    } catch (err: any) {
      console.error(err);
      onAddToast(`Erro na importação: ${err.message || 'Falha de rede'}`, 'var(--color-danger)');
    } finally {
      setIsImporting(false);
    }
  };

  // --- FILE IMPORT / EXPORT ACTIONS ---
  const handleExportCSV = () => {
    setShowExportMenu(false);
    if (logs.length === 0) {
      onAddToast('Sem registos para exportar.', 'var(--color-warning)');
      return;
    }

    const headers = ['Setor', 'Data', 'Semana', 'O que foi feito no Repro', 'Colaborador', 'QTD endereços', 'Horas usadas', 'Produtividade VPH', 'Tipo'];
    const rows = logs.map(l => [
      l.setor || '87',
      l.data,
      l.semana,
      `"${l.atividade.replace(/"/g, '""')}"`,
      `"${l.colaborador.replace(/"/g, '""')}"`,
      l.volumes,
      l.horas.toFixed(2),
      l.vph,
      l.tipo
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Controle_de_horas_Repro_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddToast('Ficheiro CSV exportado com sucesso!', 'var(--color-success)');
  };

  const handleExportJSON = () => {
    setShowExportMenu(false);
    if (logs.length === 0) {
      onAddToast('Sem registos para exportar.', 'var(--color-warning)');
      return;
    }

    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Controle_de_horas_Repro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddToast('Ficheiro JSON exportado com sucesso!', 'var(--color-success)');
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      try {
        let newLogs: Log[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            newLogs = parsed;
          }
        } else {
          // Parse CSV
          const lines = content.split(/\r\n|\n/).filter(line => line.trim().length > 0);
          if (lines.length > 1) {
            const separator = lines[0].includes(';') ? ';' : ',';
            const headers = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
              if (cols.length < 3) continue;

              const row: Record<string, string> = {};
              headers.forEach((h, idx) => {
                row[h] = cols[idx] || '';
              });

              const setor = row['setor'] || '87';
              const dataStr = row['data'] || new Date().toLocaleDateString('pt-PT');
              const semana = parseInt(row['semana'] || '1', 10);
              const atividade = row['o que foi feito no repro'] || row['atividade'] || 'Repro';
              const colaborador = (row['colaborador'] || 'OPERADOR').toUpperCase();
              const parsePtFloat = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0;
              const volumes = parsePtFloat(row['qtd endereços'] || row['qtd enderecos'] || row['volumes'] || '0');
              const horas = parsePtFloat(row['horas usadas'] || row['horas'] || '0');
              const vph = horas > 0 ? (volumes / horas).toFixed(2) : '0.00';
              const isInd = ['treinamentos', 'reuniões', 'reunioes', 'inventário', 'inventario', 'gestão de estoque'].some(t => atividade.toLowerCase().includes(t));

              newLogs.push({
                id: Date.now() + i,
                data: dataStr,
                dia: 'Segunda',
                semana: semana || 1,
                atividade,
                colaborador,
                volumes,
                horas,
                vph,
                timestamp: Date.now() - i,
                synced: false,
                tipo: isInd ? 'indireta' : 'direta',
                setor
              });
            }
          }
        }

        if (newLogs.length > 0) {
          const localLogs = await getLogs();
          let count = 0;
          for (const nl of newLogs) {
            const exists = localLogs.some(l => l.id === nl.id || (l.data === nl.data && l.colaborador === nl.colaborador && l.atividade === nl.atividade && l.horas === nl.horas));
            if (!exists) {
              await saveLog(nl);
              count++;
            }
          }

          if (count > 0) {
            onAddToast(`${count} registos importados do ficheiro!`, 'var(--color-success)');
            if (onRefreshLogs) onRefreshLogs();
          } else {
            onAddToast('Todos os registos do ficheiro já existem na base local.', 'var(--color-info)');
          }
        } else {
          onAddToast('Não foi possível ler dados válidos do ficheiro.', 'var(--color-danger)');
        }
      } catch (err) {
        console.error(err);
        onAddToast('Erro ao processar ficheiro.', 'var(--color-danger)');
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- GENERATE CORPORATE IMAGE (PNG) USING CANVAS ---
  const handleGenerateWeekImage = () => {
    if (weekLogs.length === 0) {
      onAddToast("Não existem registos nesta semana para gerar imagem.", 'var(--color-danger)');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 760;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0f1115');
      grad.addColorStop(1, '#181b21');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid pattern
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Top Header Accent Stripe
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, 0, canvas.width, 6);

      // Main Header
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Helvetica';
      ctx.fillText(`TERMINAL REPRO // REPORT SEMANA ${selectedWeek}`, 50, 50);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Courier New';
      const sectorLabel = activeSectorId === 'todos' ? 'TODOS OS SETORES (87, 88, 89, 90)' : `SETOR ${activeSectorId}`;
      ctx.fillText(`MÓDULO DE SEGUIMENTO E CONTROLO OPERACIONAL // ${sectorLabel}`, 50, 72);

      // Week period block (Right)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 450, 30, 400, 50, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px Helvetica';
      ctx.fillText('PERÍODO CONSOLIDADO', canvas.width - 435, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Helvetica';
      ctx.fillText(weekPeriodStr.toUpperCase(), canvas.width - 435, 68);

      // Separator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath(); ctx.moveTo(50, 105); ctx.lineTo(canvas.width - 50, 105); ctx.stroke();

      // Cards
      const cardW = 250;
      const cardH = 120;
      const cardY = 130;
      const gap = 33;
      const startX = 50;

      const cardData = [
        { title: '📦 TOTAL ENDEREÇOS', val: kpis.totalVolumes.toLocaleString('pt-PT'), desc: 'Volumes auditados', color: '#38bdf8' },
        { title: '⏱ TOTAL HORAS', val: `${kpis.totalHoras.toFixed(2)}h`, desc: `Dir: ${kpis.horasDiretas.toFixed(1)}h | Ind: ${kpis.horasIndiretas.toFixed(1)}h`, color: '#fbbf24' },
        { title: '📈 PRODUTIVIDADE (NET)', val: `${kpis.vphNet} VPH`, desc: 'Endereços / Horas Diretas', color: '#10b981' },
        { title: '👥 OPERADORES', val: operatorsSummary.length.toString(), desc: 'Colaboradores no setor', color: '#a78bfa' }
      ];

      cardData.forEach((c, idx) => {
        const x = startX + idx * (cardW + gap);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.roundRect(x, cardY, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = c.color;
        ctx.font = 'bold 10px Helvetica';
        ctx.fillText(c.title, x + 15, cardY + 28);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Helvetica';
        ctx.fillText(c.val, x + 15, cardY + 68);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Helvetica';
        ctx.fillText(c.desc, x + 15, cardY + 98);
      });

      // Activities list (Left column)
      const secY = 280;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Helvetica';
      ctx.fillText('RESUMO DE ATIVIDADES', 50, secY + 20);

      let actY = secY + 55;
      activitiesSummary.slice(0, 7).forEach((act) => {
        ctx.fillStyle = act.isInd ? '#fbbf24' : '#10b981';
        ctx.beginPath(); ctx.arc(55, actY - 4, 4, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Helvetica';
        ctx.fillText(act.activity.toUpperCase(), 70, actY);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Courier New';
        ctx.fillText(`${act.volumes.toLocaleString('pt-PT')} end. | ${act.horas.toFixed(2)}h | ${act.isInd ? 'INDIR.' : act.vph + ' VPH'}`, 280, actY);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath(); ctx.moveTo(50, actY + 10); ctx.lineTo(550, actY + 10); ctx.stroke();
        actY += 40;
      });

      // Operators ranking (Right column)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Helvetica';
      ctx.fillText('RANKING DE OPERADORES', canvas.width - 545, secY + 20);

      let opY = secY + 55;
      operatorsSummary.slice(0, 7).forEach((op, idx) => {
        ctx.fillStyle = idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'rgba(255, 255, 255, 0.25)';
        ctx.font = 'bold 12px Courier New';
        ctx.fillText(`#0${idx + 1}`, canvas.width - 540, opY);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(op.name.toUpperCase(), canvas.width - 500, opY);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'normal 11px Helvetica';
        ctx.fillText(`${op.volumes.toLocaleString('pt-PT')} end.`, canvas.width - 340, opY);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'normal 11px Helvetica';
        ctx.fillText(`${op.hTot.toFixed(1)}h`, canvas.width - 240, opY);

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(`${op.vphNet} VPH`, canvas.width - 150, opY);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath(); ctx.moveTo(canvas.width - 545, opY + 10); ctx.lineTo(canvas.width - 70, opY + 10); ctx.stroke();

        opY += 40;
      });

      // Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Courier New';
      ctx.fillText(`GERADO EM ${new Date().toLocaleString('pt-PT')} // PLATAFORMA INTEGRADA REPRO // ABA CONTROLE DE HORAS - REPRO`, 50, canvas.height - 25);

      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Report_Followup_Semana_${selectedWeek}_Setor_${activeSectorId}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onAddToast(`Relatório visual gerado e descarregado com sucesso!`, 'var(--color-success)');
    } catch (err) {
      console.error(err);
      onAddToast("Erro ao gerar imagem executiva.", 'var(--color-danger)');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv,.json,.txt"
        className="hidden"
      />

      {/* 1. SECTOR FOCUS & WEEK PERIOD HEADER CONTROL */}
      <div className="bg-terminal-panel/30 p-5 border border-terminal-border/40 rounded-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-terminal-border/30 pb-4">
          <div>
            <h2 className="text-sm font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <Layers className="text-terminal-accent" size={18} />
              <span>Follow-up Semanal // Torre de Comando Operacional</span>
            </h2>
            <p className="text-[0.6rem] text-terminal-text opacity-50 uppercase tracking-widest mt-1">
              Consolidação de horas, produtividade VPH e gestão da aba 'Controle de horas - Repro'.
            </p>
          </div>

          {/* Week Selector */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-2 bg-terminal-bg px-3.5 py-1.5 border border-terminal-border rounded-sm">
              <Calendar className="text-terminal-accent" size={13} />
              <span className="text-[0.55rem] text-terminal-text opacity-60 uppercase font-mono tracking-widest">Semana:</span>
              <select
                value={selectedWeek}
                onChange={e => setSelectedWeek(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-mono font-bold text-terminal-accent focus:outline-none cursor-pointer h-[24px]"
              >
                {weeksList.length > 0 ? (
                  weeksList.map(wk => (
                    <option key={wk} value={wk} className="bg-terminal-panel text-white">Semana {wk}</option>
                  ))
                ) : (
                  <option value={obterSemanaDoAno(new Date())}>Semana Atual</option>
                )}
              </select>
            </div>

            <span className="text-[0.6rem] font-mono text-terminal-accent/90 bg-terminal-accent/10 border border-terminal-accent/30 px-3 py-1.5 rounded-sm uppercase tracking-wider hidden sm:inline-block">
              {weekPeriodStr}
            </span>
          </div>
        </div>

        {/* SETOR FILTER BUTTONS (87, 88, 89, 90, TODOS) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-terminal-bg/60 p-2.5 border border-terminal-border/30 rounded-sm">
          <div className="flex items-center gap-2">
            <span className="text-[0.55rem] font-bold uppercase tracking-widest text-terminal-accent font-mono">
              Foco Setorial:
            </span>
            <span className="text-[0.6rem] text-white/70 font-mono">
              {activeSectorId === 'todos' ? 'Todos os Setores (87, 88, 89, 90)' : `Setor ${activeSectorId}`}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => updateActiveSector('todos', onAddToast)}
              className={`px-3 py-1 text-[0.6rem] font-bold font-mono uppercase rounded-sm border transition-all cursor-pointer ${
                activeSectorId === 'todos'
                  ? 'bg-terminal-accent text-black border-terminal-accent font-black shadow-sm'
                  : 'bg-terminal-panel/40 border-terminal-border/60 text-terminal-text hover:text-white'
              }`}
            >
              Todos (87-90)
            </button>
            {VALID_SECTORS.map(sec => (
              <button
                key={sec}
                onClick={() => updateActiveSector(sec, onAddToast)}
                className={`px-3 py-1 text-[0.6rem] font-bold font-mono uppercase rounded-sm border transition-all cursor-pointer ${
                  activeSectorId === sec
                    ? 'bg-terminal-accent text-black border-terminal-accent font-black shadow-sm'
                    : 'bg-terminal-panel/40 border-terminal-border/60 text-terminal-text hover:text-white'
                }`}
              >
                Setor {sec}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. ORGANIZED ACTION BAR (2 CLEAN CARDS: INTEGRATION & FILES/REPORTS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card A: Google Sheets Integration */}
        <div className="bg-terminal-panel/20 p-4 border border-terminal-border/30 rounded-sm flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-terminal-border/20 pb-2">
            <div className="flex items-center gap-2">
              <LinkIcon size={14} className="text-terminal-accent" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Sincronização Google Sheets
              </span>
            </div>
            {apiUrl ? (
              <span className="text-[0.5rem] bg-terminal-accent/10 border border-terminal-accent/40 text-terminal-accent px-2 py-0.5 rounded-sm uppercase tracking-widest font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
                <span>Conectado</span>
              </span>
            ) : (
              <span className="text-[0.5rem] bg-warning/10 border border-warning/40 text-warning px-2 py-0.5 rounded-sm uppercase tracking-widest font-mono">
                Sem URL
              </span>
            )}
          </div>

          <p className="text-[0.55rem] text-terminal-text opacity-50 font-mono">
            Aba de Destino: <strong className="text-white">Controle de horas - Repro</strong>
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleSyncQueue}
              disabled={isSyncing}
              className={`px-3.5 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider border rounded-sm cursor-pointer transition-all flex items-center gap-1.5 ${
                unsyncedCount > 0 
                  ? 'bg-terminal-accent text-black border-terminal-accent hover:bg-terminal-accent/90 shadow-sm' 
                  : 'bg-terminal-panel border-terminal-accent/40 text-terminal-accent hover:bg-terminal-accent/10'
              }`}
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Sincronizando...' : `Sincronizar Fila ${unsyncedCount > 0 ? `(${unsyncedCount})` : ''}`}</span>
            </button>

            <button
              onClick={handleImportFromGoogleSheet}
              disabled={isImporting}
              className="px-3.5 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider bg-terminal-panel border border-sky-500/50 text-sky-400 hover:bg-sky-500/10 rounded-sm cursor-pointer transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet size={12} />
              <span>{isImporting ? 'Importando...' : 'Importar Planilha'}</span>
            </button>

            <button
              onClick={handleTestConnection}
              disabled={isTestingConn}
              className="px-3 py-1.5 text-[0.55rem] font-bold uppercase tracking-wider bg-terminal-panel border border-terminal-border text-terminal-text/80 hover:text-white hover:border-terminal-accent/60 rounded-sm cursor-pointer transition-all flex items-center gap-1"
            >
              <CheckCircle2 size={11} className="text-terminal-accent" />
              <span>{isTestingConn ? 'Testando...' : 'Testar Conexão'}</span>
            </button>
          </div>
        </div>

        {/* Card B: Files & Executive Reports */}
        <div className="bg-terminal-panel/20 p-4 border border-terminal-border/30 rounded-sm flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-terminal-border/20 pb-2">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-terminal-accent" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Ficheiros e Relatórios Executivos
              </span>
            </div>
            <span className="text-[0.5rem] bg-terminal-border/30 text-terminal-text px-2 py-0.5 rounded-sm uppercase tracking-widest font-mono">
              Export / Import
            </span>
          </div>

          <p className="text-[0.55rem] text-terminal-text opacity-50 font-mono">
            Gerar relatório em imagem para partilha corporativa ou cópia de segurança em CSV/JSON.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1 relative">
            <button
              onClick={handleGenerateWeekImage}
              className="px-3.5 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider bg-terminal-accent text-black hover:bg-terminal-accent/90 rounded-sm cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
            >
              <ImageIcon size={12} />
              <span>Report PNG</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider bg-terminal-panel border border-terminal-border text-white hover:border-terminal-accent rounded-sm cursor-pointer transition-all flex items-center gap-1.5"
            >
              <Upload size={12} />
              <span>Importar Ficheiro</span>
            </button>

            {/* Export Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider bg-terminal-panel border border-terminal-border text-terminal-text hover:text-white hover:border-terminal-accent rounded-sm cursor-pointer transition-all flex items-center gap-1"
              >
                <Download size={12} />
                <span>Exportar</span>
                <ChevronDown size={12} />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 bottom-full mb-1 w-44 bg-terminal-panel border border-terminal-border shadow-xl rounded-sm z-50 overflow-hidden font-mono text-[0.65rem]">
                  <button
                    onClick={handleExportCSV}
                    className="w-full text-left px-3 py-2 text-white hover:bg-terminal-bg hover:text-terminal-accent transition-colors flex items-center gap-2"
                  >
                    <Download size={12} />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="w-full text-left px-3 py-2 text-white hover:bg-terminal-bg hover:text-terminal-accent transition-colors flex items-center gap-2 border-t border-terminal-border/30"
                  >
                    <FileText size={12} />
                    <span>Backup JSON</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. EXECUTIVE KPI METRICS DASHBOARD */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-sky-400 opacity-20 group-hover:opacity-40 transition-opacity">
            <Briefcase size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-mono tracking-wider">📦 Total Endereços</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {kpis.totalVolumes.toLocaleString('pt-PT')}
          </p>
          <p className="text-[0.5rem] text-sky-400 mt-1 font-mono uppercase tracking-widest">Endereços Auditados</p>
        </div>

        {/* Card 2 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-warning opacity-20 group-hover:opacity-40 transition-opacity">
            <Clock size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-mono tracking-wider">⏱ Total Horas Utilizadas</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {kpis.totalHoras.toFixed(2)}h
          </p>
          <p className="text-[0.5rem] text-warning mt-1 font-mono uppercase tracking-widest">
            Direto: {kpis.horasDiretas.toFixed(1)}h | Ind: {kpis.horasIndiretas.toFixed(1)}h
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-terminal-accent opacity-20 group-hover:opacity-40 transition-opacity">
            <TrendingUp size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-mono tracking-wider">📈 Produtividade Líquida</p>
          <p className="text-2xl font-bold text-terminal-accent tracking-wider mt-2">
            {kpis.vphNet} <span className="text-xs text-terminal-text opacity-50">VPH</span>
          </p>
          <p className="text-[0.5rem] text-terminal-text/60 mt-1 font-mono uppercase tracking-widest">
            VPH Bruto: {kpis.vphBruto}
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-purple-400 opacity-20 group-hover:opacity-40 transition-opacity">
            <Users size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-mono tracking-wider">👥 Colaboradores Ativos</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {operatorsSummary.length}
          </p>
          <p className="text-[0.5rem] text-purple-400 mt-1 font-mono uppercase tracking-widest">
            {kpis.logCount} Registos na Semana {selectedWeek}
          </p>
        </div>
      </div>

      {/* 4. DETAILED TABLES (ACTIVITIES & OPERATORS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Table: Activities */}
        <div className="border border-terminal-border/30 p-5 rounded-sm bg-terminal-panel/5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/30 pb-2 flex items-center gap-1.5">
            <BarChart2 size={13} className="text-terminal-accent" />
            <span>Resumo de Atividades Executadas (Semana {selectedWeek})</span>
          </h3>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs whitespace-nowrap font-mono">
              <thead>
                <tr className="text-[0.55rem] uppercase text-terminal-text opacity-50 border-b border-terminal-border/20">
                  <th className="pb-2 font-medium">Atividade</th>
                  <th className="pb-2 text-right font-medium">Endereços</th>
                  <th className="pb-2 text-right font-medium">Horas</th>
                  <th className="pb-2 text-right font-medium text-terminal-accent">Produtividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/10 text-[0.65rem] text-terminal-text/80">
                {activitiesSummary.map((act, idx) => (
                  <tr key={idx} className="hover:bg-terminal-bg/50">
                    <td className="py-2.5 font-bold uppercase text-white">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${act.isInd ? 'bg-warning' : 'bg-terminal-accent'}`} />
                      {act.activity}
                    </td>
                    <td className="py-2.5 text-right text-white">
                      {act.isInd ? '-' : act.volumes.toLocaleString('pt-PT')}
                    </td>
                    <td className="py-2.5 text-right font-bold text-warning">{act.horas.toFixed(2)}h</td>
                    <td className="py-2.5 text-right font-bold text-terminal-accent">
                      {act.isInd ? 'INDIRETA' : `${act.vph} VPH`}
                    </td>
                  </tr>
                ))}
                {activitiesSummary.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-terminal-text opacity-40 italic">
                      Nenhuma atividade registada para esta semana no setor selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Table: Operator Performance Ranking */}
        <div className="border border-terminal-border/30 p-5 rounded-sm bg-terminal-panel/5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/30 pb-2 flex items-center gap-1.5">
            <ListOrdered size={13} className="text-terminal-accent" />
            <span>Desempenho de Operadores (Semana {selectedWeek})</span>
          </h3>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs whitespace-nowrap font-mono">
              <thead>
                <tr className="text-[0.55rem] uppercase text-terminal-text opacity-50 border-b border-terminal-border/20">
                  <th className="pb-2 font-medium">Operador</th>
                  <th className="pb-2 text-right font-medium">Endereços</th>
                  <th className="pb-2 text-right font-medium">Horas Totais</th>
                  <th className="pb-2 text-right font-medium text-terminal-accent">Produtividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/10 text-[0.65rem] text-terminal-text/80">
                {operatorsSummary.map((op, idx) => (
                  <tr key={idx} className="hover:bg-terminal-bg/50">
                    <td className="py-2.5 font-bold uppercase text-white flex items-center gap-2">
                      <span className="text-[0.65rem] font-bold text-terminal-text/40">#0{idx + 1}</span>
                      <span>{op.name}</span>
                    </td>
                    <td className="py-2.5 text-right text-white">
                      {op.volumes.toLocaleString('pt-PT')}
                    </td>
                    <td className="py-2.5 text-right font-bold text-warning">
                      {op.hTot.toFixed(2)}h
                    </td>
                    <td className="py-2.5 text-right font-bold text-terminal-accent">
                      {op.vphNet} VPH
                    </td>
                  </tr>
                ))}
                {operatorsSummary.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-terminal-text opacity-40 italic">
                      Nenhum colaborador com registos nesta semana.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. HISTORICAL CONSOLIDATION BY WEEK & MONTH */}
      <section className="bg-terminal-panel/5 border border-terminal-border/20 p-5 rounded-sm space-y-6">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/20 pb-2">
          [ CONSOLIDAÇÃO HISTÓRICA DE MÉTRICAS OPERACIONAIS ]
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weekly Consolidation */}
          <div className="space-y-3">
            <h4 className="text-[0.65rem] font-bold text-terminal-accent uppercase tracking-widest flex items-center gap-1">
              <Layers size={11} />
              <span>Consolidação por Semana</span>
            </h4>

            <div className="border border-terminal-border/30 rounded-sm overflow-hidden bg-terminal-bg/30">
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="bg-terminal-panel/30 text-[0.5rem] uppercase text-terminal-text opacity-50 sticky top-0">
                    <tr>
                      <th className="p-2">Identificador</th>
                      <th className="p-2">Período</th>
                      <th className="p-2 text-right">Endereços</th>
                      <th className="p-2 text-right">Horas</th>
                      <th className="p-2 text-right text-terminal-accent">VPH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-terminal-border/10 text-[0.65rem] text-terminal-text/80">
                    {weeklyConsolidation.map((wc, idx) => (
                      <tr key={idx} className="hover:bg-terminal-bg/60">
                        <td className="p-2 font-bold text-white">Semana {wc.week}</td>
                        <td className="p-2 opacity-50 text-[0.6rem]">{wc.range}</td>
                        <td className="p-2 text-right text-white font-bold">{wc.volumes.toLocaleString('pt-PT')}</td>
                        <td className="p-2 text-right text-warning">{wc.hours.toFixed(2)}h</td>
                        <td className="p-2 text-right text-terminal-accent font-bold">{wc.vph}</td>
                      </tr>
                    ))}
                    {weeklyConsolidation.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-4 text-terminal-text opacity-40 italic">
                          A aguardar registos operacionais...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Monthly Consolidation */}
          <div className="space-y-3">
            <h4 className="text-[0.65rem] font-bold text-warning uppercase tracking-widest flex items-center gap-1">
              <Calendar size={11} />
              <span>Consolidação por Mês</span>
            </h4>

            <div className="border border-terminal-border/30 rounded-sm overflow-hidden bg-terminal-bg/30">
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="bg-terminal-panel/30 text-[0.5rem] uppercase text-terminal-text opacity-50 sticky top-0">
                    <tr>
                      <th className="p-2">Mês / Ano</th>
                      <th className="p-2 text-right">Endereços</th>
                      <th className="p-2 text-right">Horas Totais</th>
                      <th className="p-2 text-right text-warning">VPH Bruto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-terminal-border/10 text-[0.65rem] text-terminal-text/80">
                    {monthlyConsolidation.map((mc, idx) => (
                      <tr key={idx} className="hover:bg-terminal-bg/60">
                        <td className="p-2 font-bold text-white">{mc.monthYear}</td>
                        <td className="p-2 text-right text-white font-bold">{mc.volumes.toLocaleString('pt-PT')}</td>
                        <td className="p-2 text-right text-warning">{mc.hours.toFixed(2)}h</td>
                        <td className="p-2 text-right text-terminal-accent font-bold">{mc.vph}</td>
                      </tr>
                    ))}
                    {monthlyConsolidation.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center p-4 text-terminal-text opacity-40 italic">
                          A aguardar registos operacionais...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
