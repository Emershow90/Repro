/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVIÇO DE REGISTRO, GESTÃO E AUDITORIA DE ARTIGO, ENDEREÇO E CTN
 * Conformidade com normas de segurança corporativas (Armazenamento 100% Local em IndexedDB)
 *
 * A-02 aplicado (2026-09-26): syncLocalStorageBackup deprecated (no-op).
 * D-02 aplicado (2026-09-26): SEED_FLAG_KEY controla re-injeção de seeds.
 */

import * as XLSX from 'xlsx';
import {
  SECTOR_87_STREETS,
  SECTOR_88_STREETS,
  SECTOR_89_STREETS,
  SECTOR_90_STREETS,
} from '../data/streetData';

export interface ArticleAddressRecord {
  id: string;
  data: string;
  artigo: string;
  endereco: string;
  ctn: string;
  rua: string;
  setor: string;
  hora?: string;
  colaborador?: string;
  origem: 'MANUAL' | 'PLANILHA' | 'COLETOR';
  observacoes?: string;
  statusAuditoria: 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE';
  mensagensAuditoria: string[];
  criadoEm: number;
  contenantPai?: string;
  enderecoOrigem?: string;
  zonaOrigem?: string;
  enderecoTampao?: string;
  zonaDestino?: string;
  unidade?: string;
  volumes?: number;
}

export interface ArticleAddressStats {
  totalRegistros: number;
  totalArtigosUnicos: number;
  totalEnderecosUnicos: number;
  totalCtn: number;
  mediaCtnPorEndereco: number;
  mediaEnderecosPorRua: number;
  taxaIntegridade: number;
  auditoriaResumo: {
    validados: number;
    alertas: number;
    inconsistentes: number;
  };
  enderecosPorRua: {
    rua: string;
    setor: string;
    totalEnderecos: number;
    totalCtn: number;
    artigos: string[];
    totalArtigos: number;
  }[];
  topArtigos: {
    artigo: string;
    totalCtn: number;
    totalEnderecos: number;
    ruas: string[];
    totalRuas: number;
  }[];
  topRuas: {
    rua: string;
    setor: string;
    totalEnderecos: number;
    totalCtn: number;
    totalArtigos: number;
    artigos: string[];
  }[];
  datasDisponiveis: string[];
}

/* ============================================================
 * PARSER DE RUA/SETOR
 * ============================================================ */

export function parseStreetAndSectorFromAddress(address: string): { rua: string; setor: string } {
  const clean = address.trim().toUpperCase();
  if (!clean) return { rua: 'OUTROS', setor: '87' };

  let rua = clean;
  if (clean.includes('-')) {
    rua = clean.split('-')[0].trim();
  } else if (clean.includes(' ')) {
    rua = clean.split(' ')[0].trim();
  } else if (clean.length > 4) {
    rua = clean.substring(0, 4);
  }

  let setor = '87';
  if (SECTOR_87_STREETS.includes(rua)) setor = '87';
  else if (SECTOR_88_STREETS.includes(rua)) setor = '88';
  else if (SECTOR_89_STREETS.includes(rua)) setor = '89';
  else if (SECTOR_90_STREETS.includes(rua)) setor = '90';
  else if (rua.startsWith('B4')) setor = '87';
  else if (rua.startsWith('B5')) setor = '88';
  else if (rua.startsWith('B6')) setor = '89';
  else if (rua.startsWith('B7')) setor = '90';

  return { rua, setor };
}

/* ============================================================
 * MOTOR DE AUDITORIA
 * ============================================================ */

