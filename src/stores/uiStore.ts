import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  color: string;
}

export type TabType = 'cronometro' | 'ruas' | 'gestao' | 'painel' | 'historico' | 'followup';
export type AppTheme = 'torre' | 'as400';

interface UIState {
  activeTab: TabType;
  theme: AppTheme;
  screensaverEnabled: boolean;
  screensaverTimeout: number;
  screensaverActive: boolean;
  toasts: Toast[];
  supabaseLoading: boolean;
  handleTabChange: (tab: TabType) => void;
  toggleTheme: (addToast?: (msg: string, col?: string) => void) => void;
  setTheme: (theme: AppTheme, addToast?: (msg: string, col?: string) => void) => void;
  setScreensaverActive: (active: boolean) => void;
  updateScreensaverEnabled: (enabled: boolean, addToast?: (msg: string, col?: string) => void) => void;
  updateScreensaverTimeout: (timeout: number, addToast?: (msg: string, col?: string) => void) => void;
  addToast: (msg: string, col?: string) => void;
  removeToast: (id: number) => void;
  setSupabaseLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('repro_theme') as AppTheme;
      if (saved === 'as400' || saved === 'torre') return saved;
    }
    return 'torre';
  })(),
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
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch (e) {
        console.error("Failed to update URL param:", e);
      }
    }
    set({ activeTab: tab });
  },
  toggleTheme: (addToast) => {
    set((state) => {
      const nextTheme = state.theme === 'as400' ? 'torre' : 'as400';
      if (typeof window !== 'undefined') {
        localStorage.setItem('repro_theme', nextTheme);
        if (nextTheme === 'as400') {
          document.documentElement.classList.add('theme-as400');
        } else {
          document.documentElement.classList.remove('theme-as400');
        }
      }
      if (addToast) {
        addToast(
          nextTheme === 'as400' 
            ? '📟 TEMA IBM AS/400 5250 ATIVADO (Fósforo Verde)' 
            : '🌑 TEMA TORRE OBSIDIAN ATIVADO', 
          nextTheme === 'as400' ? '#00ff66' : 'var(--color-terminal-accent)'
        );
      }
      return { theme: nextTheme };
    });
  },
  setTheme: (theme, addToast) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('repro_theme', theme);
      if (theme === 'as400') {
        document.documentElement.classList.add('theme-as400');
      } else {
        document.documentElement.classList.remove('theme-as400');
      }
    }
    set({ theme });
    if (addToast) {
      addToast(
        theme === 'as400' 
          ? '📟 TEMA IBM AS/400 5250 ATIVADO (Fósforo Verde)' 
          : '🌑 TEMA TORRE OBSIDIAN ATIVADO', 
        theme === 'as400' ? '#00ff66' : 'var(--color-terminal-accent)'
      );
    }
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
