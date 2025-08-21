// api/_supabase.js
import { createClient } from "@supabase/supabase-js";


const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error("Public Supabase env missing (URL or ANON KEY).");
}

const sb = createClient(url, anon, { auth: { persistSession: false } });


export default sb;
export { sb };