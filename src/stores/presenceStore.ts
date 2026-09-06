import { create } from 'zustand';

export interface ActiveTask {
  operador: string;
  endereco: string;
  timestamp: number;
}

interface PresenceStore {
  activeTasks: Record<string, ActiveTask>; // chave: endereco
  registerActivity: (operador: string, endereco: string) => void;
  clearActivity: (endereco: string) => void;
  checkCollision: (endereco: string, currentUser: string) => ActiveTask | null;
}

const TASK_TTL_MS = 10 * 60 * 1000; // 10 minutos de trava máxima

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  activeTasks: {},

  registerActivity: (operador, endereco) => {
    set((state) => ({
      activeTasks: {
        ...state.activeTasks,
        [endereco]: { operador, endereco, timestamp: Date.now() }
      }
    }));
  },

  clearActivity: (endereco) => {
    set((state) => {
      const newTasks = { ...state.activeTasks };
      delete newTasks[endereco];
      return { activeTasks: newTasks };
    });
  },

  checkCollision: (endereco, currentUser) => {
    const task = get().activeTasks[endereco];
    if (!task) return null;

    const age = Date.now() - task.timestamp;
    if (age > TASK_TTL_MS) {
      get().clearActivity(endereco); // Limpa trava fantasma
      return null;
    }

    // Se a tarefa é de OUTRO operador, há colisão
    if (task.operador !== currentUser) {
      return task;
    }

    return null;
  }
}));
