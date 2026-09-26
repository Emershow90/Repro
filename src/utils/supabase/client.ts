/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cliente Supabase (singleton lazy) + operações de log e perfil.
 *
 * Refatorado em 2026-09-26:
 * - fail-fast se env vars ausentes (dev: log, prod: throw)
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
// Env vars — validação fail-fast
// ============================================================

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const MISSING_ENV_MESSAGE =
  '[supabase/client] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. ' +
  'Crie o arquivo .env na raiz do projeto e reinicie o dev server (npm run dev).';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(MISSING_ENV_MESSAGE);
  if (import.meta.env?.PROD) {
    throw new Error(MISSING_ENV_MESSAGE);
  }
}

// ============================================================
// Cliente singleton (lazy + memoizado)
// ============================================================

let _client: SupabaseClient | null = null;
let _attempted = false;

export function getSupabase(): SupabaseClient | null {
  if (_attempted) return _client;
  _attempted = true;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    _client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    return _client;
  } catch (err) {
    console.error('[supabase/client] Falha ao inicializar cliente:', err);
    return null;
  }
}

/**
 * Instância única para uso direto (ex: `supabase.rpc(...)`).
 * Pode ser `null` se as env vars não estiverem configuradas.
 * Sempre cheque antes: `if (!supabase) return;`
 */
export const supabase = getSupabase();

if (!supabase) {
  console.error(
    '[supabase/client] ⚠️ Cliente Supabase NÃO inicializado. ' +
    'Login admin e backup em nuvem vão falhar.'
  );
}

// ============================================================
// Perfil (tabela 'perfil')
// ============================================================

/**
 * Upsert do perfil do usuário.
 * NOTA: created_at não é enviado — deixamos o DEFAULT NOW() do DB.
 */
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

/**
 * Busca o perfil pelo UID.
 * Retorna `null` se não existir (PGRST116), sem propagar erro.
 */
export async function fetchPerfilDirectly(uid: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('perfil')
    .select('*')
    .eq('uid', uid)
    .single();

  // PGRST116 = "no rows returned" — não é erro, é ausência
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ============================================================
// Logs (tabela 'logs')
// ============================================================

/**
 * Envia logs para o Supabase (upsert por ID).
 * @returns Array de logs salvos, `[]` se input vazio, `null` em erro recuperável.
 */
export async function saveLogsDirectly(logs: Log[], userUid: string) {
  const client = getSupabase();
  if (!client) return null;
  if (!logs.length) return []; // guard: upsert vazio gera 400

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

/**
 * Busca logs de um usuário ordenados por timestamp desc.
 * @returns Array (possivelmente vazio), nunca `null`.
 */
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

/**
 * Deleta um log específico por ID, isolado por user_uid.
 */
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

/**
 * Limpa TODOS os logs de um usuário.
 * ⚠️ Operação destrutiva — usar apenas com confirmação explícita.
 */
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
