/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import { motion } from "motion/react";

/**
 * TabBarBead
 * ----------
 * Barra de navegação entre módulos.
 * Para PC/Web (md+): Usa o modelo de "conta" (bead) que desliza e se funde na aba ativa.
 * Para Mobile: Lista horizontal scrollável ergonomicamente ajustada.
 */

export type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
};

type Props = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
};

export default function TabBarBead({ tabs, activeId, onChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeId));

  return (
    <>
      {/* 1. MODO MOBILE: Scroll Horizontal, sem Bead (Evita botões esmagados) */}
      <div
        id="main-app-navigation-mobile"
        className="md:hidden flex items-center gap-2 overflow-x-auto snap-x px-1 py-2 no-scrollbar w-full"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`snap-start shrink-0 flex items-center gap-2 h-10 px-4 rounded-full transition-all border shadow-sm ${
                isActive 
                  ? 'bg-emerald-500 text-black border-emerald-400 font-black'
                  : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <div className="shrink-0">{tab.icon}</div>
              <span className="text-[0.75rem] font-mono uppercase tracking-wider">
                {tab.label}
              </span>
              {tab.badge && (
                <span 
                  className={`text-[0.55rem] px-1.5 py-0.5 rounded-full font-black uppercase ${
                    isActive 
                      ? "bg-black/20 text-black" 
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. MODO PC/WEB: Flex com Bead Animado (Corrigido) */}
      <div
        ref={barRef}
        id="main-app-navigation"
        className="torre-mono relative hidden md:flex select-none items-center rounded-full p-1.5 w-full max-w-full xl:max-w-6xl mx-auto backdrop-blur-md overflow-x-auto no-scrollbar gap-1"
        style={{
          background: "var(--torre-bg-elevated, rgba(18, 21, 30, 0.85))",
          border: "1px solid var(--torre-border, rgba(255, 255, 255, 0.12))",
        }}
      >
        {/* Tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className="relative z-10 flex flex-row gap-1.5 items-center justify-center h-10 px-3 lg:px-4 rounded-full transition-colors duration-200 cursor-pointer text-center whitespace-nowrap shrink-0 flex-1 min-w-max"
              style={{ 
                color: isActive ? "var(--torre-bg, #0b0d13)" : "var(--torre-text-dim, #94a3b8)" 
              }}
              aria-label={tab.label}
              aria-current={isActive}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabBeadPC"
                  className="absolute inset-0 rounded-full shadow-lg pointer-events-none -z-10"
                  style={{
                    background: "var(--torre-emerald, #10b981)",
                    boxShadow: "0 4px 14px var(--torre-emerald-glow, rgba(16, 185, 129, 0.35))",
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              )}

              {/* Icon */}
              <div className="flex items-center justify-center shrink-0">
                {tab.icon}
              </div>

              {/* Label */}
              <span className="text-[0.65rem] lg:text-[0.68rem] font-mono uppercase font-black tracking-wider">
                {tab.label}
              </span>

              {/* Optional mini badge */}
              {tab.badge && (
                <span 
                  className={`text-[0.55rem] px-1.5 py-0.5 rounded-full font-black uppercase ${
                    isActive 
                      ? "bg-black/20 text-black" 
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
