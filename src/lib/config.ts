export const SUPABASE_URL = 'https://knpxnbddkujzakfrllec.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ag8F5hnNMXLs0EkRkOUbZg_b-J7DaqN';

export const isSupabaseConfigured =
  !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');

export const CONFIG_ERROR = '请先在 src/lib/config.ts 填写 Supabase URL 和 anon key。';
