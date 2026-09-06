import { create } from 'zustand';
import { initDb } from '../dbLocal';

export interface ValidationRule {
  id: string;
  enderecoPere: string;
  contenantPere: string;
  contenantFils: string;
  artigo: string;
  quantidadePadrao: number;
}

interface RuleStore {
  rules: ValidationRule[];
  loadRulesFromDb: () => Promise<void>;
  syncRulesFromQuery: (queryRows: any[]) => Promise<number>;
}

export const useRuleStore = create<RuleStore>((set) => ({
  rules: [],
  
  loadRulesFromDb: async () => {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('validation_rules', 'readonly');
      const store = tx.objectStore('validation_rules');
      const req = store.getAll();
      req.onsuccess = () => {
        set({ rules: req.result });
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  },

  syncRulesFromQuery: async (queryRows) => {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('validation_rules', 'readwrite');
      const store = tx.objectStore('validation_rules');
      
      const clearReq = store.clear();
      
      clearReq.onsuccess = () => {
        let importedCount = 0;
        const newRules: ValidationRule[] = [];

        for (const row of queryRows) {
          const itemCode = row.ARTIGO || row.Article || row.G_product;
          if (!itemCode) continue;

          const rule: ValidationRule = {
            id: `${row.CONTEINER_PAI}_${row.CONTEINER_FILHO}_${itemCode}`,
            enderecoPere: row.ENDERECO_PAI || 'GERAL',
            contenantPere: String(row.CONTEINER_PAI || ''),
            contenantFils: String(row.CONTEINER_FILHO || ''),
            artigo: String(itemCode),
            quantidadePadrao: Number(row.QTD_FILHO || 1)
          };

          store.put({ ...rule, updatedAt: new Date().toISOString() });
          newRules.push(rule);
          importedCount++;
        }

        tx.oncomplete = () => {
          set({ rules: newRules });
          resolve(importedCount);
        };
        tx.onerror = () => reject(tx.error);
      };
      
      clearReq.onerror = () => reject(clearReq.error);
    });
  }
}));
