/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * IndexedDB Database Layer - Performance Optimized with Indices & Bulk Operations (Anti-N+1)
 */

import { 
  Log, 
  AppTimerState, 
  AuditLog, 
  CtnGenealogyReport, 
  CtnChildBoxGroup, 
  CtnArticleNode 
} from '../types';
import { telemetry } from '../utils/telemetry';

export type { AuditLog };

const DB_NAME = "TerminalReproV5";
const DB_VERSION = 3; // Incremented to add validation_rules & genealogy indexes

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

export function initDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        let logsStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('logs')) {
          logsStore = db.createObjectStore('logs', { keyPath: 'id' });
        } else {
          logsStore = (event.target as IDBOpenDBRequest).transaction!.objectStore('logs');
        }

        // Ensure all single and compound indexes exist
        if (!logsStore.indexNames.contains('synced')) {
          logsStore.createIndex('synced', 'synced', { unique: false });
        }
        if (!logsStore.indexNames.contains('timestamp')) {
          logsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!logsStore.indexNames.contains('data')) {
          logsStore.createIndex('data', 'data', { unique: false });
        }
        if (!logsStore.indexNames.contains('setor')) {
          logsStore.createIndex('setor', 'setor', { unique: false });
        }
        if (!logsStore.indexNames.contains('colaborador')) {
          logsStore.createIndex('colaborador', 'colaborador', { unique: false });
        }
        if (!logsStore.indexNames.contains('setor_data')) {
          logsStore.createIndex('setor_data', ['setor', 'data'], { unique: false });
        }
        if (!logsStore.indexNames.contains('contenantPai')) {
          logsStore.createIndex('contenantPai', 'contenantPai', { unique: false });
        }
        if (!logsStore.indexNames.contains('artigo')) {
          logsStore.createIndex('artigo', 'artigo', { unique: false });
        }

        // Stores auxiliares
        if (!db.objectStoreNames.contains('audit_logs')) {
          db.createObjectStore('audit_logs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('validation_rules')) {
          db.createObjectStore('validation_rules', { keyPath: 'id' });
        }
      };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      telemetry.info('IndexedDB', `Banco ${DB_NAME} v${DB_VERSION} inicializado com índices.`);
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      telemetry.error('IndexedDB', 'Erro ao abrir banco de dados local', err);
      reject(err);
    };
    } catch (err) {
      telemetry.error('IndexedDB', 'Erro fatal síncrono ao abrir DB', err);
      reject(err);
    }
  });

  return initPromise;
}

export function getLocalDbInstance(): IDBDatabase | null {
  return dbInstance;
}

/**
 * Retorna todos os logs ordenados por timestamp descrescente
 */
