import { create } from 'zustand';

interface SectorState {
  activeSectorId: string;
  childActiveSector: string;
  updateActiveSector: (sector: string, addToast?: (msg: string, col?: string) => void) => void;
}

const subsectors: Record<string, string> = {
  todos: 'Geral',
  '87': 'Setor 87 - Repro / Operações',
  '88': 'Setor 88 - Repro / Operações',
  '89': 'Setor 89 - Repro / Operações',
  '90': 'Setor 90 - Repro / Operações',
  rececao: 'Cais de Entrada',
  armazenagem: 'Estanteria / Corredores',
  picking: 'Estações de Preparação',
  expedicao: 'Cais de Saída',
  devolucoes: 'Área de Triagem'
};

export const useSectorStore = create<SectorState>((set) => ({
  activeSectorId: localStorage.getItem('repro_active_sector') || 'todos',
  childActiveSector: localStorage.getItem('repro_child_active_sector') || 'Geral',
  updateActiveSector: (sector: string, addToast) => {
    const sub = subsectors[sector] || 'Geral';
    localStorage.setItem('repro_active_sector', sector);
    localStorage.setItem('repro_child_active_sector', sub);
    set({ activeSectorId: sector, childActiveSector: sub });
    if (addToast) {
      addToast(`Foco Setorial alterado para: ${sector.toUpperCase()} (${sub})`, 'var(--color-terminal-accent)');
    }
  },
}));
