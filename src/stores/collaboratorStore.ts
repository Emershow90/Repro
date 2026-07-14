import { create } from 'zustand';

interface CollaboratorState {
  currentUser: string;
  currentRole: string;
  activeOperator: string;
  updateCurrentUser: (user: string) => void;
  updateCurrentRole: (role: string, addToast?: (msg: string, col?: string) => void) => void;
  setActiveOperator: (operator: string) => void;
}

export const useCollaboratorStore = create<CollaboratorState>((set) => ({
  currentUser: localStorage.getItem('repro_current_user') || 'Emerson Gonçalves',
  currentRole: localStorage.getItem('repro_current_role') || 'Coordenador',
  activeOperator: localStorage.getItem('repro_active_operator') || '',
  updateCurrentUser: (user) => {
    if (!user.trim()) return;
    localStorage.setItem('repro_current_user', user);
    set({ currentUser: user });
  },
  updateCurrentRole: (role, addToast) => {
    const cleanRole = role.trim();
    localStorage.setItem('repro_current_role', cleanRole);
    set({ currentRole: cleanRole });
    if (addToast) {
      addToast(`Função de acesso alterada para: ${cleanRole.toUpperCase()}`, 'var(--color-info)');
    }
  },
  setActiveOperator: (operator) => {
    localStorage.setItem('repro_active_operator', operator);
    set({ activeOperator: operator });
  },
}));
