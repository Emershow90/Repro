/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SectorStreetGroup {
  sectorId: string;
  sectorName: string;
  groupLabel: string;
  isVolumosos?: boolean;
  streets: string[];
}

/**
 * Entidade Oficial de Demanda Calculada pelo REPRO
 */
export interface ReproDemand {
  rua: string;
  setor: string;
  data: string; // formato YYYY-MM-DD
  demandaCalculada: number; // quantidade calculada pelo REPRO para ser endereçada no dia
}

/**
 * Mapeamento oficial de Ruas por Setor do CD:
 * 
 * Setor 87 (Solo):
 * Ruas: B4VD, B4VC, B4VB, B4VA, B4UZ
 * 
 * Setor 88 (Volumosos):
 * Ruas: B5VG, B5VH, B5VI, B5VJ, B5VK
 * 
 * Setor 89 (Volumosos):
 * Ruas: B5VA, B5VB, B5VC
 * 
 * Setor 90 (Volumosos):
 * Ruas: B5VD, B5VE, B5VF
 */
export const SECTOR_STREET_GROUPS: SectorStreetGroup[] = [
  {
    sectorId: '87',
    sectorName: 'Setor 87 (Solo)',
    groupLabel: 'Setor 87',
    isVolumosos: false,
    streets: ['B4VD', 'B4VC', 'B4VB', 'B4VA', 'B4UZ']
  },
  {
    sectorId: '88',
    sectorName: 'Setor 88',
    groupLabel: 'Setor 88',
    isVolumosos: true,
    streets: ['B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK']
  },
  {
    sectorId: '89',
    sectorName: 'Setor 89',
    groupLabel: 'Setor 89',
    isVolumosos: true,
    streets: ['B5VA', 'B5VB', 'B5VC']
  },
  {
    sectorId: '90',
    sectorName: 'Setor 90',
    groupLabel: 'Setor 90',
    isVolumosos: true,
    streets: ['B5VD', 'B5VE', 'B5VF']
  }
];

export const SECTOR_87_STREETS = ['B4VD', 'B4VC', 'B4VB', 'B4VA', 'B4UZ'];
export const SECTOR_88_STREETS = ['B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK'];
export const SECTOR_89_STREETS = ['B5VA', 'B5VB', 'B5VC'];
export const SECTOR_90_STREETS = ['B5VD', 'B5VE', 'B5VF'];

export const VOLUMOSOS_STREETS = [
  ...SECTOR_88_STREETS,
  ...SECTOR_89_STREETS,
  ...SECTOR_90_STREETS
];

export const ALL_CONFIGURED_STREETS = [
  ...SECTOR_87_STREETS,
  ...VOLUMOSOS_STREETS
];

/**
 * Obtém as ruas configuradas para um determinado ID de setor
 */
export function getStreetsForSector(sectorId: string): string[] {
  const norm = (sectorId || '').trim().toLowerCase();
  
  if (norm === '87') {
    return SECTOR_87_STREETS;
  }
  if (norm === '88') {
    return SECTOR_88_STREETS;
  }
  if (norm === '89') {
    return SECTOR_89_STREETS;
  }
  if (norm === '90') {
    return SECTOR_90_STREETS;
  }
  if (norm === '88_89_90' || norm === 'volumosos' || norm.includes('unificado')) {
    return VOLUMOSOS_STREETS;
  }
  
  return ALL_CONFIGURED_STREETS;
}

/**
 * Tenta inferir o setor correspondente com base no nome da rua
 */
export function inferSectorFromStreet(streetName: string): string {
  if (!streetName) return '87';
  const s = streetName.toUpperCase().trim();
  
  if (SECTOR_87_STREETS.includes(s)) {
    return '87';
  }
  if (SECTOR_88_STREETS.includes(s)) {
    return '88';
  }
  if (SECTOR_89_STREETS.includes(s)) {
    return '89';
  }
  if (SECTOR_90_STREETS.includes(s)) {
    return '90';
  }
  
  if (s.startsWith('B4')) return '87';
  if (s.startsWith('B5')) return '88';
  
  return '87';
}

