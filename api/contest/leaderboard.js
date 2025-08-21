// api/contest/leaderboard.js
import { sb } from "../_supabase.js";

export default async function handler(req, res) {
  try {
    const supabase = sb;
    let { contest_id } = req.query || {};

   
    if (!contest_id) {
      const { data: c1, error: e1 } = await supabase
        .from("contests")
        .select("id,status,created_at")
        .in("status", ["voting", "open"])
        .order("status", { ascending: true })      
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!c1) return res.status(400).json({ error: "No active contest" });
      contest_id = c1.id;
    }

    
    const { data, error } = await supabase
      .rpc("contest_leaderboard", { p_contest_id: contest_id }); 
    if (error || !data) {
      
      const { data: rows, error: e2 } = await supabase
        .from("contest_entries")
        .select(`
          id,
          submitter_handle,
          memes:memes!inner(id, handle, img_url),
          votes:contest_votes(count)
        `)
        .eq("contest_id", contest_id);

      if (e2) throw e2;

      const items = (rows || []).map(r => ({
        id: r.id,
        submitter_handle: r.submitter_handle,
        memes: r.memes,
        votes: (r.votes?.[0]?.count ?? 0)
      })).sort((a,b) => b.votes - a.votes);

      return res.json({ ok: true, contest_id, items });
    }

    // If using the RPC:
    return res.json({ ok: true, contest_id, items: data });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}