export async function getLogs(): Promise<Log[]> {
  const db = dbInstance || await initDb();
  return telemetry.time('IndexedDB', 'getLogs', () => {
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('logs', 'readonly');
        const store = transaction.objectStore('logs');
        
        // Use index on timestamp when available for pre-sorted retrieval
        if (store.indexNames.contains('timestamp')) {
          const index = store.index('timestamp');
          const req = index.openCursor(null, 'prev');
          const results: Log[] = [];
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              results.push(cursor.value);
              cursor.continue();
            } else {
              resolve(results);
            }
          };
          req.onerror = () => reject(req.error);
        } else {
          const request = store.getAll();
          request.onsuccess = () => {
            const result = request.result as Log[];
            resolve(result.sort((a, b) => b.timestamp - a.timestamp));
          };
          request.onerror = () => reject(request.error);
        }
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Busca apenas registros NÃO sincronizados de forma segura e rápida
 */
export async function getUnsyncedLogs(): Promise<Log[]> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');
      const request = store.getAll();
      request.onsuccess = () => {
        const result = (request.result as Log[]) || [];
        resolve(result.filter(l => !l.synced));
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Busca logs filtrados por data utilizando índice seguro ou fallback
 */
export async function getLogsByDate(data: string): Promise<Log[]> {
  if (!data || typeof data !== 'string') return [];
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readonly');
      const store = transaction.objectStore('logs');
      if (store.indexNames.contains('data')) {
        try {
          const index = store.index('data');
          const request = index.getAll(IDBKeyRange.only(data));
          request.onsuccess = () => resolve((request.result as Log[]) || []);
          request.onerror = () => {
            store.getAll().onsuccess = (e: any) => {
              const all = (e.target.result as Log[]) || [];
              resolve(all.filter(l => l.data === data));
            };
          };
          return;
        } catch {
          // Fallback if index fails
        }
      }
      store.getAll().onsuccess = (e: any) => {
        const all = (e.target.result as Log[]) || [];
        resolve(all.filter(l => l.data === data));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Salva um log individualmente
 */
export async function saveLog(log: Log): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readwrite');
      const store = transaction.objectStore('logs');
      store.put(log);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Batch/Bulk Save (Anti-N+1): Salva múltiplos logs em UMA ÚNICA transação atômica
 */
export async function saveLogsBulk(logs: Log[]): Promise<boolean> {
  if (logs.length === 0) return true;
  const db = dbInstance || await initDb();
  return telemetry.time('IndexedDB', `saveLogsBulk (${logs.length} itens)`, () => {
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');
        
        for (let i = 0; i < logs.length; i++) {
          store.put(logs[i]);
        }
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function deleteLog(id: number): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('logs', 'readwrite');
      const store = transaction.objectStore('logs');
      store.delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function saveState<T = any>(key: string, data: T): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      store.put({ key, data });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getState<T = any>(key: string): Promise<T | null> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('state', 'readonly');
      const store = transaction.objectStore('state');
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data as T);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearLogsAndState(): Promise<boolean> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['logs', 'state'], 'readwrite');
      const logsStore = transaction.objectStore('logs');
      const stateStore = transaction.objectStore('state');

      logsStore.clear();
      stateStore.clear();

      transaction.oncomplete = () => {
        telemetry.warn('IndexedDB', 'Banco de dados local limpo com sucesso.');
        resolve(true);
      };
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Fila de Eventos Operacionais para Sincronização em Segundo Plano (Zero bloqueio no PDT)
export async function enqueueOperationalEvent(event: any): Promise<void> {
  try {
    const queue = (await getState<any[]>('operational_sync_queue')) || [];
    if (!queue.some(item => item.id === event.id)) {
      queue.push(event);
      await saveState('operational_sync_queue', queue);
    }
  } catch (err) {
    console.warn('Falha ao enfileirar evento operacional offline:', err);
  }
}

export async function getOperationalSyncQueue(): Promise<any[]> {
  try {
    return (await getState<any[]>('operational_sync_queue')) || [];
  } catch {
    return [];
  }
}

export async function clearOperationalSyncQueue(processedIds: string[]): Promise<void> {
  try {
    const queue = (await getState<any[]>('operational_sync_queue')) || [];
    const remaining = queue.filter(item => !processedIds.includes(item.id));
    await saveState('operational_sync_queue', remaining);
  } catch (err) {
    console.warn('Erro ao limpar fila de eventos sincronizados:', err);
  }
}

// ==========================================
// MÉTODOS DE AUDITORIA (AUDIT LOGS)
// ==========================================

export async function saveAuditLog(log: AuditLog): Promise<void> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains('audit_logs')) {
        resolve();
        return;
      }
      const transaction = db.transaction('audit_logs', 'readwrite');
      const store = transaction.objectStore('audit_logs');
      store.put(log);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains('audit_logs')) {
        resolve([]);
        return;
      }
      const transaction = db.transaction('audit_logs', 'readonly');
      const store = transaction.objectStore('audit_logs');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as AuditLog[]) || []);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteAuditLog(id: string): Promise<void> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains('audit_logs')) {
        resolve();
        return;
      }
      const transaction = db.transaction('audit_logs', 'readwrite');
      const store = transaction.objectStore('audit_logs');
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================
// MÓDULO DE GENEALOGIA E RASTREABILIDADE DE ESTOQUE
// ==========================================

