import { getSupabase, saveLogsDirectly, fetchLogsDirectly } from '../utils/supabase/client';

export const supabase = getSupabase();

export async function syncLogsToSupabase(logs: any[], userId: string) {
  return saveLogsDirectly(logs, userId);
}

export async function fetchLogsFromSupabase(userId: string) {
  return fetchLogsDirectly(userId);
}