export function auditArticleAddressRecord(
  rec: Partial<ArticleAddressRecord>,
  allRecords: ArticleAddressRecord[] = []
): { status: 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE'; mensagens: string[] } {
  const mensagens: string[] = [];

  if (!rec.artigo || rec.artigo.trim().length === 0) {
    mensagens.push('Código do Artigo não preenchido.');
  }

  if (!rec.endereco || rec.endereco.trim().length === 0) {
    mensagens.push('Endereço não informado.');
  } else if (!rec.endereco.includes('-') && rec.endereco.trim().length < 4) {
    mensagens.push('Formato de endereço potencialmente incorreto ou atípico.');
  }

  const ctnStr = String(rec.ctn || '').replace(/[^0-9]/g, '');
  const ctnNum = Number(ctnStr);
  if (!ctnStr || isNaN(ctnNum) || ctnNum <= 0) {
    mensagens.push('CTN inválido ou não informado (assumido 1 por padrão).');
  } else if (ctnNum > 120) {
    mensagens.push(`Volume elevado de CTN (${ctnNum}) para o endereço.`);
  }

  if (rec.endereco && rec.data) {
    const conflitos = allRecords.filter(
      (r) =>
        r.id !== rec.id &&
        r.data === rec.data &&
        r.endereco.toUpperCase() === (rec.endereco || '').toUpperCase() &&
        r.artigo.toUpperCase() !== (rec.artigo || '').toUpperCase()
    );
    if (conflitos.length > 0) {
      const outrosArtigos = Array.from(new Set(conflitos.map((c) => c.artigo))).join(', ');
      mensagens.push(`Conflito: Endereço compartilhado hoje com: ${outrosArtigos}.`);
    }
  }

  if (rec.artigo && rec.data) {
    const ruasDoArtigo = new Set(
      allRecords
        .filter((r) => r.data === rec.data && r.artigo.toUpperCase() === (rec.artigo || '').toUpperCase())
        .map((r) => r.rua)
    );
    if (rec.rua) ruasDoArtigo.add(rec.rua);

    if (ruasDoArtigo.size > 4) {
      mensagens.push(`Dispersão: Artigo presente em ${ruasDoArtigo.size} ruas hoje.`);
    }
  }

  let status: 'VALIDADO' | 'ALERTA' | 'INCONSISTENTE' = 'VALIDADO';
  if (!rec.artigo || !rec.endereco || !ctnStr || isNaN(ctnNum) || ctnNum <= 0) {
    status = 'INCONSISTENTE';
  } else if (mensagens.length > 0) {
    status = 'ALERTA';
  }

  return { status, mensagens };
}

/* ============================================================
 * PERSISTÊNCIA LOCAL (INDEXEDDB)
 * ============================================================ */

const DB_NAME = 'ReproArticleAddressDB';
const DB_VERSION = 1;
const STORE_NAME = 'article_records';

/**
 * @deprecated (A-02) Mantido apenas para leitura migratória de versões antigas.
 * Remover em v6.0.
 */
const LOCAL_STORAGE_BACKUP_KEY = 'repro_article_records_backup';

/**
 * D-02: Flag persistente para seed único por dispositivo.
 * Evita re-injeção de dados fictícios após limpeza manual.
 */
const SEED_FLAG_KEY = 'repro_article_seed_v1_executed';

let idbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB não suportado no ambiente'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('data', 'data', { unique: false });
        store.createIndex('artigo', 'artigo', { unique: false });
        store.createIndex('endereco', 'endereco', { unique: false });
        store.createIndex('rua', 'rua', { unique: false });
        store.createIndex('setor', 'setor', { unique: false });
        store.createIndex('criadoEm', 'criadoEm', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return idbPromise;
}

/* ============================================================
 * D-02: Helpers de controle de seed
 * ============================================================ */

async function hasEverBeenSeeded(): Promise<boolean> {
  try {
    if (localStorage.getItem(SEED_FLAG_KEY) === 'true') return true;
  } catch {
    return true; // fail-safe: assume já seedado
  }
  return false;
}

async function markAsSeeded(): Promise<void> {
  try {
    localStorage.setItem(SEED_FLAG_KEY, 'true');
  } catch {
    // ignora
  }
}

