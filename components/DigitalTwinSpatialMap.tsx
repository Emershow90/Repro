/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MAPA 2D / 3D: Digital Twin & Planta Espacial Interativa
 * LOGIX WMS Core // Terminal Repro - Auditoria & Gestão Espacial
 */

import React, { useState } from 'react';
import {
  Layers,
  Compass,
  Radio,
  Warehouse,
  RotateCcw,
  Route,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Box,
  TrendingUp,
  Sliders,
  Maximize2
} from 'lucide-react';
import { ArticleAddressRecord } from '../services/articleAddressService';

interface DigitalTwinSpatialMapProps {
  records?: ArticleAddressRecord[];
  onNotify?: (msg: string, color?: string) => void;
  onNavigateToStreet?: (street: string) => void;
}

export const DigitalTwinSpatialMap: React.FC<DigitalTwinSpatialMapProps> = ({
  records = [],
  onNotify,
  onNavigateToStreet
}) => {
  // Visualizador e Câmera
  const [viewMode, setViewMode] = useState<'3D' | 'SPLIT' | '2D'>('3D');
  const [selectedSector, setSelectedSector] = useState<string>('87');
  const [activeLayer, setActiveLayer] = useState<'CHAO' | 'PULMAO' | 'WIREFRAME' | 'HEATMAP'>('HEATMAP');
  const [focusedStreet, setFocusedStreet] = useState<string>('B4VD02');
  const [dominantSku, setDominantSku] = useState<string>('789100034112 [POLICARBONATO 2.5]');
  const [cameraAngle, setCameraAngle] = useState({ yaw: 45.0, pitch: 32.5 });
  const [isRecalibrating, setIsRecalibrating] = useState<boolean>(false);

  const handleSelectStreet = (street: string, sku: string) => {
    setFocusedStreet(street);
    setDominantSku(sku);
    if (onNotify) {
      onNotify(`Foco espacial definido para ${street}`, 'var(--color-info)');
    }
  };

  const handleRecalibrate = () => {
    setIsRecalibrating(true);
    setTimeout(() => {
      setIsRecalibrating(false);
      setCameraAngle({ yaw: 45.0, pitch: 32.5 });
      if (onNotify) {
        onNotify('Malha espacial do Digital Twin recalibrada com sucesso! (12ms)', 'var(--color-success)');
      }
    }, 900);
  };

  const handleAuditPosition = () => {
    if (onNotify) {
      onNotify(`Ordem de auditoria emitida para a posição ${focusedStreet}!`, 'var(--color-success)');
    }
    if (onNavigateToStreet) {
      onNavigateToStreet(focusedStreet);
    }
  };

  const handleTriggerReplenishment = () => {
    if (onNotify) {
      onNotify(`Reabastecimento prioritário despachado para a rua ${focusedStreet}!`, 'var(--color-warning)');
    }
  };

  return (
    <div className="flex flex-col w-full text-slate-100 bg-[#0f131d] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-300">
      {/* -------------------------------------------------------------
          1. TOPO: Barra de Ferramentas da Visualização (Digital Twin Control Matrix)
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#090e17] px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 shadow-md">
        {/* Bloco Esquerdo: Seletor de Modo Principal */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#252a34] p-1 rounded-xl border border-white/5">
            <span className="font-mono text-[10px] text-slate-400 uppercase px-2 font-bold">Modo</span>
            <button
              type="button"
              onClick={() => setViewMode('2D')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === '2D'
                  ? 'bg-[#00f2fe] text-[#00373a] shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio size={14} />
              <span>Radar 2D</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'SPLIT'
                  ? 'bg-[#00f2fe] text-[#00373a] shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Compass size={14} />
              <span>Split (2D/3D)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('3D')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === '3D'
                  ? 'bg-[#00f2fe] text-[#00373a] shadow-[0_0_15px_rgba(0,242,254,0.4)] font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers size={14} />
              <span>Planta 3D (Ativo)</span>
            </button>
          </div>

          {/* Setor Dropdown */}
          <div className="flex items-center gap-2 bg-[#171c25] px-3 py-1.5 rounded-xl border border-white/10">
            <Warehouse size={15} className="text-[#00f2fe]" />
            <span className="font-mono text-[11px] text-slate-400 uppercase font-semibold">Setor:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-transparent text-[#e0fdff] font-mono text-xs font-bold outline-none cursor-pointer pr-1"
            >
              <option value="87" className="bg-[#252a34] text-white">Setor 87 (Paletes &amp; Picking)</option>
              <option value="88" className="bg-[#252a34] text-white">Setor 88 (Crossdocking Pesado)</option>
              <option value="b4u" className="bg-[#252a34] text-white">Zona de Doca B4U (Logística Reversa)</option>
            </select>
          </div>
        </div>

        {/* Bloco Central: Níveis de Visão Holográfica */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#171c25] px-2.5 py-1 rounded-xl border border-white/10">
          <span className="font-mono text-[10px] text-slate-400 uppercase px-1.5 font-bold">Camada:</span>
          {[
            { id: 'CHAO', label: 'Nível Chão (Picking)' },
            { id: 'PULMAO', label: 'Pulmão (Racks 1-5)' },
            { id: 'WIREFRAME', label: 'Wireframe' },
            { id: 'HEATMAP', label: 'Heatmap 3D', isHeat: true }
          ].map(layer => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setActiveLayer(layer.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1 ${
                activeLayer === layer.id
                  ? 'bg-[#252a34] text-[#00f2fe] font-bold border border-[#00f2fe]/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {layer.isHeat && <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />}
              <span>{layer.label}</span>
            </button>
          ))}
        </div>

        {/* Bloco Direito: Câmera & Controles Espaciais */}
        <div className="flex items-center gap-1.5 bg-[#252a34] p-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setCameraAngle({ yaw: 45.0, pitch: 32.5 })}
            className="p-1.5 rounded-lg bg-[#090e17] text-[#00f2fe] hover:bg-[#171c25] transition-colors"
            title="Perspectiva Isométrica"
          >
            <Box size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCameraAngle({ yaw: 0.0, pitch: 85.0 })}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#171c25] transition-colors"
            title="Vista Superior (Top-down)"
          >
            <Compass size={16} />
          </button>
          <span className="w-px h-4 bg-white/10 my-auto" />
          <button
            type="button"
            onClick={handleRecalibrate}
            className="px-2 py-1 rounded-lg text-slate-300 hover:text-[#00f2fe] transition-colors flex items-center gap-1 font-mono text-[11px] font-bold"
            title="Resetar Câmera e Ângulos"
          >
            <RotateCcw size={13} className={isRecalibrating ? 'animate-spin text-[#00f2fe]' : ''} />
            <span>RESET</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          2. PALCO PRINCIPAL (Digital Twin Canvas + Painel Telemetria)
          ------------------------------------------------------------- */}
      <div className="w-full grid grid-cols-12 gap-4 p-4 md:p-6">
        {/* ÁREA CENTRAL DO GÊMEO DIGITAL (9 Colunas em telas XL) */}
        <div className="col-span-12 xl:col-span-9 flex flex-col gap-3 relative">
          {/* Canvas de Renderização Isométrica com HUD Sobreposto */}
          <div className="relative w-full h-[580px] md:h-[620px] bg-[#090e17] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center select-none group">
            {/* Fundo de Grelha Espacial Isométrica (SVG Utilitário) */}
            <svg className="absolute inset-0 w-full h-full opacity-35 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="iso-grid-pattern" width="60" height="34.64" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 30 17.32 L 0 0 M 30 17.32 L 30 51.96 M 0 34.64 L 30 17.32 L 60 34.64" fill="none" stroke="#171c25" strokeWidth="1.2" />
                  <circle cx="30" cy="17.32" r="1" fill="#00dce6" opacity="0.4" />
                </pattern>
                <linearGradient id="route-laser" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4edea3" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#00f2fe" stopOpacity="1" />
                  <stop offset="100%" stopColor="#6e3cd8" stopOpacity="0.9" />
                </linearGradient>
                <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="url(#iso-grid-pattern)" />
              {/* Rota Vetorial Reabastecimento Doca -> B4VD02 */}
              <path
                d="M 120 540 L 280 440 L 460 440 L 580 320 L 580 210"
                fill="none"
                stroke="url(#route-laser)"
                strokeWidth="3.5"
                strokeDasharray="6,4"
                filter="url(#neon-glow)"
                className="animate-pulse"
              />
            </svg>

            {/* HUD Espacial: Coordenadas e Posição da Câmera (Top-Left) */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 bg-[#171c25]/90 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-ping" />
                <span className="font-mono text-[10px] text-[#00f2fe] uppercase font-bold tracking-wider">
                  Digital Twin // Espaço 3D
                </span>
              </div>
              <div className="font-mono text-xs text-slate-400 flex items-center gap-3">
                <span>X: <strong className="text-white">42.8m</strong></span>
                <span>Y: <strong className="text-white">18.4m</strong></span>
                <span>Z: <strong className="text-white">6.2m</strong></span>
              </div>
              <div className="font-mono text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                <Compass size={13} className="text-[#4edea3]" />
                <span>Ângulo Yaw: {cameraAngle.yaw.toFixed(1)}° | Pitch: {cameraAngle.pitch.toFixed(1)}°</span>
              </div>
            </div>

            {/* HUD: Legenda de Cores de Status no Canvas (Top-Right) */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-[#171c25]/90 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg">
              <span className="font-mono text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                Telemetria de Carga
              </span>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]" />
                <span>Picking Ativo (Operador)</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#4edea3] shadow-[0_0_8px_#4edea3]" />
                <span>Alocado 100% Suprido</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#e2d4ff] shadow-[0_0_8px_#e2d4ff]" />
                <span>Discrepância / Lento</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#ffb4ab] shadow-[0_0_8px_#ffb4ab]" />
                <span>Ruptura / Gargalo</span>
              </div>
            </div>

            {/* HUD: Waypoint Informativo Flutuante da Rota Ativa (Bottom-Left) */}
            <div className="absolute bottom-4 left-4 z-10 bg-[#252a34]/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30">
                  <Route size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] text-[#00f2fe] uppercase font-bold tracking-wider">
                    Rota Otimizada (WMS-AI)
                  </span>
                  <span className="font-mono text-xs text-slate-200 font-semibold">
                    Doca de Transferência ➔ Rua B4VD02 (Nível 02)
                  </span>
                </div>
              </div>
              <div className="font-mono text-lg font-black text-[#4edea3] pl-2 border-l border-white/10">
                44.2 <span className="text-xs font-normal text-slate-400">metros</span>
              </div>
            </div>

            {/* REPRESENTAÇÃO ISOMÉTRICA ESPACIAL DOS CORREDORES E RACKS */}
            <svg className="w-full h-full max-w-4xl max-h-[580px] drop-shadow-2xl" viewBox="0 0 1000 600">
              {/* RUA B4VC31 (Superior Esquerdo) */}
              <g
                className="cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handleSelectStreet('B4VC31', '789100017805 [FERRAGENS 100MM]')}
              >
                <text x="320" y="90" fill="#849495" className="font-mono text-xs font-bold">RUA B4VC31</text>
                <path d="M 300 120 L 340 98 L 380 120 L 340 142 Z" fill="#252a34" />
                <path d="M 300 120 L 340 142 L 340 190 L 300 168 Z" fill="#1b2029" />
                <path d="M 380 120 L 340 142 L 340 190 L 380 168 Z" fill="#171c25" />
                <polygon points="305,130 335,113 365,130 335,147" fill="#4edea3" opacity="0.9" />
                <polygon points="305,150 335,133 365,150 335,167" fill="#4edea3" opacity="0.8" />

                <path d="M 390 70 L 430 48 L 470 70 L 430 92 Z" fill="#252a34" />
                <path d="M 390 70 L 430 92 L 430 140 L 390 118 Z" fill="#1b2029" />
                <path d="M 470 70 L 430 92 L 430 140 L 470 118 Z" fill="#171c25" />
                <polygon points="395,80 425,63 455,80 425,97" fill="#4edea3" opacity="0.9" />
              </g>

              {/* RUA B4VB35 (Corredor Intermediário com Discrepância / Roxo) */}
              <g
                className="cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handleSelectStreet('B4VB35', '789100029385 [PAINEL MDF BRANCO]')}
              >
                <text x="540" y="110" fill="#849495" className="font-mono text-xs font-bold">RUA B4VB35</text>
                <path d="M 520 140 L 560 118 L 600 140 L 560 162 Z" fill="#252a34" />
                <path d="M 520 140 L 560 162 L 560 210 L 520 188 Z" fill="#1b2029" />
                <path d="M 600 140 L 560 162 L 560 210 L 600 188 Z" fill="#171c25" />
                <polygon points="525,150 555,133 585,150 555,167" fill="#e2d4ff" opacity="0.9" />
                <polygon points="525,170 555,153 585,170 555,187" fill="#4edea3" opacity="0.8" />
                <path d="M 610 90 L 650 68 L 690 90 L 650 112 Z" fill="#252a34" />
                <path d="M 610 90 L 650 112 L 650 160 L 610 138 Z" fill="#1b2029" />
                <path d="M 690 90 L 650 112 L 650 160 L 690 138 Z" fill="#171c25" />
                <polygon points="615,100 645,83 675,100 645,117" fill="#4edea3" opacity="0.9" />
              </g>

              {/* RUA B4VC36 (Alerta de Ruptura / Gargalo Crítico) */}
              <g
                className="cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handleSelectStreet('B4VC36', '789100021033 [REVESTIMENTO ACO]')}
              >
                <text x="690" y="220" fill="#ffb4ab" className="font-mono text-xs font-black">
                  ⚠️ RUA B4VC36 [GARGALO]
                </text>
                <path d="M 680 250 L 730 222 L 780 250 L 730 278 Z" fill="#30353f" />
                <path d="M 680 250 L 730 278 L 730 340 L 680 312 Z" fill="#252a34" />
                <path d="M 780 250 L 730 278 L 730 340 L 780 312 Z" fill="#1b2029" />
                {/* Paletes Críticos em Vermelho */}
                <polygon points="688,262 728,240 768,262 728,284" fill="#ffb4ab" opacity="0.95" />
                <polygon points="688,285 728,263 768,285 728,307" fill="#ffb4ab" opacity="0.85" />
                <polygon points="688,310 728,288 768,310 728,332" fill="#30353f" opacity="0.7" />
              </g>

              {/* RUA B4VD21 (Centro Operacional) */}
              <g
                className="cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handleSelectStreet('B4VD21', '789100011079 [KIT DOBRADIÇAS]') }
              >
                <text x="380" y="270" fill="#849495" className="font-mono text-xs font-bold">RUA B4VD21</text>
                <path d="M 360 300 L 410 272 L 460 300 L 410 328 Z" fill="#252a34" />
                <path d="M 360 300 L 410 328 L 410 390 L 360 362 Z" fill="#1b2029" />
                <path d="M 460 300 L 410 328 L 410 390 L 460 362 Z" fill="#171c25" />
                <polygon points="368,312 408,290 448,312 408,334" fill="#4edea3" opacity="0.9" />
                <polygon points="368,335 408,313 448,335 408,357" fill="#4edea3" opacity="0.8" />
                <polygon points="368,358 408,336 448,358 408,380" fill="#4edea3" opacity="0.7" />

                {/* Avatar Operador Marcos 3D Pin */}
                <g transform="translate(435, 345)">
                  <circle cx="0" cy="0" r="14" fill="#1b2029" stroke="#4edea3" strokeWidth="2" />
                  <circle cx="0" cy="0" r="5" fill="#4edea3" />
                  <rect x="-35" y="-34" width="70" height="16" rx="3" fill="#090e17" opacity="0.9" />
                  <text x="0" y="-23" fill="#dee2f0" textAnchor="middle" className="font-mono text-[10px] font-bold">Op. Marcos</text>
                </g>
              </g>

              {/* RUA B4VD02 (Picking Ativo + Foco Principal) */}
              <g
                className="cursor-pointer"
                onClick={() => handleSelectStreet('B4VD02', '789100034112 [POLICARBONATO 2.5]')}
              >
                <text x="560" y="380" fill="#00f2fe" className="font-mono text-xs font-black tracking-wider">
                  ✦ RUA B4VD02 [PICKING ATIVO]
                </text>
                <path d="M 540 410 L 600 376 L 660 410 L 600 444 Z" fill="#252a34" stroke="#00f2fe" strokeWidth="1.8" strokeDasharray="3,3" />
                <path d="M 540 410 L 600 444 L 600 520 L 540 486 Z" fill="#1b2029" />
                <path d="M 660 410 L 600 444 L 600 520 L 660 486 Z" fill="#171c25" />
                {/* Níveis Ciano Neon Picking */}
                <polygon points="548,422 598,394 648,422 598,450" fill="#00f2fe" opacity="0.95" />
                <polygon points="548,446 598,418 648,446 598,474" fill="#00f2fe" opacity="0.85" />
                <polygon points="548,470 598,442 648,470 598,498" fill="#4edea3" opacity="0.8" />
                <polygon points="548,494 598,466 648,494 598,522" fill="#4edea3" opacity="0.8" />

                {/* Avatar Operador Silva 3D Pin */}
                <g transform="translate(680, 440)">
                  <circle cx="0" cy="0" r="16" fill="#090e17" stroke="#00f2fe" strokeWidth="2.5" />
                  <circle cx="0" cy="0" r="6" fill="#00f2fe" className="animate-ping" />
                  <rect x="-42" y="-38" width="84" height="18" rx="3" fill="#090e17" stroke="#00f2fe" strokeWidth="1" />
                  <text x="0" y="-25" fill="#00f2fe" textAnchor="middle" className="font-mono text-[10px] font-bold">Op. Silva #14</text>
                </g>
              </g>

              {/* Doca de Transferência (Origem da Rota) */}
              <g id="dock-b4u">
                <path d="M 80 520 L 160 475 L 240 520 L 160 565 Z" fill="#171c25" stroke="#4edea3" strokeWidth="1.5" />
                <text x="160" y="582" fill="#4edea3" textAnchor="middle" className="font-mono text-[10px] font-bold">
                  DOCA B4U // TRANSFERÊNCIA
                </text>
                <circle cx="160" cy="520" r="10" fill="#4edea3" opacity="0.85" />
                <circle cx="160" cy="520" r="18" fill="none" stroke="#4edea3" strokeWidth="1" strokeDasharray="3,3" />
              </g>
            </svg>

            {/* Dica de Interatividade */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-[#171c25]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-slate-400 font-mono text-[10px]">
              <span>Clique nos blocos para focar • Giro: 45°</span>
            </div>
          </div>

          {/* Barra de Ações Rápidas Abaixo do Canvas */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-[#1b2029] px-4 py-2.5 rounded-2xl border border-white/10">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400 font-semibold">Seleção Focada:</span>
                <span className="font-mono text-sm text-[#00f2fe] font-black">
                  Rua {focusedStreet} - Rack 04 (Nível 2-4)
                </span>
              </div>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-400">SKU Dominante:</span>
                <span className="text-[#4edea3] font-bold">{dominantSku}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAuditPosition}
                className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#252a34] text-slate-200 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1.5 border border-white/5 cursor-pointer"
              >
                <Box size={14} className="text-[#00f2fe]" />
                <span>Auditar Posição</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerReplenishment}
                className="px-4 py-1.5 rounded-xl text-xs font-mono font-black bg-[#00f2fe] hover:brightness-110 text-[#00373a] transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,242,254,0.3)] cursor-pointer"
              >
                <Zap size={14} />
                <span>Disparar Reabastecimento</span>
              </button>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            3. PAINEL LATERAL DIREITO: Telemetria Espacial & Sensores (3 Colunas)
            ------------------------------------------------------------- */}
        <div className="col-span-12 xl:col-span-3 flex flex-col gap-4">
          {/* Card: Status do Gêmeo Digital */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Layers size={17} className="text-[#00f2fe]" />
                <h3 className="font-mono text-xs font-black uppercase text-white">Status do Gêmeo</h3>
              </div>
              <span className="font-mono text-[9px] font-bold text-[#4edea3] bg-[#4edea3]/10 px-2 py-0.5 rounded-md border border-[#4edea3]/30">
                SYNC ATIVO
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="bg-[#1b2029] p-2.5 rounded-xl border border-white/5">
                <span className="font-mono text-[9px] text-slate-400 uppercase font-semibold block">Ruas Mapeadas</span>
                <span className="font-mono text-xl font-black text-white">78</span>
                <span className="font-mono text-[10px] text-slate-400 block">100% Cobertura</span>
              </div>
              <div className="bg-[#1b2029] p-2.5 rounded-xl border border-white/5">
                <span className="font-mono text-[9px] text-slate-400 uppercase font-semibold block">Posições Palete</span>
                <span className="font-mono text-xl font-black text-white">4.120</span>
                <span className="font-mono text-[10px] text-[#4edea3] block">+120 Novas (S-87)</span>
              </div>
            </div>

            {/* Indicador de Ocupação Geral com Barra */}
            <div className="bg-[#1b2029] p-3 rounded-xl border border-white/5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-medium">Ocupação Volumétrica</span>
                <span className="text-[#00f2fe] font-black">88.4%</span>
              </div>
              <div className="w-full h-2 bg-[#30353f] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#4edea3] via-[#00f2fe] to-[#e2d4ff] rounded-full transition-all duration-500"
                  style={{ width: '88.4%' }}
                />
              </div>
              <div className="flex justify-between items-center font-mono text-[10px] text-slate-400 mt-0.5">
                <span>3.642 Ocupadas</span>
                <span>478 Livres</span>
              </div>
            </div>
          </div>

          {/* Card: Mini Radar 2D de Orientação (Minimap) */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Radio size={15} className="text-slate-400" />
                <h4 className="font-mono text-xs font-bold uppercase text-white">Radar 2D (Minimap)</h4>
              </div>
              <span className="font-mono text-[10px] text-slate-400">Escala 1:500</span>
            </div>

            <div className="relative w-full h-36 bg-[#090e17] rounded-xl overflow-hidden mt-1 flex items-center justify-center border border-white/5">
              <svg className="w-full h-full p-2" viewBox="0 0 200 120">
                <rect x="20" y="15" width="12" height="90" fill="#252a34" rx="2" />
                <rect x="50" y="15" width="12" height="90" fill="#252a34" rx="2" />
                <rect x="80" y="15" width="12" height="90" fill="#252a34" rx="2" />
                <rect x="110" y="15" width="12" height="90" fill="#252a34" rx="2" />
                <rect x="140" y="15" width="12" height="90" fill="#30353f" stroke="#ffb4ab" strokeWidth="1" rx="2" />
                <rect x="170" y="15" width="12" height="90" fill="#252a34" rx="2" />
                {/* Ponto Crítico Vermelho na B4VC36 */}
                <circle cx="146" cy="45" r="3.5" fill="#ffb4ab" className="animate-ping" />
                {/* Posição da Câmera 3D + Campo de Visão Cônico */}
                <polygon points="90,115 40,30 140,30" fill="#00f2fe" opacity="0.15" />
                <circle cx="90" cy="112" r="4" fill="#00f2fe" />
                <line x1="90" y1="112" x2="40" y2="30" stroke="#00f2fe" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.6" />
                <line x1="90" y1="112" x2="140" y2="30" stroke="#00f2fe" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.6" />
                {/* Operadores */}
                <circle cx="116" cy="70" r="3" fill="#00f2fe" />
                <circle cx="86" cy="55" r="3" fill="#4edea3" />
              </svg>
              <div className="absolute bottom-1 right-2 font-mono text-[9px] text-slate-400">FOV: 68°</div>
            </div>
          </div>

          {/* Card: Operadores Rastreados em Tempo Real */}
          <div className="bg-[#171c25] p-4 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Navigation size={16} className="text-[#4edea3]" />
                <h4 className="font-mono text-xs font-bold uppercase text-white">Operadores no Espaço</h4>
              </div>
              <span className="font-mono text-[10px] text-slate-400">3 Conectados</span>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              {/* Op Silva */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#1b2029] border border-white/5 hover:border-[#00f2fe]/40 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00f2fe] animate-pulse" />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">Op. Silva (#14)</div>
                    <div className="font-mono text-[10px] text-slate-400">Corredor B4VD02</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-black text-[#00f2fe]">142 cx/h</div>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#00f2fe]/10 text-[#00f2fe] font-bold">
                    PICKING
                  </span>
                </div>
              </div>

              {/* Op Marcos */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#1b2029] border border-white/5 hover:border-[#4edea3]/40 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3]" />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">Op. Marcos (#09)</div>
                    <div className="font-mono text-[10px] text-slate-400">Corredor B4VD21</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-black text-[#4edea3]">118 cx/h</div>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#4edea3]/10 text-[#4edea3] font-bold">
                    PULMÃO
                  </span>
                </div>
              </div>

              {/* Paleteira Elétrica #04 */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#1b2029] border border-white/5 hover:border-[#e2d4ff]/40 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e2d4ff]" />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">Paleteira Elétr. #04</div>
                    <div className="font-mono text-[10px] text-slate-400">Doca B4VC36 / Giro</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-black text-purple-300">8.4 km/h</div>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 font-bold">
                    TRÂNSITO
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Diagnóstico Rápido de Risco & Segurança */}
          <div className="bg-[#171c25] p-3.5 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-white uppercase">Diagnóstico Espacial</span>
              <ShieldCheck size={16} className="text-[#4edea3]" />
            </div>
            <div className="flex items-center justify-between bg-[#1b2029] p-2 rounded-xl border border-white/5 text-xs font-mono">
              <span className="text-slate-400">Risco Colisão Tráfego:</span>
              <span className="text-[#4edea3] font-bold">ZERO DETECTADO</span>
            </div>
            <div className="flex items-center justify-between bg-[#1b2029] p-2 rounded-xl border border-white/5 text-xs font-mono">
              <span className="text-slate-400">Carga Altura Irregular:</span>
              <span className="text-[#ffb4ab] font-bold">2 ALERTAS (B4VC36)</span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          4. BARRA INFERIOR: Métricas de Produtividade em Tempo Real
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#171c25] px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 shadow-inner">
        {/* Métrica 1: VPH Total */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              VPH Global (Saída)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-white">3.420</span>
              <span className="font-mono text-xs text-slate-400">cx/h</span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col border-l border-white/10 pl-4 font-mono text-xs">
            <span className="text-[#4edea3] font-bold">▲ +4.2%</span>
            <span className="text-slate-400 text-[10px]">vs Turno Anterior</span>
          </div>
        </div>

        {/* Métrica 2: EPH */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              EPH (Endereçamento)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-[#4edea3]">58.2</span>
              <span className="font-mono text-xs text-slate-400">end/h</span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col border-l border-white/10 pl-4 font-mono text-xs">
            <span className="text-slate-400 text-[10px]">Meta: 55.0</span>
            <span className="text-[#4edea3] font-bold">Superado</span>
          </div>
        </div>

        {/* Métrica 3: Ruas em Alerta Crítico */}
        <div className="flex items-center gap-3 bg-[#1b2029] px-3.5 py-2 rounded-xl border border-rose-500/20">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
          <div className="flex flex-col font-mono">
            <span className="text-[10px] text-rose-400 uppercase font-bold">Gargalos Identificados</span>
            <span className="text-xs text-white font-bold">
              3 Ruas Críticas <span className="text-slate-400 font-normal text-[11px]">(B4VC36, B4VD37, B4VA12)</span>
            </span>
          </div>
        </div>

        {/* Métrica 4: Telemetria SSE & Conectividade */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-right font-mono">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">SSE Digital Twin Feed</span>
            <div className="flex items-center justify-end gap-1.5 text-xs text-[#4edea3] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-ping" />
              <span>12ms</span>
              <span className="text-slate-400 text-[10px] font-normal">Jitter 0.8ms</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRecalibrate}
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-[#252a34] text-[#00f2fe] hover:bg-[#00f2fe] hover:text-[#00373a] transition-all flex items-center gap-1.5 cursor-pointer border border-[#00f2fe]/30"
          >
            <RefreshCw size={13} className={isRecalibrating ? 'animate-spin' : ''} />
            <span>Recalibrar Espaço</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwinSpatialMap;
