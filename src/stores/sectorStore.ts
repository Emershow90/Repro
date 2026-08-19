import { create } from 'zustand';

export const VALID_SECTORS = ['87', '88', '89', '90'] as const;
export type ValidSector = typeof VALID_SECTORS[number];

export interface SectorOption {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const SECTOR_OPTIONS: SectorOption[] = [
  {
    id: 'todos',
    label: 'Todos os Setores (87, 88, 89, 90)',
    shortLabel: 'Todos (87-90)',
    description: 'Visão global de todos os setores'
  },
  {
    id: '87',
    label: 'Setor 87 (Solo)',
    shortLabel: 'Setor 87 (Solo)',
    description: 'Operações exclusivas do Setor 87'
  },
  {
    id: '88_89_90',
    label: 'Setores 88, 89 e 90 (Unificados)',
    shortLabel: 'Setores 88-90 (Unificados)',
    description: 'Dados consolidados dos setores 88, 89 e 90'
  }
];

export const SECTOR_NAMES: Record<string, string> = {
  todos: 'Todos os Setores (87, 88, 89, 90)',
  '87': 'Setor 87 (Solo)',
  '88_89_90': 'Setores 88, 89 e 90 (Unificados)',
  '88': 'Setor 88',
  '89': 'Setor 89',
  '90': 'Setor 90'
};

export interface SectorState {
  activeSectorId: string;
  childActiveSector: string;
  updateActiveSector: (sector: string, addToast?: (msg: string, col?: string) => void) => void;
}

export const useSectorStore = create<SectorState>((set) => ({
  activeSectorId: localStorage.getItem('repro_active_sector') || 'todos',
  childActiveSector: localStorage.getItem('repro_child_active_sector') || SECTOR_NAMES['todos'],
  updateActiveSector: (sector: string, addToast) => {
    const sub = SECTOR_NAMES[sector] || 'Setor ' + sector;
    localStorage.setItem('repro_active_sector', sector);
    localStorage.setItem('repro_child_active_sector', sub);
    set({ activeSectorId: sector, childActiveSector: sub });
    if (addToast) {
      addToast(`Foco Setorial: ${sub}`, 'var(--color-terminal-accent)');
    }
  },
}));
