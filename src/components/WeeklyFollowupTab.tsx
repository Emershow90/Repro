/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Log } from '../types';
import { 
  TrendingUp, 
  Layers, 
  Calendar, 
  Users, 
  Clock, 
  Briefcase, 
  Award, 
  Share2, 
  Download, 
  Image as ImageIcon,
  CheckCircle,
  HelpCircle,
  BarChart2,
  ListOrdered
} from 'lucide-react';

// Helpers
const diasDaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function obterSemanaDoAno(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function parseDateString(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;
  return null;
}

interface WeeklyFollowupTabProps {
  logs: Log[];
  onAddToast: (msg: string, color?: string) => void;
}

export default function WeeklyFollowupTab({ logs, onAddToast }: WeeklyFollowupTabProps) {
  // Available weeks in our data
  const weeksList = Array.from(new Set(logs.map(l => l.semana))).sort((a, b) => b - a);
  
  // Local state for selected week (default to the latest week)
  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    if (weeksList.length > 0) return weeksList[0];
    return obterSemanaDoAno(new Date());
  });

  // Logs corresponding to selected week
  const weekLogs = logs.filter(l => l.semana === selectedWeek);

  // Calculate period range for the selected week
  let weekPeriodStr = "Nenhum registo de atividades";
  if (weekLogs.length > 0) {
    const dates = weekLogs.map(l => parseDateString(l.data)).filter((d): d is Date => d !== null);
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      weekPeriodStr = `${minDate.toLocaleDateString('pt-PT')} a ${maxDate.toLocaleDateString('pt-PT')}`;
    }
  }

  // --- COMPUTE EXECUTIVE DASHBOARD METRICS ---
  const totalVolumes = weekLogs.reduce((acc, l) => acc + l.volumes, 0);
  
  const horasDiretas = weekLogs
    .filter(l => l.tipo !== 'indireta')
    .reduce((acc, l) => acc + l.horas, 0);

  const horasIndiretas = weekLogs
    .filter(l => l.tipo === 'indireta')
    .reduce((acc, l) => acc + l.horas, 0);

  const totalHoras = horasDiretas + horasIndiretas;
  const colabsUnicos = Array.from(new Set(weekLogs.map(l => l.colaborador)));
  
  const vphDiretoNet = horasDiretas > 0 ? (totalVolumes / horasDiretas).toFixed(2) : "0.00";
  const vphBruto = totalHoras > 0 ? (totalVolumes / totalHoras).toFixed(2) : "0.00";

  // Summarize activities executed in the week
  const activitiesSummary = Array.from(new Set(weekLogs.map(l => l.atividade))).map(act => {
    const actLogs = weekLogs.filter(l => l.atividade === act);
    const volumes = actLogs.reduce((acc, l) => acc + l.volumes, 0);
    const horas = actLogs.reduce((acc, l) => acc + l.horas, 0);
    const isInd = actLogs[0]?.tipo === 'indireta';
    const vph = horas > 0 ? (volumes / horas).toFixed(2) : '0.00';
    return { activity: act, volumes, horas, vph, isInd };
  }).sort((a, b) => b.volumes - a.volumes);

  // Summarize operators performance
  const operatorsSummary = colabsUnicos.map(colab => {
    const colabLogs = weekLogs.filter(l => l.colaborador === colab);
    const volumes = colabLogs.reduce((acc, l) => acc + l.volumes, 0);
    const hDir = colabLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const hInd = colabLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const hTot = hDir + hInd;
    const vphNet = hDir > 0 ? (volumes / hDir).toFixed(2) : '0.00';
    return { name: colab, volumes, hDir, hInd, hTot, vphNet };
  }).sort((a, b) => b.volumes - a.volumes);

  // --- AUTOMATIC WEEKLY AND MONTHLY CONSOLIDATION ---
  // Get all unique weeks & compute totals for each
  const weeklyConsolidation = Array.from(new Set(logs.map(l => l.semana))).sort((a, b) => b - a).map(wk => {
    const wLogs = logs.filter(l => l.semana === wk);
    const wVolumes = wLogs.reduce((acc, l) => acc + l.volumes, 0);
    const wHoursDir = wLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const wHoursInd = wLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const wHoursTot = wHoursDir + wHoursInd;
    const wVph = wHoursDir > 0 ? (wVolumes / wHoursDir).toFixed(2) : '0.00';
    
    // Get date bounds
    const dates = wLogs.map(l => parseDateString(l.data)).filter((d): d is Date => d !== null);
    let rangeStr = "Sem data";
    if (dates.length > 0) {
      const minD = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
      rangeStr = `${minD.toLocaleDateString('pt-PT')} a ${maxD.toLocaleDateString('pt-PT')}`;
    }

    return { week: wk, volumes: wVolumes, hours: wHoursTot, vph: wVph, range: rangeStr };
  });

  // Get months list & compute totals for each
  const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  
  const monthlyConsolidation = Array.from(new Set(logs.map(l => {
    const d = parseDateString(l.data);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))).filter(Boolean).sort().reverse().map(ym => {
    const [year, month] = ym.split('-');
    const mIdx = parseInt(month, 10) - 1;
    const mName = mesesNomes[mIdx];

    const mLogs = logs.filter(l => {
      const d = parseDateString(l.data);
      return d ? d.getMonth() === mIdx && d.getFullYear() === parseInt(year, 10) : false;
    });

    const mVolumes = mLogs.reduce((acc, l) => acc + l.volumes, 0);
    const mHoursDir = mLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const mHoursInd = mLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
    const mHoursTot = mHoursDir + mHoursInd;
    const mVph = mHoursDir > 0 ? (mVolumes / mHoursDir).toFixed(2) : '0.00';

    return { monthYear: `${mName} ${year}`, volumes: mVolumes, hours: mHoursTot, vph: mVph };
  });

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

      // 1. Draw modern dark theme background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0f1115'); // Matte deep dark slate
      grad.addColorStop(1, '#181b21');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Aesthetic background details (tech grid Lines/circles)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Top Header Neon Emerald Stripe
      ctx.fillStyle = '#10b981'; // emerald
      ctx.fillRect(0, 0, canvas.width, 6);

      // 2. MAIN HEADER
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Helvetica';
      ctx.fillText('TERMINAL REPRO // REPORT SEMANAL', 50, 50);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Courier New';
      ctx.fillText(`MÓDULO DE SEGUIMENTO E CONTROLO OPERACIONAL // SEMANA ${selectedWeek}`, 50, 72);

      // Week period block (Right-aligned in Header)
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

      // Draw Separator line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath(); ctx.moveTo(50, 105); ctx.lineTo(canvas.width - 50, 105); ctx.stroke();

      // 3. FOUR EXECUTIVE CARDS/WIDGETS
      const cardW = 250;
      const cardH = 120;
      const cardY = 130;
      const gap = 33;
      const startX = 50;

      const cardData = [
        { title: '📦 TOTAL ENDEREÇOS (VOL)', val: totalVolumes.toLocaleString('pt-PT'), desc: 'Volumes distribuídos', color: '#38bdf8' },
        { title: '⏱ TOTAL HORAS UTILIZADAS', val: `${totalHoras.toFixed(2)}h`, desc: `Dir: ${horasDiretas.toFixed(1)}h | Ind: ${horasIndiretas.toFixed(1)}h`, color: '#fbbf24' },
        { title: '📈 PRODUTIVIDADE MÉDIA (NET)', val: `${vphDiretoNet} VPH`, desc: 'Endereços / Horas Diretas', color: '#10b981' },
        { title: '👥 COLABORADORES ATIVOS', val: colabsUnicos.length.toString(), desc: 'Operadores na escala', color: '#a78bfa' }
      ];

      cardData.forEach((c, idx) => {
        const x = startX + idx * (cardW + gap);
        // Card bg
        ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.roundRect(x, cardY, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();

        // Accent tag on card left
        ctx.fillStyle = c.color;
        ctx.fillRect(x, cardY + 15, 3, cardH - 30);

        // Titles
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9px Helvetica';
        ctx.fillText(c.title, x + 20, cardY + 30);

        // Value
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Helvetica';
        ctx.fillText(c.val, x + 20, cardY + 70);

        // Description
        ctx.fillStyle = '#64748b';
        ctx.font = 'normal 10px Helvetica';
        ctx.fillText(c.desc, x + 20, cardY + 98);
      });

      // 4. DETAILED BREAKDOWNS (TWO-COLUMN LAYOUT)
      const secY = 285;
      const secW = 515;
      const secH = 390;

      // COLUMN 1: TOP ACTIVITIES
      ctx.fillStyle = 'rgba(30, 41, 59, 0.25)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(50, secY, secW, secH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Helvetica';
      ctx.fillText('DISTRIBUIÇÃO POR ATIVIDADES', 70, secY + 30);

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(70, secY + 40); ctx.lineTo(180, secY + 40); ctx.stroke();

      // List activities
      let actY = secY + 65;
      activitiesSummary.slice(0, 7).forEach((act, idx) => {
        // Dot indicator
        ctx.fillStyle = act.isInd ? '#fbbf24' : '#10b981';
        ctx.beginPath();
        ctx.arc(75, actY - 4, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Name
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 11px Helvetica';
        let nameStr = act.activity.toUpperCase();
        if (nameStr.length > 25) nameStr = nameStr.substring(0, 22) + '...';
        ctx.fillText(nameStr, 90, actY);

        // Horas
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'normal 11px Helvetica';
        ctx.fillText(`${act.horas.toFixed(2)}h`, 270, actY);

        // Volumes
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(act.isInd ? '-' : `${act.volumes} end.`, 360, actY);

        // Vph
        ctx.fillStyle = act.isInd ? '#64748b' : '#10b981';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(act.isInd ? 'INDIRETA' : `${act.vph} VPH`, 450, actY);

        // Line separator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath(); ctx.moveTo(70, actY + 12); ctx.lineTo(secW + 30, actY + 12); ctx.stroke();

        actY += 45;
      });

      if (activitiesSummary.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'italic 11px Helvetica';
        ctx.fillText('Nenhuma atividade registada no período.', 70, secY + 70);
      }

      // COLUMN 2: TOP OPERATORS RANKING
      ctx.fillStyle = 'rgba(30, 41, 59, 0.25)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 565, secY, secW, secH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Helvetica';
      ctx.fillText('RANKING DE PRODUTIVIDADE OPERADORES', canvas.width - 545, secY + 30);

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(canvas.width - 545, secY + 40); ctx.lineTo(canvas.width - 435, secY + 40); ctx.stroke();

      // List operators
      let opY = secY + 65;
      operatorsSummary.slice(0, 7).forEach((op, idx) => {
        // Rank number
        ctx.fillStyle = idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'rgba(255, 255, 255, 0.25)';
        ctx.font = 'bold 12px Courier New';
        ctx.fillText(`#0${idx + 1}`, canvas.width - 540, opY);

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(op.name.toUpperCase(), canvas.width - 500, opY);

        // Volumes
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'normal 11px Helvetica';
        ctx.fillText(`${op.volumes.toLocaleString('pt-PT')} end.`, canvas.width - 340, opY);

        // Horas
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'normal 11px Helvetica';
        ctx.fillText(`${op.hTot.toFixed(1)}h (Tot)`, canvas.width - 250, opY);

        // Direct productivity
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px Helvetica';
        ctx.fillText(`${op.vphNet} VPH`, canvas.width - 150, opY);

        // Line separator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath(); ctx.moveTo(canvas.width - 545, opY + 12); ctx.lineTo(canvas.width - 70, opY + 12); ctx.stroke();

        opY += 45;
      });

      if (operatorsSummary.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'italic 11px Helvetica';
        ctx.fillText('Nenhum colaborador registado no período.', canvas.width - 545, secY + 70);
      }

      // 5. RODAPÉ INSTITUCIONAL
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Courier New';
      ctx.fillText(`GERADO AUTOMATICAMENTE EM ${new Date().toLocaleString('pt-PT')} // PLATAFORMA INTEGRADA REPRO v5.0 // OBSIDIAN`, 50, canvas.height - 25);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 10px Helvetica';
      ctx.fillText('[ AUTENTICADO POR SECURE INDEXEDDB ]', canvas.width - 280, canvas.height - 25);

      // Trigger actual download of the PNG
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Resumo_Executivo_Semana_${selectedWeek}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onAddToast(`Painel de Imagem Corporativa da Semana ${selectedWeek} descarregado com sucesso!`, 'var(--color-success)');
    } catch (err) {
      console.error(err);
      onAddToast("Erro ao gerar imagem executiva da semana.", 'var(--color-danger)');
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. SELETOR DE PERÍODO & CABEÇALHO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-terminal-panel/20 p-6 border border-terminal-border/30 rounded-sm gap-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-widest uppercase flex items-center gap-2">
            <Layers className="text-terminal-accent" size={16} />
            <span>Follow-up Semanal // Dashboard Executivo</span>
          </h2>
          <p className="text-[0.6rem] text-terminal-text opacity-40 uppercase tracking-widest mt-1">
            Resumos consolidados para coordenação, reuniões operacionais e partilha em canais corporativos.
          </p>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-terminal-bg px-3 py-1.5 border border-terminal-border rounded-sm">
            <span className="text-[0.55rem] text-terminal-text opacity-40 uppercase font-mono tracking-widest">Semana:</span>
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

          <button
            onClick={handleGenerateWeekImage}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 text-[0.6rem] font-bold uppercase tracking-widest bg-terminal-accent text-black hover:bg-terminal-accent/90 rounded-sm cursor-pointer transition-all shadow-md"
          >
            <ImageIcon size={12} />
            <span>Gerar Imagem da Semana</span>
          </button>
        </div>
      </div>

      {/* 2. DASHBOARD CARDS DISPLAY */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-sky-400 opacity-20 group-hover:opacity-40 transition-opacity">
            <Briefcase size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 font-mono tracking-wider">📦 Total Endereços</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {totalVolumes.toLocaleString('pt-PT')}
          </p>
          <p className="text-[0.5rem] text-sky-400/75 mt-1 font-mono uppercase tracking-widest">Endereços Registados</p>
        </div>

        {/* Card 2 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-warning opacity-20 group-hover:opacity-40 transition-opacity">
            <Clock size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 font-mono tracking-wider">⏱ Total Horas Utilizadas</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {totalHoras.toFixed(2)}h
          </p>
          <p className="text-[0.5rem] text-warning/75 mt-1 font-mono uppercase tracking-widest">
            Direto: {horasDiretas.toFixed(1)}h | Ind: {horasIndiretas.toFixed(1)}h
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-terminal-accent opacity-20 group-hover:opacity-40 transition-opacity">
            <TrendingUp size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 font-mono tracking-wider">📈 Média Produtividade</p>
          <p className="text-2xl font-bold text-terminal-accent tracking-wider mt-2">
            {vphDiretoNet} <span className="text-xs text-terminal-text opacity-50">VPH</span>
          </p>
          <p className="text-[0.5rem] text-terminal-text/50 mt-1 font-mono uppercase tracking-widest">
            Bruto Geral: {vphBruto} VPH
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-terminal-panel/15 border border-terminal-border/30 p-5 rounded-sm relative overflow-hidden group">
          <span className="absolute right-3 top-3 text-purple-400 opacity-20 group-hover:opacity-40 transition-opacity">
            <Users size={28} />
          </span>
          <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 font-mono tracking-wider">👥 Colaboradores Ativos</p>
          <p className="text-2xl font-bold text-white tracking-wider mt-2">
            {colabsUnicos.length}
          </p>
          <p className="text-[0.5rem] text-purple-400/75 mt-1 font-mono uppercase tracking-widest">Utilizadores envolvidos</p>
        </div>
      </div>

      {/* 3. DETAILED LISTS (ACTIVITIES & RANKING) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Activities */}
        <div className="border border-terminal-border/30 p-5 rounded-sm bg-terminal-panel/5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/30 pb-2 flex items-center gap-1.5">
            <BarChart2 size={13} className="text-terminal-accent" />
            <span>Resumo de Atividades Executadas (Semana {selectedWeek})</span>
          </h3>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs whitespace-nowrap font-mono">
              <thead>
                <tr className="text-[0.55rem] uppercase text-terminal-text opacity-40 border-b border-terminal-border/20">
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
                    <td colSpan={4} className="text-center py-6 text-terminal-text opacity-30 italic">
                      Nenhuma atividade registada nesta semana.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Collaborators */}
        <div className="border border-terminal-border/30 p-5 rounded-sm bg-terminal-panel/5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/30 pb-2 flex items-center gap-1.5">
            <ListOrdered size={13} className="text-terminal-accent" />
            <span>Desempenho de Operadores (Semana {selectedWeek})</span>
          </h3>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs whitespace-nowrap font-mono">
              <thead>
                <tr className="text-[0.55rem] uppercase text-terminal-text opacity-40 border-b border-terminal-border/20">
                  <th className="pb-2 font-medium">Operador</th>
                  <th className="pb-2 text-right font-medium">Endereços</th>
                  <th className="pb-2 text-right font-medium">Horas Totais</th>
                  <th className="pb-2 text-right font-medium text-terminal-accent">Produtividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/10 text-[0.65rem] text-terminal-text/80">
                {operatorsSummary.slice(0, 8).map((op, idx) => (
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
                    <td colSpan={4} className="text-center py-6 text-terminal-text opacity-30 italic">
                      Nenhum colaborador com registos nesta semana.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. AUTOMATIC CONSOLIDATION BY WEEK & MONTH */}
      <section className="bg-terminal-panel/5 border border-terminal-border/20 p-6 rounded-sm space-y-6">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-terminal-border/20 pb-2">
          [ CONSOLIDAÇÃO HISTÓRICA DE MÉTRICAS ]
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Consolidação Semanal */}
          <div className="space-y-3">
            <h4 className="text-[0.65rem] font-bold text-terminal-accent uppercase tracking-widest flex items-center gap-1">
              <Layers size={11} />
              <span>Consolidação por Semana</span>
            </h4>

            <div className="border border-terminal-border/30 rounded-sm overflow-hidden bg-terminal-bg/30">
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="bg-terminal-panel/30 text-[0.5rem] uppercase text-terminal-text opacity-40 sticky top-0">
                    <tr>
                      <th className="p-2">Identificador</th>
                      <th className="p-2">Período de Referência</th>
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
                        <td colSpan={5} className="text-center p-4 text-terminal-text opacity-30 italic">
                          A aguardar registos de lanchamento...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Consolidação Mensal */}
          <div className="space-y-3">
            <h4 className="text-[0.65rem] font-bold text-warning uppercase tracking-widest flex items-center gap-1">
              <Calendar size={11} />
              <span>Consolidação por Mês</span>
            </h4>

            <div className="border border-terminal-border/30 rounded-sm overflow-hidden bg-terminal-bg/30">
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="bg-terminal-panel/30 text-[0.5rem] uppercase text-terminal-text opacity-40 sticky top-0">
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
                        <td colSpan={4} className="text-center p-4 text-terminal-text opacity-30 italic">
                          A aguardar registos de lanchamento...
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
