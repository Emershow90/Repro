import { create } from 'zustand';

export const VALID_SECTORS = ['87', '88', '89', '90'] as const;
export type ValidSector = typeof VALID_SECTORS[number];

export interface SectorState {
  activeSectorId: string;
  childActiveSector: string;
  updateActiveSector: (sector: string, addToast?: (msg: string, col?: string) => void) => void;
}

export const SECTOR_NAMES: Record<string, string> = {
  todos: 'Todos os Setores (87, 88, 89, 90)',
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
  activeSectorId: localStorage.getItem('repro_active_sector') || '87',
  childActiveSector: localStorage.getItem('repro_child_active_sector') || SECTOR_NAMES['87'],
  updateActiveSector: (sector: string, addToast) => {
    const sub = SECTOR_NAMES[sector] || 'Setor ' + sector;
    localStorage.setItem('repro_active_sector', sector);
    localStorage.setItem('repro_child_active_sector', sub);
    set({ activeSectorId: sector, childActiveSector: sub });
    if (addToast) {
      addToast(`Foco Setorial alterado para: SETOR ${sector.toUpperCase()}`, 'var(--color-terminal-accent)');
    }
  },
}));

