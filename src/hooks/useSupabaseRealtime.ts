import { useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../utils/supabase/client';
import { usePresenceStore } from '../stores/presenceStore';

export function useSupabaseRealtime(tableName: string) {
  const [payloads, setPayloads] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const registerActivity = usePresenceStore(state => state.registerActivity);
  const clearActivity = usePresenceStore(state => state.clearActivity);

  useEffect(() => {
    if (!tableName) return;

    let clientToUse: SupabaseClient = defaultSupabase;

    // Tenta usar a configuração salva no localStorage pelo SupabaseConfigModule
    try {
      const stored = localStorage.getItem('supabase_config');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.url && config.anonKey) {
          clientToUse = createClient(config.url, config.anonKey);
        }
      }
    } catch (err) {
      console.warn("Failed to parse local supabase config", err);
    }

    if (!clientToUse) {
      console.warn("No Supabase client available for realtime subscriptions");
      return;
    }

    console.log(`Subscribing to realtime changes for table: ${tableName}`);

    const channel = clientToUse
      .channel(`public:${tableName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          console.log('Realtime change received!', payload);
          setPayloads((prev) => [...prev, payload]);
          
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new;
            // Se um operador iniciar um endereço, registra a trava
            if (newRecord.status === 'pending' && newRecord.endereco) {
              registerActivity(newRecord.colaborador || 'Desconhecido', newRecord.endereco);
            }
            
            // Se um operador concluiu, libera a trava para os demais
            if (newRecord.status === 'synced' && newRecord.endereco) {
              clearActivity(newRecord.endereco);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
        }
      });

    return () => {
      console.log(`Unsubscribing from realtime changes for table: ${tableName}`);
      clientToUse.removeChannel(channel);
      setIsConnected(false);
    };
  }, [tableName, registerActivity, clearActivity]);

  return { payloads, isConnected };
}
