/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Serviço de autenticação por perfil.
 * - `user` → sessão local (sem senha)
 * - `admin` → validação via RPC Supabase (PIN)
 */

import { supabase } from '../utils/supabase/client';
import type { UserRole } from '../config/rolePermissions';

export interface AuthSession {
  id: string;
  role: UserRole;
  email: string;
  fullName: string;
  issuedAt: number;
}

const ADMIN_SESSION_KEY = 'repro_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

/* ============================================================
 * USER — entrada direta (sem credencial)
 * ============================================================ */

export function createUserSession(): AuthSession {
  return {
    id: `local_user_${Date.now()}`,
    role: 'user',
    email: 'operador@local',
    fullName: 'Operador',
    issuedAt: Date.now(),
  };
}

/* ============================================================
 * ADMIN — validação de PIN via RPC
 * ============================================================ */

export async function loginAdminWithPin(pin: string): Promise<AuthSession> {
  const cleanPin = pin.trim();
  if (!cleanPin || cleanPin.length < 4) {
    throw new Error('PIN deve ter no mínimo 4 dígitos.');
  }

  const client = supabase;
  if (!client) {
    throw new Error('Serviço Supabase não configurado. Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await client.rpc('verify_supervisor_pin', {
    input_pin: cleanPin,
  });

  if (error) {
    console.warn('[authService] RPC error:', error);
    throw new Error('Erro ao validar PIN. Tente novamente.');
  }

  if (data !== true) {
    throw new Error('PIN incorreto.');
  }

  const session: AuthSession = {
    id: `admin_${Date.now()}`,
    role: 'admin',
    email: 'admin@local',
    fullName: 'Administrador',
    issuedAt: Date.now(),
  };

  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignora falha de storage
  }

  return session;
}

/* ============================================================
 * SESSÃO ADMIN PERSISTENTE — com TTL
 * ============================================================ */

export function getStoredAdminSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as AuthSession;
    if (session.role !== 'admin') return null;

    const age = Date.now() - session.issuedAt;
    if (age > ADMIN_SESSION_TTL_MS) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignora
  }
}

export function logout(): void {
  clearAdminSession();
  try {
    localStorage.removeItem('repro_local_user');
    localStorage.removeItem('repro_guest_mode');
  } catch {
    // ignora
  }
}
