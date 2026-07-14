import { create } from 'zustand';
import { Log } from '../types';

interface HistoryState {
  logs: Log[];
  lastSyncTime: string;
  isSyncing: boolean;
  isImporting: boolean;
  networkStatus: 'online' | 'offline';
  setLogs: (logs: Log[] | ((prev: Log[]) => Log[])) => void;
  setNetworkStatus: (status: 'online' | 'offline') => void;
  setLastSyncTime: (time: string) => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setIsImporting: (isImporting: boolean) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  logs: [],
  lastSyncTime: '--:--:--',
  isSyncing: false,
  isImporting: false,
  networkStatus: 'online',
  setLogs: (logs) => set((state) => ({
    logs: typeof logs === 'function' ? logs(state.logs) : logs
  })),
  setNetworkStatus: (networkStatus) => set({ networkStatus }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setIsImporting: (isImporting) => set({ isImporting }),
}));
