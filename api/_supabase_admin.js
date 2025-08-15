// /api/_supabase_admin.js
import { createClient } from "@supabase/supabase-js";

export function sbAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; 
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, { auth: { persistSession: false } });
}