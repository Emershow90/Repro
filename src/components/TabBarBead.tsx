/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import { motion } from "motion/react";

/**
 * TabBarBead
 * ----------
 * Barra de navegação entre módulos com uma "conta" (bead) que desliza e se
 * funde na aba ativa — inspirada na barra "Settings" do reel.
 * Pode ser arrastada ao longo da barra ou usada por clique nas abas.
 *
 * Uso:
 * <TabBarBead
 *   tabs={[{ id: "radar", label: "Radar", icon: <RadarIcon/> }, ...]}
 *   activeId={active}
 *   onChange={setActive}
 * />
 */

export type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string; // Support optional badge for our specific app requirements
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
    <div
      ref={barRef}
      id="main-app-navigation"
      className="torre-mono relative grid select-none items-center rounded-full p-2 w-full max-w-4xl mx-auto backdrop-blur-md"
      style={{
        background: "var(--torre-bg-elevated, rgba(18, 21, 30, 0.85))",
        border: "1px solid var(--torre-border, rgba(255, 255, 255, 0.12))",
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
      }}
    >
      {/* Moving Bead Backplate */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="absolute h-10 rounded-full flex items-center justify-center shadow-lg pointer-events-none"
        style={{
          background: "var(--torre-emerald, #10b981)",
          width: `calc(${100 / tabs.length}% - 12px)`,
          left: `calc(${(activeIndex * 100) / tabs.length}% + 6px)`,
          boxShadow: "0 4px 14px var(--torre-emerald-glow, rgba(16, 185, 129, 0.35))",
        }}
      />

      {/* Tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="relative z-10 flex flex-col sm:flex-row gap-1.5 items-center justify-center h-10 rounded-full transition-colors duration-200 cursor-pointer text-center whitespace-nowrap"
            style={{ 
              color: isActive ? "var(--torre-bg, #0b0d13)" : "var(--torre-text-dim, #94a3b8)" 
            }}
            aria-label={tab.label}
            aria-current={isActive}
          >
            {/* Icon */}
            <div className="flex items-center justify-center shrink-0">
              {tab.icon}
            </div>

            {/* Label (Visible on Sm+ screens) */}
            <span className="hidden md:inline text-[0.68rem] font-mono uppercase font-black tracking-wider">
              {tab.label}
            </span>

            {/* Optional mini badge */}
            {tab.badge && (
              <span 
                className={`hidden lg:inline text-[0.55rem] px-1.5 py-0.5 rounded-full font-black uppercase ${
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
  );
}
