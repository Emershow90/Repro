/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Shield, Eye, Clock, Terminal } from 'lucide-react';
import { Log } from '../types';

interface ScreensaverProps {
  onClose: () => void;
  logs: Log[];
  currentUser: string;
  currentRole: string;
}

export default function Screensaver({ onClose, logs, currentUser, currentRole }: ScreensaverProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Matrix Digital Rain Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Matrix characters
    const katakana = 'アァカサタナハマヤャラワガザダバパイィキシシチニヒミリウゥクスツヌフムユュルヲエェケセテネヘメレオォコソトノホモヨョロヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$@%&*+-/=?';
    const alphabet = katakana.split('');

    const fontSize = 14;
    const columns = canvas.width / fontSize;

    const rainDrops: number[] = [];
    for (let x = 0; x < columns; x++) {
      rainDrops[x] = Math.random() * -100; // staggered start
    }

    const draw = () => {
      ctx.fillStyle = 'rgba(12, 13, 16, 0.08)'; // semi-transparent black to create trailing effect
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#10b981'; // emerald green
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < rainDrops.length; i++) {
        const text = alphabet[Math.floor(Math.random() * alphabet.length)];
        ctx.fillText(text, i * fontSize, rainDrops[i] * fontSize);

        if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          rainDrops[i] = 0;
        }
        rainDrops[i]++;
      }
    };

    const run = () => {
      draw();
      animationFrameId = requestAnimationFrame(run);
    };
    run();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Dismiss on any interaction
  useEffect(() => {
    const handleAction = () => {
      onClose();
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    // Delay adding listeners by 1s to prevent immediate dismissal if active tab clicked
    const timer = setTimeout(() => {
      events.forEach(evt => window.addEventListener(evt, handleAction));
    }, 1000);

    return () => {
      clearTimeout(timer);
      events.forEach(evt => window.removeEventListener(evt, handleAction));
    };
  }, [onClose]);

  // Operational metrics
  const totalVolumes = logs.reduce((acc, l) => acc + l.volumes, 0);
  const totalHours = logs.reduce((acc, l) => acc + l.horas, 0);
  const totalLogsCount = logs.length;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0c0d10] text-[#10b981] font-mono flex flex-col justify-between p-8 md:p-12 select-none overflow-hidden">
      {/* Background Matrix Rain */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-15 pointer-events-none" />

      {/* Header Info */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between w-full border-b border-[#10b981]/20 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Terminal size={20} className="text-[#10b981] animate-pulse" />
          <div>
            <h1 className="text-sm font-bold tracking-[0.2em] uppercase">TERMINAL REPRO // CONSOLE OPERACIONAL</h1>
            <p className="text-[0.6rem] opacity-50 uppercase tracking-[0.1em] mt-0.5">ESTADO: SEGURANÇA E MONITORIZAÇÃO ATIVA</p>
          </div>
        </div>
        <div className="flex flex-row items-center gap-4 text-xs">
          <div className="border border-[#10b981]/30 bg-[#10b981]/5 px-3 py-1 rounded-sm text-[0.65rem] tracking-wider uppercase">
            SESSÃO: <span className="text-white font-bold">{currentUser}</span> ({currentRole})
          </div>
          <div className="flex items-center gap-1.5 text-[#10b981]">
            <Shield size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-[0.6rem] uppercase tracking-wider">PROTEÇÃO TERMINAL ATIVA</span>
          </div>
        </div>
      </div>

      {/* Center Clock and Animated Display */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto py-8 text-center space-y-6">
        <div className="border-2 border-[#10b981]/30 bg-[#0c0d10]/90 p-8 rounded-md max-w-xl w-full shadow-[0_0_50px_rgba(16,185,129,0.15)] space-y-4">
          <div className="flex justify-center mb-2">
            <Clock size={24} className="animate-bounce" />
          </div>
          
          <h2 className="text-5xl md:text-7xl font-bold tracking-widest text-white font-mono drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            {timeStr || '00:00:00'}
          </h2>
          
          <p className="text-xs font-bold text-[#10b981]/70 uppercase tracking-[0.25em]">
            {dateStr || 'CARREGANDO DATA...'}
          </p>

          <div className="border-t border-[#10b981]/20 pt-4 mt-2 grid grid-cols-3 gap-2 text-center text-[0.6rem] uppercase tracking-widest text-[#94a3b8]">
            <div className="border border-[#10b981]/10 p-2 bg-[#10b981]/2 rounded-sm">
              <span className="block text-[0.5rem] opacity-40">ENDS REGISTADOS</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5 block">{totalVolumes.toLocaleString('pt-PT')}</span>
            </div>
            <div className="border border-[#10b981]/10 p-2 bg-[#10b981]/2 rounded-sm">
              <span className="block text-[0.5rem] opacity-40">HORAS OPERADAS</span>
              <span className="text-sm font-bold text-[#10b981] font-mono mt-0.5 block">{totalHours.toFixed(1)}h</span>
            </div>
            <div className="border border-[#10b981]/10 p-2 bg-[#10b981]/2 rounded-sm">
              <span className="block text-[0.5rem] opacity-40">REGISTOS TOTAIS</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5 block">{totalLogsCount}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[0.65rem] tracking-[0.2em] uppercase text-[#10b981] animate-pulse">
          <Eye size={12} />
          <span>Mova o rato ou pressione qualquer tecla para retornar</span>
        </div>
      </div>

      {/* Footer System Info */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between w-full border-t border-[#10b981]/20 pt-4 gap-2 text-[0.55rem] uppercase tracking-[0.15em] opacity-40">
        <div>GERADO EM {new Date().getFullYear()} // PLATAFORMA INTEGRADA REPRO v5.0 // OBSIDIAN</div>
        <div className="flex gap-4">
          <span>PORT: 3000 // INGRESS SECURE</span>
          <span>INDEXEDDB ENGINE</span>
        </div>
      </div>
    </div>
  );
}
