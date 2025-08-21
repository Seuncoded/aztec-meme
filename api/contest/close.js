// api/contest/close.js
import { sb } from "../_supabase.js";            // public client (reads)
import { sbAdmin } from "../_supabase_admin.js"; // service role (writes)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { contest_id } = req.body || {};
  if (!contest_id) return res.status(400).json({ error: "contest_id required" });

  try {
    // 1) confirm contest exists (public read)
    const { data: contest, error: eContest } = await sb
      .from("contests")
      .select("*")
      .eq("id", contest_id)
      .single();
    if (eContest) return res.status(400).json({ error: eContest.message });
    if (!contest) return res.status(404).json({ error: "contest not found" });

    // 2) load entries WITH related votes as an array; we’ll count in JS
    const { data: entries, error: eEntries } = await sb
      .from("contest_entries")
      .select(`
        id,
        meme_id,
        submitter_handle,
        created_at,
        contest_votes:contest_votes(id)
      `)
      .eq("contest_id", contest_id);

    if (eEntries) return res.status(400).json({ error: eEntries.message });

    // 3) pick winner (max votes; tie-break = earliest created_at)
    let winnerRow = null;
    if (entries && entries.length) {
      const withCounts = entries.map(e => ({
        ...e,
        _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0,
      }));

      withCounts.sort((a, b) => {
        // desc by votes
        if (b._votes !== a._votes) return b._votes - a._votes;
        // tie-break: earlier created_at wins
        return new Date(a.created_at) - new Date(b.created_at);
      });

      const top = withCounts[0];

      // 4) close contest + record winner (admin writes)
      const { error: eClose } = await sbAdmin
        .from("contests")
        .update({ status: "closed" })
        .eq("id", contest_id);
      if (eClose) return res.status(400).json({ error: eClose.message });

      const { data: inserted, error: eWin } = await sbAdmin
        .from("contest_winners")
        .insert({
          contest_id,
          entry_id: top.id,
          meme_id: top.meme_id,
          winner_handle: top.submitter_handle,
          won_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (eWin) return res.status(400).json({ error: eWin.message });

      winnerRow = inserted;
    } else {
      // no entries; still close the contest
      const { error: eCloseOnly } = await sbAdmin
        .from("contests")
        .update({ status: "closed" })
        .eq("id", contest_id);
      if (eCloseOnly) return res.status(400).json({ error: eCloseOnly.message });
    }

    return res.json({ ok: true, closed: true, winner: winnerRow });
  } catch (err) {
    return res.status(500).json({ error: err.message || "close failed" });
  }
}