/**
 * API pública: reativa seed em ambiente de demonstração.
 * Uso: telas de gestão, "Restaurar Dados Demo".
 */
export function resetSeedFlag(): void {
  try {
    localStorage.removeItem(SEED_FLAG_KEY);
  } catch {
    // ignora
  }
}

/* ============================================================
 * SEEDS INICIAIS
 * ============================================================ */

function getInitialSeedRecords(): ArticleAddressRecord[] {
  const hoje = new Date().toISOString().split('T')[0];
  const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const anteontem = new Date(Date.now() - 172800000).toISOString().split('T')[0];

  const seeds: Omit<ArticleAddressRecord, 'statusAuditoria' | 'mensagensAuditoria'>[] = [
    {
      id: 'rec-seed-1', data: hoje, artigo: 'ART-3091', endereco: 'B4VD-01',
      ctn: '14', rua: 'B4VD', setor: '87', hora: '08:15',
      colaborador: 'EMERSON GONÇALVES', origem: 'MANUAL',
      observacoes: 'Palete conferido', criadoEm: Date.now() - 15000000,
    },
    {
      id: 'rec-seed-2', data: hoje, artigo: 'ART-3091', endereco: 'B4VD-02',
      ctn: '10', rua: 'B4VD', setor: '87', hora: '08:30',
      colaborador: 'EMERSON GONÇALVES', origem: 'MANUAL',
      observacoes: '', criadoEm: Date.now() - 14000000,
    },
    {
      id: 'rec-seed-3', data: hoje, artigo: 'ART-4420', endereco: 'B4VD-03',
      ctn: '18', rua: 'B4VD', setor: '87', hora: '08:45',
      colaborador: 'EMERSON GONÇALVES', origem: 'MANUAL',
      observacoes: 'Demanda de reposição rápida', criadoEm: Date.now() - 13000000,
    },
    {
      id: 'rec-seed-4', data: hoje, artigo: 'ART-8105', endereco: 'B4VA-01',
      ctn: '22', rua: 'B4VA', setor: '87', hora: '09:10',
      colaborador: 'EMERSON GONÇALVES', origem: 'PLANILHA',
      observacoes: 'Lote prioritário', criadoEm: Date.now() - 12000000,
    },
    {
      id: 'rec-seed-5', data: hoje, artigo: 'ART-8105', endereco: 'B4VA-02',
      ctn: '12', rua: 'B4VA', setor: '87', hora: '09:25',
      colaborador: 'EMERSON GONÇALVES', origem: 'PLANILHA',
      observacoes: '', criadoEm: Date.now() - 11000000,
    },
    {
      id: 'rec-seed-6', data: hoje, artigo: 'ART-9921', endereco: 'B4VB-04',
      ctn: '8', rua: 'B4VB', setor: '87', hora: '10:00',
      colaborador: 'EMERSON GONÇALVES', origem: 'MANUAL',
      observacoes: '', criadoEm: Date.now() - 10000000,
    },
    {
      id: 'rec-seed-7', data: ontem, artigo: 'ART-5012', endereco: 'B4UZ-01',
      ctn: '16', rua: 'B4UZ', setor: '87', hora: '14:20',
      colaborador: 'EMERSON GONÇALVES', origem: 'PLANILHA',
      observacoes: 'Registro dia anterior', criadoEm: Date.now() - 95000000,
    },
    {
      id: 'rec-seed-8', data: ontem, artigo: 'ART-5012', endereco: 'B4UZ-02',
      ctn: '20', rua: 'B4UZ', setor: '87', hora: '14:40',
      colaborador: 'EMERSON GONÇALVES', origem: 'PLANILHA',
      observacoes: '', criadoEm: Date.now() - 94000000,
    },
    {
      id: 'rec-seed-9', data: anteontem, artigo: 'ART-3091', endereco: 'B5VG-01',
      ctn: '25', rua: 'B5VG', setor: '88', hora: '11:15',
      colaborador: 'OPERADOR SETOR 88', origem: 'MANUAL',
      observacoes: 'Volumosos', criadoEm: Date.now() - 180000000,
    },
  ];

  return seeds.map((s) => {
    const audit = auditArticleAddressRecord(s);
    return { ...s, statusAuditoria: audit.status, mensagensAuditoria: audit.mensagens };
  });
}

