// /api/contest.js  — single router for all contest actions and subpaths
import * as Admin from "./_supabase_admin.js";
import * as Pub from "./_supabase.js";
const sbAdmin = Admin.sbAdmin || Admin.supabaseAdmin || Admin.default;
const sb = Pub.sb || Pub.default;

// tiny JSON helper (Vercel sometimes gives body as string)
async function getJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    let raw = "";
    for await (const c of req) raw += c;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    const pathParts = url.pathname.split("/").filter(Boolean);         // ["api","contest","open"?]
    const sub = pathParts[2] || "";                                    // "", "open", "active", ...
    const q = Object.fromEntries(url.searchParams.entries());
    const body = await getJson(req);

    // --------- GETs ---------
    if (req.method === "GET") {
      if (sub === "active") {
        const { data, error } = await sb
          .from("contests")
          .select("id,title,status,submission_cap,created_at")
          .in("status", ["open", "voting"])
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ contest: data || null });
      }

      if (sub === "entries") {
        const { contest_id } = q;
        if (!contest_id) return res.status(400).json({ error: "contest_id required" });
        const { data, error } = await sb
          .from("contest_entries")
          .select(`
            id, contest_id, meme_id, submitter_handle, created_at,
            memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
          `)
          .eq("contest_id", contest_id)
          .order("created_at", { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ items: data || [] });
      }

      if (sub === "leaderboard") {
        const contest_id = q.contest_id;
        if (!contest_id) return res.status(400).json({ error: "contest_id required" });
        const { data: rows, error } = await sb
          .from("contest_entries")
          .select(`
            id, submitter_handle,
            memes:memes!inner(id, handle, img_url),
            votes:contest_votes(count)
          `)
          .eq("contest_id", contest_id);
        if (error) return res.status(500).json({ error: error.message });
        const items = (rows || []).map(r => ({
          id: r.id,
          submitter_handle: r.submitter_handle,
          memes: r.memes,
          votes: (r.votes?.[0]?.count ?? 0)
        })).sort((a,b) => b.votes - a.votes);
        return res.json({ ok: true, contest_id, items });
      }

      if (sub === "winners") {
        const limit = Math.max(1, Math.min(parseInt(q.limit || "3", 10) || 3, 12));
        const { data: contest, error: e1 } = await sb
          .from("contests")
          .select("id,title,status,created_at")
          .eq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (e1) return res.status(500).json({ error: e1.message });
        if (!contest) return res.json({ contest: null, winners: [] });

        const { data: winnersRows, error: e2 } = await sb
          .from("contest_winners")
          .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
          .eq("contest_id", contest.id)
          .order("won_at", { ascending: true })
          .limit(limit);
        if (e2) return res.status(500).json({ error: e2.message });

        const winners = (winnersRows || []).map((w, i) => ({
          rank: i + 1, winner_handle: w.winner_handle, meme: w.meme, won_at: w.won_at
        }));
        return res.json({ contest, winners });
      }

      return res.status(404).json({ error: "Not found" });
    }

    // --------- POSTs ---------
    const action = body.action || sub;   // supports /api/contest {action:"open"} AND /api/contest/open

    if (action === "open") {
      const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = body;
      if (!title) return res.status(400).json({ error: "title required" });

      const { data: existing, error: e1 } = await sbAdmin
        .from("contests").select("id,status").in("status", ["open","voting"]);
      if (e1) return res.status(500).json({ error: e1.message });
      if ((existing || []).length) return res.status(409).json({ error: "An active contest already exists" });

      const { data, error } = await sbAdmin
        .from("contests")
        .insert({
          title,
          submission_cap: Number(submission_cap) || 10,
          submissions_deadline, voting_deadline, status: "open"
        })
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, contest: data });
    }

    if (action === "start-voting") {
      const { contest_id } = body;
      if (!contest_id) return res.status(400).json({ error: "contest_id required" });
      const { data: c, error: e1 } = await sbAdmin
        .from("contests").select("id,status").eq("id", contest_id).single();
      if (e1) return res.status(500).json({ error: e1.message });
      if (!c || c.status !== "open") return res.status(400).json({ error: "contest is not open" });

      const { data, error } = await sbAdmin
        .from("contests").update({ status: "voting" }).eq("id", contest_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, contest: data });
    }

    if (action === "close") {
      const { contest_id } = body;
      if (!contest_id) return res.status(400).json({ error: "contest_id required" });

      const { data: entries, error: eEntries } = await sb
        .from("contest_entries")
        .select("id,meme_id,submitter_handle,created_at,contest_votes:contest_votes(id)")
        .eq("contest_id", contest_id);
      if (eEntries) return res.status(500).json({ error: eEntries.message });

      let winner = null;
      if ((entries || []).length) {
        const withCounts = entries.map(e => ({ ...e, _votes: (e.contest_votes || []).length }));
        withCounts.sort((a,b) => (b._votes - a._votes) || (new Date(a.created_at) - new Date(b.created_at)));
        const top = withCounts[0];

        const { error: eClose } = await sbAdmin.from("contests").update({ status:"closed" }).eq("id", contest_id);
        if (eClose) return res.status(500).json({ error: eClose.message });

        const { data: ins, error: eWin } = await sbAdmin
          .from("contest_winners")
          .insert({ contest_id, entry_id: top.id, meme_id: top.meme_id, winner_handle: top.submitter_handle, won_at: new Date().toISOString() })
          .select("*").single();
        if (eWin) return res.status(500).json({ error: eWin.message });
        winner = ins;
      } else {
        const { error: eCloseOnly } = await sbAdmin.from("contests").update({ status:"closed" }).eq("id", contest_id);
        if (eCloseOnly) return res.status(500).json({ error: eCloseOnly.message });
      }
      return res.json({ ok: true, closed: true, winner });
    }

    if (action === "submit") {
      let { contest_id, handle, imgUrl, meme_id } = body || {};
      handle = String(handle || "").replace(/^@+/, "").trim().toLowerCase();
      if (!handle) return res.status(400).json({ error: "handle required" });

      if (!contest_id) {
        const { data: c, error } = await sbAdmin
          .from("contests").select("id,status").eq("status","open")
          .order("created_at",{ ascending:false }).limit(1).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!c) return res.status(400).json({ error: "contest_id required" });
        contest_id = c.id;
      }

      let memeId = meme_id;
      if (!memeId && imgUrl) {
        const { data: existing } = await sbAdmin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
        if (existing?.id) memeId = existing.id;
        else {
          const { data: inserted, error: insErr } = await sbAdmin
            .from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
          if (insErr) {
            const { data: got } = await sbAdmin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
            memeId = got?.id;
          } else memeId = inserted.id;
        }
      }
      if (!memeId) return res.status(400).json({ error: "Provide imgUrl or meme_id" });

      const { data: dup } = await sbAdmin
        .from("contest_entries").select("id")
        .eq("contest_id", contest_id).eq("submitter_handle", handle).limit(1).maybeSingle();
      if (dup) return res.json({ ok: true, duplicate: true });

      const { data: entry, error: eIns } = await sbAdmin
        .from("contest_entries").insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
        .select("id").single();
      if (eIns) return res.status(500).json({ error: eIns.message });
      return res.json({ ok: true, entry_id: entry.id });
    }

    if (action === "vote") {
      const { entry_id, voter_handle } = body || {};
      if (!entry_id || !voter_handle) return res.status(400).json({ error: "entry_id and voter_handle required" });

      const { data: entry, error: e1 } = await sb
        .from("contest_entries").select("id,contest_id").eq("id", entry_id).single();
      if (e1 || !entry) return res.status(400).json({ error: "Invalid entry_id" });

      const { error } = await sbAdmin.from("contest_votes")
        .insert({ contest_id: entry.contest_id, entry_id, voter_handle: voter_handle.trim() });
      if (error) {
        if (String(error.code) === "23505") return res.json({ ok: true, duplicate: true });
        return res.status(400).json({ error: error.message || "Vote failed" });
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}