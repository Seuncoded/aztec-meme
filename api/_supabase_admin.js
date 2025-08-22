// /api/_supabase_admin.js
import { createClient } from "@supabase/supabase-js";

let adminClient = null;

export function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { error: "Admin Supabase env missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)" };
  }
  if (!adminClient) {
    adminClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return { client: adminClient };
}

// for old imports: import sbAdmin from "./_supabase_admin.js"
export default function sbAdmin() {
  const { client, error } = getAdmin();
  if (error) throw new Error(error);
  return client;
}