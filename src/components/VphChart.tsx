/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from '../types';

interface VphChartProps {
  logs: Log[];
}

export default function VphChart({ logs }: VphChartProps) {
  // Get unique weeks from logs, sorted ascending
  const uniqueWeeks = [...new Set(logs.map(l => l.semana))].sort((a, b) => a - b);

  if (uniqueWeeks.length < 2) {
    return (
      <div className="w-full h-48 bg-terminal-bg/50 border border-terminal-border/40 rounded-sm flex items-centralizados justify-centralizado">
        <p className="text-[0.6rem] text-terminal-text opacity-45 uppercase tracking-widest text-center">
          DADOS INSUFICIENTES PARA EVOLUÇÃO (MÍNIMO 2 SEMANAS REGISTADAS)
        </p>
      </div>
    );
  }

  const width = 800;
  const height = 200;
  const padX = 40;
  const padY = 30;

  const colorMap: { [key: string]: string } = {
    'REPRO': 'var(--color-success)',
    'ELOG': 'var(--color-warning)',
    'DIVERSOS': 'var(--color-info)'
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
    <div className="w-full bg-terminal-bg/50 border border-terminal-border/40 rounded-sm p-4">
      <div className="flex justify-espaçado items-centralizados mb-4 pb-2 border-b border-terminal-border/40">
        <h2 className="text-xs font-bold text-white uppercase tracking-widest opacity-60">
          [EVOLUÇÃO DE PRODUTIVIDADE (VPH)]
        </h2>
        <div className="flex gap-4 text-[0.55rem] font-bold tracking-widest">
          <span className="flex items-centralizados gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>REPRO
          </span>
          <span className="flex items-centralizados gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>ELOG
          </span>
          <span className="flex items-centralizados gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-info"></span>DIVERSOS
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
                  stroke="var(--color-terminal-border)"
                  strokeWidth={1}
                  strokeOpacity={0.3}
                  strokeDasharray="4"
                />
                <text
                  x={padX - 14}
                  y={line.yPos + 3}
                  fill="var(--color-terminal-text)"
                  fillOpacity={0.4}
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
                  y={height - padY + 15}
                  fill="var(--color-terminal-text)"
                  fillOpacity={0.4}
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="monospace"
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
                    className="chart-line"
                    stroke={color}
                    strokeWidth={1.5}
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
                        r={3.5}
                        fill="var(--color-terminal-panel)"
                        stroke={color}
                        strokeWidth={1.5}
                        className="chart-point"
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
