import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function syncLogsToSupabase(logs: any[], userId: string) {
  if (!supabase) {
    console.warn("Supabase is not configured. Define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your env.");
    return null;
  }

  const formattedLogs = logs.map(log => ({
    id: log.id,
    user_id: userId,
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

  const { data, error } = await supabase
    .from('records')
    .upsert(formattedLogs, { onConflict: 'id' });

  if (error) {
    throw error;
  }
  return data;
}

export async function fetchLogsFromSupabase(userId: string) {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('user_id', userId)
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
