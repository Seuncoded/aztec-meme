import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("Public Supabase env missing (URL or ANON KEY)");

export const sb = createClient(url, anon, { auth: { persistSession: false } });
export default sb;