/**
 * Retorna os últimos CTNs e Artigos únicos movimentados no armazém para sugestões rápidas
 */
export async function getRecentCtnsAndArticles(): Promise<{ ctns: string[]; artigos: string[] }> {
  const allLogs = await getLogs();
  const ctnSet = new Set<string>();
  const artSet = new Set<string>();

  for (const log of allLogs) {
    if (log.contenantPai && log.contenantPai.trim()) {
      ctnSet.add(log.contenantPai.trim().toUpperCase());
    }
    if (log.artigo && log.artigo.trim()) {
      artSet.add(log.artigo.trim().toUpperCase());
    }
    if (ctnSet.size >= 12 && artSet.size >= 12) break;
  }

  return {
    ctns: Array.from(ctnSet).slice(0, 10),
    artigos: Array.from(artSet).slice(0, 10)
  };
}

/**
 * Reconstrói a árvore genealógica completa de movimentação de um CTN Pai ou Artigo
 */
export async function searchCtnGenealogy(term: string): Promise<CtnGenealogyReport | null> {
  const cleanTerm = term.trim().toUpperCase();
  if (!cleanTerm) return null;

  const [allLogs, allAuditLogs] = await Promise.all([
    getLogs(),
    getAuditLogs()
  ]);

  // Carrega regras de validação para verificar cadastro AS/400
  let validationRules: any[] = [];
  try {
    const db = dbInstance || await initDb();
    if (db.objectStoreNames.contains('validation_rules')) {
      validationRules = await new Promise((res) => {
        const tx = db.transaction('validation_rules', 'readonly');
        const req = tx.objectStore('validation_rules').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
    }
  } catch {
    validationRules = [];
  }

  // Filtra logs correspondentes ao termo (contenantPai, artigo ou lote em observações)
  const matchedLogs = allLogs.filter(log => {
    const ctn = (log.contenantPai || '').toUpperCase();
    const art = (log.artigo || '').toUpperCase();
    const obs = (log.observacoes || '').toUpperCase();
    const rua = (log.rua || '').toUpperCase();
    return ctn.includes(cleanTerm) || art.includes(cleanTerm) || obs.includes(cleanTerm) || rua === cleanTerm;
  });

  // Filtra divergências de auditoria correspondentes
  const matchedAudits = allAuditLogs.filter(a => {
    const pai = (a.contexto?.ctnPaiBipado || '').toUpperCase();
    const filho = (a.contexto?.ctnFilhoBipado || '').toUpperCase();
    const art = (a.contexto?.artigoEsperado || '').toUpperCase();
    const op = (a.operador || '').toUpperCase();
    const rua = (a.rua || '').toUpperCase();
    return pai.includes(cleanTerm) || filho.includes(cleanTerm) || art.includes(cleanTerm) || op.includes(cleanTerm) || rua.includes(cleanTerm);
  });

  if (matchedLogs.length === 0 && matchedAudits.length === 0) {
    return null;
  }

  // Determina o CTN Pai mestre
  let resolvedCtnPai = cleanTerm;
  const exactCtnLog = matchedLogs.find(l => (l.contenantPai || '').toUpperCase() === cleanTerm);
  if (!exactCtnLog && matchedLogs.length > 0) {
    resolvedCtnPai = matchedLogs[0].contenantPai || cleanTerm;
  }

  // Agrupa logs por artigo
  const articlesMap = new Map<string, {
    artigo: string;
    totalCaixas: number;
    gruposFilhos: CtnChildBoxGroup[];
    ruas: Set<string>;
    operadores: Set<string>;
    divergencias: number;
  }>();

  let totalCaixasGlobal = 0;
  const ruasGlobal = new Set<string>();
  const operadoresGlobal = new Set<string>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const log of matchedLogs) {
    const artCode = (log.artigo || 'NÃO_ESPECIFICADO').toUpperCase();
    totalCaixasGlobal += log.volumes || 0;

    if (log.rua) ruasGlobal.add(log.rua);
    if (log.colaborador) operadoresGlobal.add(log.colaborador);
    if (log.timestamp) {
      minTs = Math.min(minTs, log.timestamp);
      maxTs = Math.max(maxTs, log.timestamp);
    }

    if (!articlesMap.has(artCode)) {
      articlesMap.set(artCode, {
        artigo: artCode,
        totalCaixas: 0,
        gruposFilhos: [],
        ruas: new Set<string>(),
        operadores: new Set<string>(),
        divergencias: 0
      });
    }

    const entry = articlesMap.get(artCode)!;
    entry.totalCaixas += log.volumes || 0;
    if (log.rua) entry.ruas.add(log.rua);
    if (log.colaborador) entry.operadores.add(log.colaborador);

    // Extrai faixa de caixas filhas de observações (ex: "Lote: CX01 a CX04")
    let cxIni = '-';
    let cxFin = '-';
    if (log.observacoes) {
      const match = log.observacoes.match(/Lote:\s*(\S+)\s+a\s+(\S+)/i);
      if (match) {
        cxIni = match[1];
        cxFin = match[2];
      } else {
        cxIni = log.observacoes;
        cxFin = log.observacoes;
      }
    }

    entry.gruposFilhos.push({
      id: log.id,
      caixaInicio: cxIni,
      caixaFim: cxFin,
      volumesCalculados: log.volumes || 0,
      operador: log.colaborador,
      rua: log.rua || '',
      timestamp: log.timestamp || Date.now(),
      data: log.data,
      observacoes: log.observacoes,
      synced: log.synced
    });
  }

  // Constrói nós de artigo
  const artigosNodes: CtnArticleNode[] = Array.from(articlesMap.values()).map(a => {
    // Procura se tem regra cadastrada para esse artigo e esse CTN pai
    const rule = validationRules.find(r => 
      (r.artigo || '').toUpperCase() === a.artigo && 
      (r.contenantPere || '').toUpperCase() === resolvedCtnPai
    );
    const qtdPadrao = rule ? rule.quantidadePadrao : 1;
    const totalPecas = a.totalCaixas * qtdPadrao;

    // Conta divergências atreladas a este artigo
    const artAudits = matchedAudits.filter(aud => 
      (aud.contexto?.artigoEsperado || '').toUpperCase() === a.artigo
    ).length;

    return {
      artigo: a.artigo,
      totalCaixas: a.totalCaixas,
      totalPecasEstimadas: totalPecas,
      gruposFilhos: a.gruposFilhos.sort((x, y) => x.timestamp - y.timestamp),
      ruasDestino: Array.from(a.ruas),
      operadores: Array.from(a.operadores),
      divergenciasDetectadas: artAudits,
      possuiRegraCadastrada: Boolean(rule),
      quantidadePadraoRegra: rule ? rule.quantidadePadrao : undefined
    };
  });

  // Determina status
  let status: 'COMPLETO' | 'PARCIAL' | 'DIVERGENTE' = 'COMPLETO';
  if (matchedAudits.length > 0) {
    status = 'DIVERGENTE';
  } else if (artigosNodes.length === 0 || totalCaixasGlobal === 0) {
    status = 'PARCIAL';
  }

  return {
    termoPesquisado: cleanTerm,
    ctnPai: resolvedCtnPai,
    totalCaixas: totalCaixasGlobal,
    totalArtigosDistintos: artigosNodes.length,
    totalEventos: matchedLogs.length,
    artigos: artigosNodes,
    ruasAtendidas: Array.from(ruasGlobal),
    operadoresEnvolvidos: Array.from(operadoresGlobal),
    primeiraMovimentacaoTs: isFinite(minTs) ? minTs : undefined,
    ultimaMovimentacaoTs: isFinite(maxTs) ? maxTs : undefined,
    status,
    auditoriasRelacionadas: matchedAudits.sort((x, y) => y.timestamp - x.timestamp),
    logsBrutos: matchedLogs.sort((x, y) => y.timestamp - x.timestamp)
  };
}

export interface DatabaseSnapshot {
  version: number;
  timestamp: string;
  createdAt: number;
  environment: string;
  counts: {
    logs: number;
    auditLogs: number;
    states: number;
    validationRules: number;
  };
  data: {
    logs: Log[];
    auditLogs: any[];
    states: any[];
    validationRules: any[];
  };
}

/**
 * Extrai snapshot completo da base IndexedDB para backup em nuvem (Supabase / JSON)
 */
export async function exportDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const stores = ['logs', 'audit_logs', 'state', 'validation_rules'].filter(s => db.objectStoreNames.contains(s));
      const tx = db.transaction(stores, 'readonly');

      const logsReq = stores.includes('logs') ? tx.objectStore('logs').getAll() : null;
      const auditReq = stores.includes('audit_logs') ? tx.objectStore('audit_logs').getAll() : null;
      const stateReq = stores.includes('state') ? tx.objectStore('state').getAll() : null;
      const rulesReq = stores.includes('validation_rules') ? tx.objectStore('validation_rules').getAll() : null;

      tx.oncomplete = () => {
        const logs: Log[] = logsReq?.result || [];
        const auditLogs = auditReq?.result || [];
        const states = stateReq?.result || [];
        const validationRules = rulesReq?.result || [];

        resolve({
          version: 5,
          timestamp: new Date().toISOString(),
          createdAt: Date.now(),
          environment: 'TerminalReproV5-IndexedDB',
          counts: {
            logs: logs.length,
            auditLogs: auditLogs.length,
            states: states.length,
            validationRules: validationRules.length
          },
          data: {
            logs,
            auditLogs,
            states,
            validationRules
          }
        });
      };

      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Importa e mescla um snapshot de banco de dados (vindos do Supabase ou backup JSON)
 * Evita duplicações e preserva dados já existentes localmente.
 */
export async function importDatabaseSnapshot(snapshot: DatabaseSnapshot): Promise<{
  importedLogs: number;
  importedStates: number;
  importedAudits: number;
}> {
  if (!snapshot || !snapshot.data) {
    throw new Error('Snapshot inválido ou corrompido.');
  }

  const db = dbInstance || await initDb();
  return new Promise((resolve, reject) => {
    try {
      const stores = ['logs', 'audit_logs', 'state', 'validation_rules'].filter(s => db.objectStoreNames.contains(s));
      const tx = db.transaction(stores, 'readwrite');

      let importedLogs = 0;
      let importedStates = 0;
      let importedAudits = 0;

      // 1. Logs
      if (stores.includes('logs') && Array.isArray(snapshot.data.logs)) {
        const logsStore = tx.objectStore('logs');
        snapshot.data.logs.forEach(log => {
          if (log && log.id) {
            logsStore.put(log);
            importedLogs++;
          }
        });
      }

      // 2. State
      if (stores.includes('state') && Array.isArray(snapshot.data.states)) {
        const stateStore = tx.objectStore('state');
        snapshot.data.states.forEach(st => {
          if (st && st.key) {
            stateStore.put(st);
            importedStates++;
          }
        });
      }

      // 3. Audit logs
      if (stores.includes('audit_logs') && Array.isArray(snapshot.data.auditLogs)) {
        const auditStore = tx.objectStore('audit_logs');
        snapshot.data.auditLogs.forEach(aud => {
          if (aud && aud.id) {
            auditStore.put(aud);
            importedAudits++;
          }
        });
      }

      tx.oncomplete = () => {
        telemetry.info('IndexedDB', `Snapshot mesclado: ${importedLogs} logs, ${importedStates} estados.`);
        resolve({ importedLogs, importedStates, importedAudits });
      };

      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

