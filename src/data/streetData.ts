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
 * Mapeamento oficial de Ruas por Setor e Categoria
 * 
 * Setor 87:
 * Ruas: B4VD, B4VC, B4VB, B4VA, B4UZ
 * 
 * Volumosos (unificado):
 * Setor 89: Ruas B5VA, B5VB, B5VC
 * Setor 90: Ruas B5VD, B5VE, B5VF, B5VG, B5VH, B5VI, B5VJ, B5VK
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
    sectorId: '89',
    sectorName: 'Setor 89 (Volumosos)',
    groupLabel: 'Setor 89 - Volumosos',
    isVolumosos: true,
    streets: ['B5VA', 'B5VB', 'B5VC']
  },
  {
    sectorId: '90',
    sectorName: 'Setor 90 (Volumosos)',
    groupLabel: 'Setor 90 - Volumosos',
    isVolumosos: true,
    streets: ['B5VD', 'B5VE', 'B5VF', 'B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK']
  }
];

export const VOLUMOSOS_STREETS = [
  'B5VA', 'B5VB', 'B5VC',
  'B5VD', 'B5VE', 'B5VF', 'B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK'
];

export const SECTOR_87_STREETS = [
  'B4VD', 'B4VC', 'B4VB', 'B4VA', 'B4UZ'
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
  if (norm === '89') {
    return ['B5VA', 'B5VB', 'B5VC'];
  }
  if (norm === '90') {
    return ['B5VD', 'B5VE', 'B5VF', 'B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK'];
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
  
  if (['B4VD', 'B4VC', 'B4VB', 'B4VA', 'B4UZ'].includes(s)) {
    return '87';
  }
  if (['B5VA', 'B5VB', 'B5VC'].includes(s)) {
    return '89';
  }
  if (['B5VD', 'B5VE', 'B5VF', 'B5VG', 'B5VH', 'B5VI', 'B5VJ', 'B5VK'].includes(s)) {
    return '90';
  }
  
  if (s.startsWith('B4')) return '87';
  if (s.startsWith('B5')) return '88_89_90';
  
  return '87';
}
