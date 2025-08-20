// /api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function sb() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  return createClient(url, anon, { auth: { persistSession: false } });
}