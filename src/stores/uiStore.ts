import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  color: string;
}

export type TabType = 'cronometro' | 'ruas' | 'gestao' | 'painel' | 'historico' | 'followup';

interface UIState {
  activeTab: TabType;
  screensaverEnabled: boolean;
  screensaverTimeout: number;
  screensaverActive: boolean;
  toasts: Toast[];
  supabaseLoading: boolean;
  handleTabChange: (tab: TabType) => void;
  setScreensaverActive: (active: boolean) => void;
  updateScreensaverEnabled: (enabled: boolean, addToast?: (msg: string, col?: string) => void) => void;
  updateScreensaverTimeout: (timeout: number, addToast?: (msg: string, col?: string) => void) => void;
  addToast: (msg: string, col?: string) => void;
  removeToast: (id: number) => void;
  setSupabaseLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: (() => {
    // 1. Prioridade: Parâmetro direto na URL (?tab=ruas, ?tab=gestao, ?view=gestao, etc.)
    if (typeof window !== 'undefined' && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = (urlParams.get('tab') || urlParams.get('view')) as TabType;
      if (tabParam && ['cronometro', 'ruas', 'gestao', 'painel', 'historico', 'followup'].includes(tabParam)) {
        return tabParam;
      }
    }

    // 2. Persistência no LocalStorage
    const saved = localStorage.getItem('repro_active_tab') as TabType;
    if (saved === 'cronometro' || saved === 'ruas' || saved === 'gestao' || saved === 'painel' || saved === 'historico' || saved === 'followup') {
      return saved;
    }
    return 'cronometro';
  })(),
  screensaverEnabled: localStorage.getItem('repro_screensaver_enabled') === 'true',
  screensaverTimeout: (() => {
    const saved = localStorage.getItem('repro_screensaver_timeout');
    return saved ? parseInt(saved, 10) : 5;
  })(),
  screensaverActive: false,
  toasts: [],
  supabaseLoading: false,
  handleTabChange: (tab) => {
    localStorage.setItem('repro_active_tab', tab);
    set({ activeTab: tab });
  },
  setScreensaverActive: (active) => set((state) => ({ 
    screensaverActive: state.screensaverEnabled ? active : false 
  })),
  updateScreensaverEnabled: (enabled, addToast) => {
    localStorage.setItem('repro_screensaver_enabled', String(enabled));
    set({ screensaverEnabled: enabled, screensaverActive: enabled ? false : false });
    if (addToast) {
      addToast(`Descanso de ecrã: ${enabled ? 'ATIVADO' : 'DESATIVADO'}`, enabled ? 'var(--color-success)' : 'var(--color-info)');
    }
  },
  updateScreensaverTimeout: (timeout, addToast) => {
    localStorage.setItem('repro_screensaver_timeout', String(timeout));
    set({ screensaverTimeout: timeout });
    if (addToast) {
      addToast(`Tempo limite do protetor: ${timeout} Minutos`, 'var(--color-info)');
    }
  },
  addToast: (msg, col = 'var(--color-terminal-accent)') => {
    const id = Date.now() + Math.random();
    set((state) => ({
      toasts: [...state.toasts, { id, message: msg, color: col }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4500);
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  setSupabaseLoading: (loading) => set({ supabaseLoading: loading }),
}));
