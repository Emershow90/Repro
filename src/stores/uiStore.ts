import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  color: string;
}

interface UIState {
  activeTab: 'painel' | 'historico' | 'followup';
  screensaverEnabled: boolean;
  screensaverTimeout: number;
  screensaverActive: boolean;
  toasts: Toast[];
  supabaseLoading: boolean;
  handleTabChange: (tab: 'painel' | 'historico' | 'followup') => void;
  setScreensaverActive: (active: boolean) => void;
  updateScreensaverEnabled: (enabled: boolean, addToast?: (msg: string, col?: string) => void) => void;
  updateScreensaverTimeout: (timeout: number, addToast?: (msg: string, col?: string) => void) => void;
  addToast: (msg: string, col?: string) => void;
  removeToast: (id: number) => void;
  setSupabaseLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: (() => {
    const saved = localStorage.getItem('repro_active_tab');
    if (saved === 'painel' || saved === 'historico' || saved === 'followup') return saved;
    return 'painel';
  })(),
  screensaverEnabled: localStorage.getItem('repro_screensaver_enabled') !== 'false',
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
  setScreensaverActive: (active) => set({ screensaverActive: active }),
  updateScreensaverEnabled: (enabled, addToast) => {
    localStorage.setItem('repro_screensaver_enabled', String(enabled));
    set({ screensaverEnabled: enabled });
    if (addToast) {
      addToast(`Protetor de ecrã: ${enabled ? 'ATIVADO' : 'DESATIVADO'}`, 'var(--color-info)');
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
