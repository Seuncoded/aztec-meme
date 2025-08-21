// api/_supabase_admin.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !service) {
  throw new Error("Admin Supabase env missing (URL or SERVICE_ROLE).");
}

const sbAdmin = createClient(url, service, { auth: { persistSession: false } });

export default sbAdmin;
export { sbAdmin };