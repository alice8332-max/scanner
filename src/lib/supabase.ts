import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_ERROR, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;

export const requireSupabase = (): SupabaseClient => {
  if (!supabase) throw new Error(CONFIG_ERROR);
  return supabase;
};
