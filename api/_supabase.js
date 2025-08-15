// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function sb() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !service) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  }
  return createClient(url, service, { auth: { persistSession: false } });
}