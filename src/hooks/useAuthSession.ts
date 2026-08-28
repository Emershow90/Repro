import { useCallback, useState } from 'react';

export interface AuthUser {
  id?: string;
  uid?: string;
  email?: string;
  user_metadata?: { full_name?: string };
}

const USER_KEY = 'repro_local_user';
const GUEST_KEY = 'repro_guest_mode';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? value as AuthUser : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

/** Keeps browser-session parsing and persistence outside the presentation layer. */
export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem(GUEST_KEY) === 'true');

  const login = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setIsGuest(false);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    localStorage.setItem(GUEST_KEY, 'false');
  }, []);

  const enterGuestMode = useCallback(() => {
    setUser(null);
    setIsGuest(true);
    localStorage.removeItem(USER_KEY);
    localStorage.setItem(GUEST_KEY, 'true');
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem(USER_KEY);
    localStorage.setItem(GUEST_KEY, 'false');
  }, []);

  return { user, isGuest, isUnlocked: Boolean(user || isGuest), login, logout, enterGuestMode };
}
