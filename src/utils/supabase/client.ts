/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cliente Supabase (singleton lazy) + operações de log e perfil.
 *
 * Refatorado em 2026-09-26:
 * - fail-soft: NUNCA lança no top-level (evita matar o app inteiro)
 * - tipagem SupabaseClient (era any)
 * - lazy init memoizado (evita reconexões WebSocket)
 * - removidas funções de auth OAuth/email (sistema usa PIN via RPC)
 * - guard contra upsert de array vazio
 * - created_at removido do syncPerfil (deixa o DB decidir)
 */

import {
  createClient as createSupabaseClient,
  SupabaseClient,
} from '@supabase/supabase-js';
import { Log } from '../../types';

// ============================================================
// Env vars — validação fail-soft
// ============================================================

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

// Log uma única vez (sem throw) — o app continua funcionando sem Supabase
if (!hasSupabaseEnv) {
  console.warn(
    '[supabase/client] VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY ausentes. ' +
    'Login admin e backup em nuvem estarão desabilitados. ' +
    'Para habilitar, crie o .env e reinicie o dev server (ou configure na Vercel).'
  );
}

// ============================================================
// Cliente singleton (lazy + memoizado)
// ============================================================

let _client: SupabaseClient | null = null;
let _attempted = false;

export function getSupabase(): SupabaseClient | null {
  if (_attempted) return _client;
  _attempted = true;

  if (!hasSupabaseEnv) return null;

  try {
    _client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    return _client;
  } catch (err) {
    console.error('[supabase/client] Falha ao inicializar cliente:', err);
    return null;
  }
}

/**
 * Instância única para uso direto (ex: `supabase?.rpc(...)`).
 * Pode ser `null` — sempre cheque antes.
 */
export const supabase = getSupabase();

// ============================================================
// Perfil (tabela 'perfil')
// ============================================================

export async function syncPerfilDirectly(
  uid: string,
  email: string,
  name: string,
  role: string,
  sector: string,
) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('perfil')
    .upsert({ uid, email, name, role, sector }, { onConflict: 'uid' });

  if (error) throw error;
  return data;
}

export async function fetchPerfilDirectly(uid: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('perfil')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ============================================================
// Logs (tabela 'logs')
// ============================================================

export async function saveLogsDirectly(logs: Log[], userUid: string) {
  const client = getSupabase();
  if (!client) return null;
  if (!logs.length) return [];

  const formattedLogs = logs.map((log) => ({
    id: log.id,
    user_uid: userUid,
    data: log.data,
    dia: log.dia,
    semana: log.semana,
    atividade: log.atividade,
    colaborador: log.colaborador,
    setor: log.setor || null,
    volumes: log.volumes,
    horas: log.horas,
    vph: log.vph,
    timestamp: log.timestamp,
    synced: true,
    tipo: log.tipo,
  }));

  try {
    const { data, error } = await client
      .from('logs')
      .upsert(formattedLogs, { onConflict: 'id' });

    if (error) {
      console.warn('[supabase] saveLogsDirectly upsert:', error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[supabase] saveLogsDirectly network:', err?.message || err);
    return null;
  }
}

export async function fetchLogsDirectly(userUid: string): Promise<Log[]> {
  const client = getSupabase();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('logs')
      .select('*')
      .eq('user_uid', userUid)
      .order('timestamp', { ascending: false });

    if (error) {
      console.warn('[supabase] fetchLogsDirectly:', error.message);
      return [];
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      data: item.data,
      dia: item.dia,
      semana: item.semana,
      atividade: item.atividade,
      colaborador: item.colaborador,
      setor: item.setor || undefined,
      volumes: item.volumes,
      horas: item.horas,
      vph: item.vph,
      timestamp: item.timestamp,
      synced: true,
      tipo: item.tipo,
    }));
  } catch (err: any) {
    console.warn('[supabase] fetchLogsDirectly network:', err?.message || err);
    return [];
  }
}

export async function deleteLogDirectly(logId: number, userUid: string) {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('logs')
      .delete()
      .eq('id', logId)
      .eq('user_uid', userUid);

    if (error) {
      console.warn('[supabase] deleteLogDirectly:', error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[supabase] deleteLogDirectly network:', err?.message || err);
    return null;
  }
}

export async function clearLogsDirectly(userUid: string) {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('logs')
      .delete()
      .eq('user_uid', userUid);

    if (error) {
      console.warn('[supabase] clearLogsDirectly:', error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[supabase] clearLogsDirectly network:', err?.message || err);
    return null;
  }
}