/* ============================================================
 * CARREGAMENTO (D-02: seed controlado)
 * ============================================================ */

export async function loadArticleAddressRecords(): Promise<ArticleAddressRecord[]> {
  try {
    const db = await getDb();

    const results = await new Promise<ArticleAddressRecord[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    // Caminho 1: Base tem dados → retorna
    if (results.length > 0) return results;

    // Caminho 2: Base vazia E nunca foi seedada → aplica seed uma única vez
    const alreadySeeded = await hasEverBeenSeeded();
    if (!alreadySeeded) {
      const seeds = getInitialSeedRecords();
      await saveBulkArticleAddressRecords(seeds);
      await markAsSeeded();
      if (import.meta.env.DEV) {
        console.info(`[articleAddressService] Seed inicial aplicado: ${seeds.length} registros.`);
      }
      return seeds;
    }

    // Caminho 3: Base vazia MAS já foi seedada → respeita limpeza do gestor
    return [];
  } catch (err) {
    console.warn('[articleAddressService] Falha ao carregar. Retornando vazio.', err);
    return [];
  }
}

/* ============================================================
 * ESCRITA (A-02: sem espelho localStorage)
 * ============================================================ */

export async function saveArticleAddressRecord(record: ArticleAddressRecord): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function saveBulkArticleAddressRecords(records: ArticleAddressRecord[]): Promise<boolean> {
  if (records.length === 0) return true;
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const rec of records) store.put(rec);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function deleteArticleAddressRecord(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function clearAllArticleAddressRecords(): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();

      tx.oncomplete = () => {
        // ✅ NÃO remove SEED_FLAG_KEY — respeita a intenção do gestor.
        // Se quiser re-seedar, chamar resetSeedFlag() explicitamente.
        try {
          localStorage.removeItem(LOCAL_STORAGE_BACKUP_KEY);
        } catch {
          // ignora
        }
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/* ============================================================
 * A-02: DEPRECATED — Espelho localStorage (no-op)
 * ============================================================ */

/** @deprecated (A-02) */
async function syncLocalStorageBackup() {
  if (import.meta.env.DEV) {
    console.warn(
      '[DEPRECATED] syncLocalStorageBackup() — use exportDatabaseSnapshot() ou supabaseBackupService.'
    );
  }
  // no-op intencional
}

/* ============================================================
 * MOTOR ANALÍTICO (inalterado)
 * ============================================================ */

export function computeArticleAddressStats(
  records: ArticleAddressRecord[],
  filterDate?: string,
  filterSector?: string,
  filterStreet?: string
): ArticleAddressStats {
  let filtered = records;
  if (filterDate && filterDate !== 'TODOS') filtered = filtered.filter((r) => r.data === filterDate);
  if (filterSector && filterSector !== 'TODOS') filtered = filtered.filter((r) => r.setor === filterSector);
  if (filterStreet && filterStreet !== 'TODOS') {
    filtered = filtered.filter((r) => r.rua.toUpperCase() === filterStreet.toUpperCase());
  }

  const totalRegistros = filtered.length;
  const articlesSet = new Set<string>();
  const addressesSet = new Set<string>();
  let totalCtn = 0;

  const auditSummary = { validados: 0, alertas: 0, inconsistentes: 0 };

  const streetMap = new Map<string, {
    rua: string; setor: string; enderecos: Set<string>; artigos: Set<string>; totalCtn: number;
  }>();

  const articleMap = new Map<string, {
    artigo: string; totalCtn: number; enderecos: Set<string>; ruas: Set<string>;
  }>();

  for (const rec of filtered) {
    articlesSet.add(rec.artigo.toUpperCase());
    addressesSet.add(rec.endereco.toUpperCase());
    totalCtn += Number(rec.ctn) || 0;

    if (rec.statusAuditoria === 'VALIDADO') auditSummary.validados++;
    else if (rec.statusAuditoria === 'ALERTA') auditSummary.alertas++;
    else auditSummary.inconsistentes++;

    const ruaKey = rec.rua.toUpperCase();
    if (!streetMap.has(ruaKey)) {
      streetMap.set(ruaKey, {
        rua: ruaKey, setor: rec.setor,
        enderecos: new Set(), artigos: new Set(), totalCtn: 0,
      });
    }
    const stItem = streetMap.get(ruaKey)!;
    stItem.enderecos.add(rec.endereco.toUpperCase());
    stItem.artigos.add(rec.artigo.toUpperCase());
    stItem.totalCtn += Number(rec.ctn) || 0;

    const artKey = rec.artigo.toUpperCase();
    if (!articleMap.has(artKey)) {
      articleMap.set(artKey, {
        artigo: artKey, totalCtn: 0, enderecos: new Set(), ruas: new Set(),
      });
    }
    const artItem = articleMap.get(artKey)!;
    artItem.totalCtn += Number(rec.ctn) || 0;
    artItem.enderecos.add(rec.endereco.toUpperCase());
    artItem.ruas.add(rec.rua.toUpperCase());
  }

  const enderecosPorRua = Array.from(streetMap.values()).map((s) => ({
    rua: s.rua, setor: s.setor,
    totalEnderecos: s.enderecos.size, totalCtn: s.totalCtn,
    artigos: Array.from(s.artigos), totalArtigos: s.artigos.size,
  })).sort((a, b) => b.totalEnderecos - a.totalEnderecos || b.totalCtn - a.totalCtn);

  const topArtigos = Array.from(articleMap.values()).map((a) => ({
    artigo: a.artigo, totalCtn: a.totalCtn,
    totalEnderecos: a.enderecos.size,
    ruas: Array.from(a.ruas), totalRuas: a.ruas.size,
  })).sort((a, b) => b.totalCtn - a.totalCtn || b.totalEnderecos - a.totalEnderecos);

  const topRuas = enderecosPorRua.slice(0, 10);

  const datasDisponiveis = Array.from(new Set(records.map((r) => r.data)))
    .filter(Boolean).sort((a, b) => b.localeCompare(a));

  const totalArtigosUnicos = articlesSet.size;
  const totalEnderecosUnicos = addressesSet.size;
  const mediaCtnPorEndereco = totalEnderecosUnicos > 0 ? Number((totalCtn / totalEnderecosUnicos).toFixed(1)) : 0;
  const mediaEnderecosPorRua = enderecosPorRua.length > 0 ? Number((totalEnderecosUnicos / enderecosPorRua.length).toFixed(1)) : 0;
  const taxaIntegridade = totalRegistros > 0 ? Math.round((auditSummary.validados / totalRegistros) * 100) : 100;

  return {
    totalRegistros, totalArtigosUnicos, totalEnderecosUnicos, totalCtn,
    mediaCtnPorEndereco, mediaEnderecosPorRua, taxaIntegridade,
    auditoriaResumo: auditSummary,
    enderecosPorRua, topArtigos, topRuas, datasDisponiveis,
  };
}

/* ============================================================
 * IMPORTAÇÃO / EXPORTAÇÃO (inalterado)
 * ============================================================ */

export function parsePastedSpreadsheetText(
  rawText: string,
  defaultDate: string = new Date().toISOString().split('T')[0],
  defaultOperator: string = 'OPERADOR'
): { validRecords: ArticleAddressRecord[]; errorCount: number } {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { validRecords: [], errorCount: 0 };

  const validRecords: ArticleAddressRecord[] = [];
  let errorCount = 0;

  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (
    firstLine.includes('artigo') || firstLine.includes('endereço') ||
    firstLine.includes('endereco') || firstLine.includes('ctn') ||
    firstLine.includes('caixa') || firstLine.includes('sku')
  ) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split('\t');

    let artigo = '';
    let endereco = '';
    let ctn = '1';
    let data = defaultDate;
    let volumes = 0;

    // Detect format based on columns count
    if (cols.length >= 11) {
      // Full WMS format
      data = cols[0] || defaultDate;
      artigo = cols[4] || '';
      ctn = cols[5] || '1';
      endereco = cols[8] || '';
      volumes = parseInt(cols[10], 10) || 0;
    } else if (cols.length >= 3) {
      // Basic 3+ column format: Artigo, Endereco, CTN
      artigo = cols[0] || '';
      endereco = cols[1] || '';
      ctn = cols[2] || '1';
    } else if (cols.length === 2) {
      // Minimal format: Artigo, Endereco
      artigo = cols[0] || '';
      endereco = cols[1] || '';
    }

    if (!artigo || !endereco) {
      errorCount++;
      continue;
    }

    const { rua, setor } = parseStreetAndSectorFromAddress(endereco);

    const candidate: ArticleAddressRecord = {
      id: `rec-wms-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      data: data,
      artigo: artigo.trim().toUpperCase(),
      endereco: endereco.trim().toUpperCase(),
      ctn: ctn.trim(),
      rua: rua.toUpperCase(),
      setor,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      colaborador: defaultOperator,
      origem: 'PLANILHA',
      statusAuditoria: 'VALIDADO',
      mensagensAuditoria: [],
      criadoEm: Date.now() + i,
      volumes,
    };

    const audit = auditArticleAddressRecord(candidate, validRecords);
    candidate.statusAuditoria = audit.status;
    candidate.mensagensAuditoria = audit.mensagens;

    if (candidate.statusAuditoria !== 'INCONSISTENTE') {
      validRecords.push(candidate);
    } else {
      errorCount++;
    }
  }

  return { validRecords, errorCount };
}

export function exportRecordsToExcel(
  records: ArticleAddressRecord[],
  fileName: string = 'Artigos_Enderecos_CTN.xlsx'
): void {
  const dataRows = records.map((r) => ({
    'Data de Registro': r.data,
    'Setor': r.setor,
    'Rua': r.rua,
    'Endereço Final': r.endereco,
    'Artigo': r.artigo,
    'CTN (Caixa)': r.ctn,
    'Cont. Pai': r.contenantPai || '',
    'End. Origem': r.enderecoOrigem || '',
    'Zona Origem': r.zonaOrigem || '',
    'End. Tampão': r.enderecoTampao || '',
    'Zona Destino': r.zonaDestino || '',
    'Uni': r.unidade || '',
    'Qtd': r.volumes || 0,
    'Status Auditoria': r.statusAuditoria,
    'Mensagens de Auditoria': r.mensagensAuditoria.join('; '),
    'Origem': r.origem,
    'Colaborador': r.colaborador || '',
    'Observações': r.observacoes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Artigos e Endereços');
  XLSX.writeFile(workbook, fileName);
}

export function exportRecordsToCsv(records: ArticleAddressRecord[]): string {
  const headers = ['Data', 'Setor', 'Rua', 'Endereco', 'Artigo', 'CTN', 'Status_Auditoria', 'Mensagens', 'Origem', 'Colaborador'];
  const rows = records.map((r) => [
    r.data, r.setor, r.rua, r.endereco, r.artigo, r.ctn,
    r.statusAuditoria,
    `"${(r.mensagensAuditoria || []).join('; ')}"`,
    r.origem,
    r.colaborador || '',
  ]);
  return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
}

