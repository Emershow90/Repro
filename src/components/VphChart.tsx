/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';
import { LineChart as ChartIcon } from 'lucide-react';

interface VphChartProps {
  logs: Log[];
}

export default function VphChart({ logs }: VphChartProps) {
  // Get unique weeks from logs, sorted ascending
  const uniqueWeeks = [...new Set(logs.map(l => l.semana))].sort((a, b) => a - b);

  if (uniqueWeeks.length < 2) {
    return (
      <div className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl flex items-center justify-center p-4">
        <p className="text-[0.62rem] text-slate-400 font-mono uppercase tracking-wider text-center">
          📊 Dados insuficientes para gráfico evolutivo (necessário no mínimo 2 semanas registadas)
        </p>
      </div>
    );
  }

  const width = 800;
  const height = 200;
  const padX = 40;
  const padY = 30;

  const colorMap: { [key: string]: string } = {
    'REPRO': '#10b981',
    'ELOG': '#f59e0b',
    'DIVERSOS': '#3b82f6'
  };

  let maxVph = 0;
  const seriesData: { [key: string]: Array<{ xIdx: number; val: number; rawHrs: number }> } = {
    'REPRO': [],
    'ELOG': [],
    'DIVERSOS': []
  };

  uniqueWeeks.forEach((sem, idx) => {
    const logsOfWeek = logs.filter(l => l.semana === sem);
    ['REPRO', 'ELOG', 'DIVERSOS'].forEach(act => {
      const filtered = logsOfWeek.filter(l => {
        let isMatch = false;
        if (l.atividade === act) isMatch = true;
        if (act === 'DIVERSOS') {
          if (l.atividade === 'PENDÊNCIAS' || l.atividade === 'DIVERSOS') {
            isMatch = true;
          }
        }
        return isMatch;
      });

      const h = filtered.reduce((sum, l) => sum + l.horas, 0);
      const v = filtered.reduce((sum, l) => sum + l.volumes, 0);
      
      const vph = h > 0 ? v / h : 0;
      if (vph > maxVph) {
        maxVph = vph;
      }
      seriesData[act].push({ xIdx: idx, val: vph, rawHrs: h });
    });
  });

  maxVph = Math.ceil((maxVph + 10) / 10) * 10;
  if (maxVph === 0) {
    maxVph = 10;
  }

  const scaleX = (width - padX * 2) / (uniqueWeeks.length - 1);
  const scaleY = (height - padY * 2) / maxVph;

  // Grid Y lines
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const yVal = maxVph * (i / 4);
    const yPos = height - padY - yVal * scaleY;
    gridLines.push({ yVal, yPos });
  }

  return (
    <div className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 relative overflow-hidden backdrop-blur-md">
      <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ChartIcon size={14} />
          </div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Evolução de Produtividade (VPH)
          </h2>
        </div>
        <div className="flex gap-3 text-[0.6rem] font-bold tracking-wider font-mono">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>REPRO
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>ELOG
          </span>
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>DIV
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto scrollbar-thin">
        <div className="min-w-[600px] h-48">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            {/* Grid Y and Labels */}
            {gridLines.map((line, idx) => (
              <g key={idx}>
                <line
                  x1={padX}
                  y1={line.yPos}
                  x2={width - padX}
                  y2={line.yPos}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                  strokeDasharray="4"
                />
                <text
                  x={padX - 14}
                  y={line.yPos + 3}
                  fill="rgba(226,232,240,0.4)"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {Math.round(line.yVal)}
                </text>
              </g>
            ))}

            {/* Labels X */}
            {uniqueWeeks.map((sem, i) => {
              const xPos = padX + i * scaleX;
              return (
                <text
                  key={i}
                  x={xPos}
                  y={height - padY + 16}
                  fill="rgba(226,232,240,0.5)"
                  fontSize={10}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  S{sem}
                </text>
              );
            })}

            {/* Paths and Circles */}
            {['REPRO', 'ELOG', 'DIVERSOS'].map(act => {
              const color = colorMap[act];
              const pts = seriesData[act].filter(d => d.rawHrs > 0);
              if (pts.length === 0) return null;

              // Generate path d string
              let dStr = '';
              pts.forEach((p, i) => {
                const cx = padX + p.xIdx * scaleX;
                const cy = height - padY - p.val * scaleY;
                const prefixChar = i === 0 ? 'M' : 'L';
                dStr += `${prefixChar}${cx},${cy} `;
              });

              return (
                <g key={act}>
                  <path
                    d={dStr}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                  />
                  {pts.map((p, idx) => {
                    const cx = padX + p.xIdx * scaleX;
                    const cy = height - padY - p.val * scaleY;
                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="#0b0d13"
                        stroke={color}
                        strokeWidth={2}
                        className="transition-all hover:r-6 cursor-pointer"
                      >
                        <title>
                          {act} (S{uniqueWeeks[p.xIdx]}): {p.val.toFixed(1)} VPH
                        </title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
