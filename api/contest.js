// /api/contest.js
import { sb } from "./_supabase.js";
import { sbAdmin } from "./_supabase_admin.js";

export default async function handler(req, res) {
  const { method, url } = req;

  // normalize path
  const path = url.replace(/^\/api\/contest/, "").split("?")[0];

  try {
    // --- OPEN ---
    if (method === "POST" && path === "/open") {
      const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = req.body || {};
      if (!title) return res.status(400).json({ error: "title required" });

      const { data: existing } = await sbAdmin
        .from("contests")
        .select("id,status")
        .in("status", ["open", "voting"]);
      if (existing?.length) return res.status(409).json({ error: "An active contest already exists" });

      const { data, error } = await sbAdmin
        .from("contests")
        .insert({
          title,
          submission_cap: Number(submission_cap) || 10,
          submissions_deadline,
          voting_deadline,
          status: "open"
        })
        .select()
        .single();
      if (error) throw error;
      return res.json({ ok: true, contest: data });
    }

    // --- START VOTING ---
    if (method === "POST" && path === "/start-voting") {
      const { contest_id } = req.body || {};
      if (!contest_id) return res.status(400).json({ error: "contest_id required" });

      const { data: c, error: e1 } = await sbAdmin.from("contests").select("id,status").eq("id", contest_id).single();
      if (e1) throw e1;
      if (!c || c.status !== "open") return res.status(400).json({ error: "contest is not open" });

      const { data, error } = await sbAdmin
        .from("contests")
        .update({ status: "voting" })
        .eq("id", contest_id)
        .select()
        .single();
      if (error) throw error;

      return res.json({ ok: true, contest: data });
    }

    // --- CLOSE ---
    if (method === "POST" && path === "/close") {
      const { contest_id } = req.body || {};
      if (!contest_id) return res.status(400).json({ error: "contest_id required" });

      const { data: contest } = await sb.from("contests").select("*").eq("id", contest_id).single();
      if (!contest) return res.status(404).json({ error: "contest not found" });

      const { data: entries } = await sb
        .from("contest_entries")
        .select(`id,meme_id,submitter_handle,created_at,contest_votes:contest_votes(id)`)
        .eq("contest_id", contest_id);

      let winnerRow = null;
      if (entries?.length) {
        const withCounts = entries.map(e => ({
          ...e,
          _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0,
        }));
        withCounts.sort((a, b) => b._votes - a._votes || new Date(a.created_at) - new Date(b.created_at));
        const top = withCounts[0];

        await sbAdmin.from("contests").update({ status: "closed" }).eq("id", contest_id);
        const { data: inserted } = await sbAdmin
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
        winnerRow = inserted;
      } else {
        await sbAdmin.from("contests").update({ status: "closed" }).eq("id", contest_id);
      }

      return res.json({ ok: true, closed: true, winner: winnerRow });
    }

    // --- ACTIVE ---
    if (method === "GET" && path === "/active") {
      const { data } = await sb
        .from("contests")
        .select("id,title,status,submission_cap,starts_at,submissions_deadline,voting_deadline,created_at")
        .in("status", ["open", "voting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return res.json({ contest: data || null });
    }

    // --- ENTRIES ---
    if (method === "GET" && path === "/entries") {
      const { contest_id } = req.query || {};
      if (!contest_id) return res.status(400).json({ error: "contest_id required" });
      const { data } = await sb
        .from("contest_entries")
        .select(`id,contest_id,meme_id,submitter_handle,created_at,memes:memes!contest_entries_meme_id_fkey(id,handle,img_url)`)
        .eq("contest_id", contest_id)
        .order("created_at", { ascending: false });
      return res.json({ items: data || [] });
    }

    // --- LEADERBOARD ---
    if (method === "GET" && path === "/leaderboard") {
      let { contest_id } = req.query || {};
      if (!contest_id) {
        const { data: c1 } = await sb
          .from("contests")
          .select("id,status,created_at")
          .in("status", ["voting", "open"])
          .order("status", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!c1) return res.status(400).json({ error: "No active contest" });
        contest_id = c1.id;
      }
      const { data: rows } = await sb
        .from("contest_entries")
        .select(`id,submitter_handle,memes:memes!inner(id,handle,img_url),votes:contest_votes(count)`)
        .eq("contest_id", contest_id);
      const items = (rows || []).map(r => ({
        id: r.id,
        submitter_handle: r.submitter_handle,
        memes: r.memes,
        votes: (r.votes?.[0]?.count ?? 0)
      })).sort((a,b) => b.votes - a.votes);
      return res.json({ ok: true, contest_id, items });
    }

    // --- SUBMIT ---
    if (method === "POST" && path === "/submit") {
      let { contest_id, handle, imgUrl, meme_id } = req.body || {};
      handle = (handle || "").toString().trim().replace(/^@/, "");
      if (!handle) return res.status(400).json({ error: "handle required" });

      if (!contest_id) {
        const { data: openC } = await sbAdmin.from("contests").select("id,status").eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!openC) return res.status(400).json({ error: "contest_id required" });
        contest_id = openC.id;
      }

      let memeId = meme_id;
      if (!memeId && imgUrl) {
        const { data: existing } = await sbAdmin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
        if (existing?.id) {
          memeId = existing.id;
        } else {
          const { data: inserted } = await sbAdmin.from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
          memeId = inserted.id;
        }
      }
      if (!memeId) return res.status(400).json({ error: "Provide imgUrl or meme_id" });

      const { data: dup } = await sbAdmin.from("contest_entries").select("id").eq("contest_id", contest_id).eq("submitter_handle", handle).limit(1).maybeSingle();
      if (dup) return res.json({ ok: true, duplicate: true });

      const { data: entry } = await sbAdmin.from("contest_entries").insert([{ contest_id, meme_id: memeId, submitter_handle: handle }]).select("id").single();
      return res.json({ ok: true, entry_id: entry.id });
    }

    // --- VOTE ---
    if (method === "POST" && path === "/vote") {
      const { entry_id, voter_handle } = req.body || {};
      if (!entry_id || !voter_handle) return res.status(400).json({ error: "entry_id and voter_handle required" });

      const { data: entry } = await sbAdmin.from("contest_entries").select("id,contest_id").eq("id", entry_id).single();
      if (!entry) return res.status(400).json({ error: "Invalid entry_id" });

      const { error: e2 } = await sbAdmin.from("contest_votes").insert({
        contest_id: entry.contest_id,
        entry_id,
        voter_handle: voter_handle.trim()
      });
      if (e2 && e2.code === "23505") return res.json({ ok: true, duplicate: true });
      if (e2) throw e2;
      return res.json({ ok: true });
    }

    // --- WINNERS ---
    if (method === "GET" && path === "/winners") {
      const limit = Math.max(1, Math.min(parseInt(req.query.limit || "3", 10) || 3, 12));
      const { data: contest } = await sb.from("contests").select("id,title,status,created_at").eq("status", "closed").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!contest) return res.json({ contest: null, winners: [] });
      const { data: winnersRows } = await sb.from("contest_winners").select("winner_handle,won_at,meme:memes(id,handle,img_url)").eq("contest_id", contest.id).order("won_at", { ascending: true }).limit(limit);
      const winners = (winnersRows || []).map((w, i) => ({
        rank: i + 1,
        winner_handle: w.winner_handle,
        meme: w.meme,
        won_at: w.won_at,
      }));
      return res.json({ contest, winners });
    }

    // fallback
    return res.status(404).json({ error: "Not found" });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}