// /api/_supabase_admin.js
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // <- service key

if (!URL || !SERVICE_ROLE) {
  throw new Error("Admin Supabase env missing (URL or SERVICE_ROLE).");
}

export const sbAdmin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
export default sbAdmin;