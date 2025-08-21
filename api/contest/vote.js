// /api/contest/vote.js
import { sbAdmin } from "../_supabase_admin.js";   
       

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { entry_id, voter_handle } = req.body || {};
    if (!entry_id || !voter_handle) {
      res.status(400).json({ error: "entry_id and voter_handle required" });
      return;
    }

    const supabase = sbAdmin;                     

   
    const { data: entry, error: e1 } = await supabase
      .from("contest_entries")
      .select("id, contest_id")
      .eq("id", entry_id)
      .single();
    if (e1 || !entry) {
      res.status(400).json({ error: "Invalid entry_id" });
      return;
    }

   
    const { error: e2 } = await supabase
      .from("contest_votes")
      .insert({
        contest_id: entry.contest_id,
        entry_id,
        voter_handle: voter_handle.trim()
      });

    if (e2) {
 
      if (e2.code === "23505") {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      res.status(400).json({ error: e2.message || "Vote failed" });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}