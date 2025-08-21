// api/contest/entries.js
import sb from "../_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { contest_id } = req.query || {};
  if (!contest_id) return res.status(400).json({ error: "contest_id required" });

  const { data, error } = await sb
    .from("contest_entries")
    .select(`
      id, contest_id, meme_id, submitter_handle, created_at,
      memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
    `)
    .eq("contest_id", contest_id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ items: data || [] });
}