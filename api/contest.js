// /api/contest.js
import { sb } from "./_supabase.js";
import { getAdmin } from "./_supabase_admin.js";

// tiny JSON helper
const j = (res, s, b) => { res.statusCode = s; res.setHeader("content-type","application/json; charset=utf-8"); res.end(JSON.stringify(b)); };

export default async function handler(req, res) {
  try {
    // Accept both /api/contest?action=... and /api/contest/<action>
    const url = new URL(req.url, "http://x");
    let action = (url.searchParams.get("action") || "").toLowerCase();
    if (!action) {
      const path = (url.pathname || "").split("/").filter(Boolean);
      const i = path.indexOf("contest");
      action = (path[i + 1] || "").toLowerCase();
    }

    // ---------- GET /active ----------
    if (req.method === "GET" && action === "active") {
      const { data, error } = await sb
        .from("contests")
        .select("id,title,status,submission_cap,starts_at,submissions_deadline,voting_deadline,created_at")
        .in("status", ["open", "voting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return error ? j(res, 500, { error: error.message }) : j(res, 200, { contest: data || null });
    }

    // ---------- GET /winners?limit=1 ----------
    if (req.method === "GET" && action === "winners") {
      const limit = Math.max(1, Math.min(parseInt((new URL(req.url, "http://x")).searchParams.get("limit") || "3", 10) || 3, 12));

      const { data: contest, error: e1 } = await sb
        .from("contests")
        .select("id,title,status,created_at")
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) return j(res, 500, { error: e1.message });
      if (!contest) return j(res, 200, { contest: null, winners: [] });

      const { data: rows, error: e2 } = await sb
        .from("contest_winners")
        .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
        .eq("contest_id", contest.id)
        .order("won_at", { ascending: true })
        .limit(limit);
      if (e2) return j(res, 500, { error: e2.message });

      const winners = (rows || []).map((w, i) => ({
        rank: i + 1,
        winner_handle: w.winner_handle,
        meme: w.meme,
        won_at: w.won_at,
      }));
      return j(res, 200, { contest, winners });
    }

    // from here down we need the admin client
    const { client: admin, error: envErr } = getAdmin();
    if (envErr) return j(res, 500, { error: envErr });

    // ---------- POST /open ----------
    if (req.method === "POST" && action === "open") {
      const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = req.body || {};
      if (!title) return j(res, 400, { error: "title required" });

      const { data: existing, error: e1 } = await admin
        .from("contests")
        .select("id,status")
        .in("status", ["open", "voting"]);
      if (e1) return j(res, 500, { error: e1.message });
      if (Array.isArray(existing) && existing.length) return j(res, 409, { error: "An active contest already exists" });

      const { data, error } = await admin
        .from("contests")
        .insert({ title, submission_cap: Number(submission_cap) || 10, submissions_deadline, voting_deadline, status: "open" })
        .select()
        .single();
      return error ? j(res, 500, { error: error.message }) : j(res, 200, { ok: true, contest: data });
    }

    // ---------- POST /start-voting ----------
    if (req.method === "POST" && action === "start-voting") {
      const { contest_id } = req.body || {};
      if (!contest_id) return j(res, 400, { error: "contest_id required" });

      const { data: c, error: e1 } = await admin.from("contests").select("id,status").eq("id", contest_id).single();
      if (e1) return j(res, 500, { error: e1.message });
      if (!c || c.status !== "open") return j(res, 400, { error: "contest is not open" });

      const { data, error } = await admin.from("contests").update({ status: "voting" }).eq("id", contest_id).select().single();
      return error ? j(res, 500, { error: error.message }) : j(res, 200, { ok: true, contest: data });
    }

    // ---------- POST /close ----------
    if (req.method === "POST" && action === "close") {
      const { contest_id } = req.body || {};
      if (!contest_id) return j(res, 400, { error: "contest_id required" });

      const { data: entries, error: eEntries } = await sb
        .from("contest_entries")
        .select("id,meme_id,submitter_handle,created_at,contest_votes:contest_votes(id)")
        .eq("contest_id", contest_id);
      if (eEntries) return j(res, 500, { error: eEntries.message });

      const { error: eClose } = await admin.from("contests").update({ status: "closed" }).eq("id", contest_id);
      if (eClose) return j(res, 500, { error: eClose.message });

      let winnerRow = null;
      if (entries?.length) {
        const top = entries
          .map(e => ({ ...e, _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0 }))
          .sort((a,b) => b._votes - a._votes || (new Date(a.created_at) - new Date(b.created_at)))[0];

        const { data: inserted, error: eWin } = await admin
          .from("contest_winners")
          .insert({ contest_id, entry_id: top.id, meme_id: top.meme_id, winner_handle: top.submitter_handle, won_at: new Date().toISOString() })
          .select("*")
          .single();
        if (eWin) return j(res, 500, { error: eWin.message });
        winnerRow = inserted;
      }
      return j(res, 200, { ok: true, closed: true, winner: winnerRow });
    }

    // ---------- POST /submit ----------
    if (req.method === "POST" && action === "submit") {
      let { contest_id, handle, imgUrl, meme_id } = req.body || {};
      handle = (handle || "").toString().trim().replace(/^@+/, "");
      if (!handle) return j(res, 400, { error: "handle required" });

      if (!contest_id) {
        const { data: openC, error: openErr } = await admin
          .from("contests")
          .select("id,status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openErr) return j(res, 500, { error: openErr.message });
        if (!openC)   return j(res, 400, { error: "contest_id required" });
        contest_id = openC.id;
      }

      let memeId = meme_id;
      if (!memeId && imgUrl) {
        const { data: existing, error: findErr } = await admin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
        if (findErr) return j(res, 500, { error: findErr.message });
        if (existing?.id) memeId = existing.id;
        else {
          const { data: inserted, error: insErr } = await admin.from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
          if (insErr) {
            const { data: got, error: getErr } = await admin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
            if (getErr) return j(res, 500, { error: insErr.message });
            memeId = got?.id;
          } else memeId = inserted.id;
        }
      }
      if (!memeId) return j(res, 400, { error: "Provide imgUrl or meme_id" });

      const { data: dup, error: dupErr } = await admin
        .from("contest_entries")
        .select("id")
        .eq("contest_id", contest_id)
        .eq("submitter_handle", handle)
        .limit(1)
        .maybeSingle();
      if (dupErr) return j(res, 500, { error: dupErr.message });
      if (dup)    return j(res, 200, { ok: true, duplicate: true });

      const { data: entry, error: entryErr } = await admin
        .from("contest_entries")
        .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
        .select("id")
        .single();
      return entryErr ? j(res, 500, { error: entryErr.message }) : j(res, 200, { ok: true, entry_id: entry.id });
    }

    // ---------- POST /vote ----------
    if (req.method === "POST" && action === "vote") {
      const { entry_id, voter_handle } = req.body || {};
      if (!entry_id || !voter_handle) return j(res, 400, { error: "entry_id and voter_handle required" });

      const { data: entry, error: e1 } = await admin.from("contest_entries").select("id,contest_id").eq("id", entry_id).single();
      if (e1 || !entry) return j(res, 400, { error: "Invalid entry_id" });

      const { error: e2 } = await admin
        .from("contest_votes")
        .insert({ contest_id: entry.contest_id, entry_id, voter_handle: voter_handle.trim().replace(/^@+/, "") });

      if (e2) return e2.code === "23505" ? j(res, 200, { ok: true, duplicate: true }) : j(res, 400, { error: e2.message || "Vote failed" });
      return j(res, 200, { ok: true });
    }

    return j(res, 404, { error: "Unknown action" });
  } catch (err) {
    return j(res, 500, { error: String(err?.message || err) });
  }
}