// /api/contest/[...slug].js
import { sb } from "../_supabase.js";          // public client (reads)
import { getAdmin } from "../_supabase_admin.js"; // admin writes via getter

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  const parts = Array.isArray(req.query.slug) ? req.query.slug : [];
  const action = (parts[0] || "").toLowerCase();

  try {
    // ---------- GET /api/contest/active ----------
    if (req.method === "GET" && action === "active") {
      const { data, error } = await sb
        .from("contests")
        .select("id,title,status,submission_cap,starts_at,submissions_deadline,voting_deadline,created_at")
        .in("status", ["open", "voting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { contest: data || null });
    }

    // ---------- GET /api/contest/winners?limit=1 ----------
    if (req.method === "GET" && action === "winners") {
      const limit = Math.max(1, Math.min(parseInt(req.query.limit || "3", 10) || 3, 12));

      // latest closed contest
      const { data: contest, error: e1 } = await sb
        .from("contests")
        .select("id,title,status,created_at")
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e1)          return json(res, 500, { error: e1.message });
      if (!contest)    return json(res, 200, { contest: null, winners: [] });

      const { data: rows, error: e2 } = await sb
        .from("contest_winners")
        .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
        .eq("contest_id", contest.id)
        .order("won_at", { ascending: true })
        .limit(limit);

      if (e2) return json(res, 500, { error: e2.message });

      const winners = (rows || []).map((w, i) => ({
        rank: i + 1,
        winner_handle: w.winner_handle,
        meme: w.meme,
        won_at: w.won_at,
      }));

      return json(res, 200, { contest, winners });
    }

    // ---------- GET /api/contest/entries?contest_id=... ----------
    if (req.method === "GET" && action === "entries") {
      const { contest_id } = req.query || {};
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      const { data, error } = await sb
        .from("contest_entries")
        .select(`
          id, contest_id, meme_id, submitter_handle, created_at,
          memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
        `)
        .eq("contest_id", contest_id)
        .order("created_at", { ascending: false });

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { items: data || [] });
    }

    // ---------- GET /api/contest/leaderboard?contest_id=... ----------
    if (req.method === "GET" && action === "leaderboard") {
      let { contest_id } = req.query || {};

      if (!contest_id) {
        // fallback: most recent open/voting
        const { data: c1, error: e1 } = await sb
          .from("contests")
          .select("id,status,created_at")
          .in("status", ["voting", "open"])
          .order("status", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e1) return json(res, 500, { error: e1.message });
        if (!c1) return json(res, 400, { error: "No active contest" });
        contest_id = c1.id;
      }

      // simple aggregate
      const { data: rows, error: e2 } = await sb
        .from("contest_entries")
        .select(`
          id,
          submitter_handle,
          memes:memes!inner(id, handle, img_url),
          votes:contest_votes(count)
        `)
        .eq("contest_id", contest_id);

      if (e2) return json(res, 500, { error: e2.message });

      const items = (rows || [])
        .map(r => ({
          id: r.id,
          submitter_handle: r.submitter_handle,
          memes: r.memes,
          votes: (r.votes?.[0]?.count ?? 0)
        }))
        .sort((a, b) => b.votes - a.votes);

      return json(res, 200, { ok: true, contest_id, items });
    }

    // ---------- POST /api/contest/open ----------
    if (req.method === "POST" && action === "open") {
      const { client: admin, error: envErr } = getAdmin();
      if (envErr) return json(res, 500, { error: envErr });

      const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = req.body || {};
      if (!title) return json(res, 400, { error: "title required" });

      // ensure no active contest
      const { data: existing, error: e1 } = await admin
        .from("contests")
        .select("id,status")
        .in("status", ["open", "voting"]);
      if (e1) return json(res, 500, { error: e1.message });
      if (Array.isArray(existing) && existing.length) {
        return json(res, 409, { error: "An active contest already exists" });
      }

      const { data, error } = await admin
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

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true, contest: data });
    }

    // ---------- POST /api/contest/start-voting ----------
    if (req.method === "POST" && action === "start-voting") {
      const { client: admin, error: envErr } = getAdmin();
      if (envErr) return json(res, 500, { error: envErr });

      const { contest_id } = req.body || {};
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      const { data: c, error: e1 } = await admin
        .from("contests")
        .select("id,status")
        .eq("id", contest_id)
        .single();
      if (e1) return json(res, 500, { error: e1.message });
      if (!c || c.status !== "open") return json(res, 400, { error: "contest is not open" });

      const { data, error } = await admin
        .from("contests")
        .update({ status: "voting" })
        .eq("id", contest_id)
        .select()
        .single();
      if (error) return json(res, 500, { error: error.message });

      return json(res, 200, { ok: true, contest: data });
    }

    // ---------- POST /api/contest/close ----------
    if (req.method === "POST" && action === "close") {
      const { client: admin, error: envErr } = getAdmin();
      if (envErr) return json(res, 500, { error: envErr });

      const { contest_id } = req.body || {};
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      // entries + votes
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
      if (eEntries) return json(res, 500, { error: eEntries.message });

      let winnerRow = null;

      // close contest
      const { error: eClose } = await admin
        .from("contests")
        .update({ status: "closed" })
        .eq("id", contest_id);
      if (eClose) return json(res, 500, { error: eClose.message });

      if (entries && entries.length) {
        const withCounts = entries.map(e => ({
          ...e,
          _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0,
        })).sort((a, b) => b._votes - a._votes || (new Date(a.created_at) - new Date(b.created_at)));

        const top = withCounts[0];

        const { data: inserted, error: eWin } = await admin
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
        if (eWin) return json(res, 500, { error: eWin.message });
        winnerRow = inserted;
      }

      return json(res, 200, { ok: true, closed: true, winner: winnerRow });
    }

    // ---------- POST /api/contest/submit ----------
    if (req.method === "POST" && action === "submit") {
      const { client: admin, error: envErr } = getAdmin();
      if (envErr) return json(res, 500, { error: envErr });

      let { contest_id, handle, imgUrl, meme_id } = req.body || {};
      handle = (handle || "").toString().trim().replace(/^@+/, "");
      if (!handle) return json(res, 400, { error: "handle required" });

      if (!contest_id) {
        const { data: openC, error: openErr } = await admin
          .from("contests")
          .select("id,status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openErr) return json(res, 500, { error: openErr.message });
        if (!openC)   return json(res, 400, { error: "contest_id required" });
        contest_id = openC.id;
      }

      let memeId = meme_id;

      if (!memeId && imgUrl) {
        const { data: existing, error: findErr } = await admin
          .from("memes")
          .select("id")
          .eq("img_url", imgUrl)
          .limit(1)
          .maybeSingle();
        if (findErr) return json(res, 500, { error: findErr.message });

        if (existing?.id) {
          memeId = existing.id;
        } else {
          const { data: inserted, error: insErr } = await admin
            .from("memes")
            .insert([{ handle, img_url: imgUrl }])
            .select("id")
            .single();

          if (insErr) {
            const { data: got, error: getErr } = await admin
              .from("memes")
              .select("id")
              .eq("img_url", imgUrl)
              .limit(1)
              .maybeSingle();
            if (getErr) return json(res, 500, { error: insErr.message });
            memeId = got?.id;
          } else {
            memeId = inserted.id;
          }
        }
      }

      if (!memeId) return json(res, 400, { error: "Provide imgUrl or meme_id" });

      // one entry per handle per contest
      const { data: dup, error: dupErr } = await admin
        .from("contest_entries")
        .select("id")
        .eq("contest_id", contest_id)
        .eq("submitter_handle", handle)
        .limit(1)
        .maybeSingle();
      if (dupErr) return json(res, 500, { error: dupErr.message });
      if (dup)    return json(res, 200, { ok: true, duplicate: true });

      const { data: entry, error: entryErr } = await admin
        .from("contest_entries")
        .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
        .select("id")
        .single();
      if (entryErr) return json(res, 500, { error: entryErr.message });

      return json(res, 200, { ok: true, entry_id: entry.id });
    }

    // ---------- POST /api/contest/vote ----------
    if (req.method === "POST" && action === "vote") {
      const { client: admin, error: envErr } = getAdmin();
      if (envErr) return json(res, 500, { error: envErr });

      const { entry_id, voter_handle } = req.body || {};
      if (!entry_id || !voter_handle) {
        return json(res, 400, { error: "entry_id and voter_handle required" });
      }

      // ensure entry exists
      const { data: entry, error: e1 } = await admin
        .from("contest_entries")
        .select("id, contest_id")
        .eq("id", entry_id)
        .single();
      if (e1 || !entry) return json(res, 400, { error: "Invalid entry_id" });

      const { error: e2 } = await admin
        .from("contest_votes")
        .insert({
          contest_id: entry.contest_id,
          entry_id,
          voter_handle: voter_handle.trim().replace(/^@+/, "")
        });

      if (e2) {
        // duplicate vote per (contest_id, voter_handle) unique -> 23505
        if (e2.code === "23505") return json(res, 200, { ok: true, duplicate: true });
        return json(res, 400, { error: e2.message || "Vote failed" });
      }

      return json(res, 200, { ok: true });
    }

    // unknown
    return json(res, 404, { error: "Unknown action" });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}

/* -------- util -------- */
function json(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}