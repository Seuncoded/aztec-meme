// api/contest/winners.js
import * as Admin from "../_supabase_admin.js";
const supabase =
  Admin.supabaseAdmin || Admin.supabase || Admin.client || Admin.default;

if (!supabase) {
  throw new Error(
    "Admin Supabase client not found. Export supabaseAdmin or supabase from _supabase_admin.js"
  );
}


export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const limitRaw = (req.query.limit ?? "3").toString();
    const limit = Math.max(1, Math.min(parseInt(limitRaw, 10) || 3, 12));

 
    const { data: contest, error: e1 } = await supabase
      .from("contests")
      .select("id,title,status,created_at")
      .eq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e1) return res.status(500).json({ error: e1.message });
    if (!contest) return res.json({ contest: null, winners: [] });

  
    const { data: winnersRows, error: e2 } = await supabase
      .from("contest_winners")
     
      .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
      .eq("contest_id", contest.id)
      .order("won_at", { ascending: true })
      .limit(limit);

    if (e2) return res.status(500).json({ error: e2.message });

   
    const winners = (winnersRows || []).map((w, i) => ({
      rank: i + 1,
      winner_handle: w.winner_handle,
      meme: w.meme,
      won_at: w.won_at,
    }));

    return res.json({ contest, winners });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}