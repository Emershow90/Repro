import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Log } from '../../types';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const createClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be defined in your environment.");
  }
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
};

// Singleton instance to use across client-side logic
let supabaseInstance: any = null;
try {
  if (supabaseUrl && supabaseAnonKey) {
    supabaseInstance = createClient();
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

export function getSupabase() {
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient();
    } catch (err) {
      console.warn("Supabase is not available:", err);
    }
  }
  return supabaseInstance;
}

/**
 * Sync profile 'perfil' table for user permissions
 */
export async function syncPerfilDirectly(uid: string, email: string, name: string, role: string, sector: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('perfil')
    .upsert({
      uid,
      email,
      name,
      role,
      sector,
      created_at: new Date().toISOString()
    }, { onConflict: 'uid' });

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Fetch profile 'perfil' table for user permissions
 */
export async function fetchPerfilDirectly(uid: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('perfil')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is code for no rows returned
    throw error;
  }
  return data;
}

/**
 * Save log records directly into Supabase 'logs' table
 */
export async function saveLogsDirectly(logs: Log[], userUid: string) {
  const client = getSupabase();
  if (!client) {
    throw new Error("Supabase client is not initialized.");
  }

  const formattedLogs = logs.map(log => ({
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
    tipo: log.tipo
  }));

  const { data, error } = await client
    .from('logs')
    .upsert(formattedLogs, { onConflict: 'id' });

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Fetch logs for a specific user directly from Supabase 'logs' table
 */
export async function fetchLogsDirectly(userUid: string): Promise<Log[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from('logs')
    .select('*')
    .eq('user_uid', userUid)
    .order('timestamp', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(item => ({
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
    tipo: item.tipo
  }));
}

/**
 * Delete a log by ID directly from Supabase 'logs' table
 */
export async function deleteLogDirectly(logId: number, userUid: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('logs')
    .delete()
    .eq('id', logId)
    .eq('user_uid', userUid);

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Clear all logs for a specific user directly from Supabase 'logs' table
 */
export async function clearLogsDirectly(userUid: string) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('logs')
    .delete()
    .eq('user_uid', userUid);

  if (error) {
    throw error;
  }
  return data;
}
