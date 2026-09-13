/**
 * publishEvent.ts
 * Publica eventos operacionais diretamente no Supabase para a Gestão Remota.
 * Fire-and-forget: não bloqueia o fluxo do operador.
 */

import { getSupabase } from './client';

export interface RemoteOperationalEvent {
  id: string;
  timestamp: number;
  tipo: string;
  session_id?: string;
  setor?: string;
  rua?: string;
  colaborador?: string;
  endereco?: string;
  status?: string;
  enderecos_delta?: number;
  volumes_delta?: number;
  justification?: string;
  ml_data?: Record<string, any>;
}

/**
 * Publica um evento no Supabase (tabela operational_events).
 * Usado pelo coletor para notificar a Gestão Remota em tempo real.
 * Nunca lança exceção — falha silenciosamente para não interromper o operador.
 */
export async function publishOperationalEvent(event: RemoteOperationalEvent): Promise<void> {
  try {
    const client = getSupabase();
    if (!client) return;

    const row = {
      id: event.id,
      timestamp: event.timestamp,
      tipo: event.tipo,
      session_id: event.session_id ?? null,
      setor: event.setor ?? null,
      rua: event.rua ?? null,
      colaborador: event.colaborador ?? null,
      endereco: event.endereco ?? null,
      status: event.status ?? null,
      enderecos_delta: event.enderecos_delta ?? 0,
      volumes_delta: event.volumes_delta ?? 0,
      justification: event.justification ?? null,
      ml_data: event.ml_data ?? null,
    };

    const { error } = await client.from('operational_events').upsert(row, { onConflict: 'id' });

    if (error) {
      console.warn('[publishOperationalEvent] Supabase upsert warning:', error.message);
    }
  } catch (err: any) {
    // Fire-and-forget: não propaga o erro para não bloquear o coletor
    console.warn('[publishOperationalEvent] Falha silenciosa:', err?.message || err);
  }
}
