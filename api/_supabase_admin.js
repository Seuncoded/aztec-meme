import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !svc) throw new Error("Admin Supabase env missing (URL or SERVICE_ROLE)");

export const sbAdmin = createClient(url, svc, { auth: { persistSession: false } });
export default sbAdmin;