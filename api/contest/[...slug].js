// api/contest/[...slug].js
import { sb } from "../_supabase.js";
import { sbAdmin } from "../_supabase_admin.js";

/* ---------- tiny helpers ---------- */
function ok(res, body) {
  res.setHeader("content-type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, ...body }));
}
function err(res, code, message) {
  res.setHeader("content-type", "application/json");
  res.statusCode = code;
  res.end(JSON.stringify({ error: message }));
}
function getQuery(req) {
  // Vercel supplies query via req.query
  return req.query || {};
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/* ---------- router ---------- */
export default async function handler(req, res) {
  try {
    const slug = (getQuery(req).slug || [])[0] || ""; // first segment
    switch (slug) {
      case "active":      return getActive(req, res);
      case "open":        return postOpen(req, res);
      case "start-voting":return postStartVoting(req, res);
      case "close":       return postClose(req, res);
      case "submit":      return postSubmit(req, res);
      case "vote":        return postVote(req, res);
      case "entries":     return getEntries(req, res);
      case "leaderboard": return getLeaderboard(req, res);
      case "winners":     return getWinners(req, res);
      default:            return err(res, 404, "Unknown action");
    }
  } catch (e) {
    return err(res, 500, String(e?.message || e));
  }
}

/* ---------- endpoints ---------- */

// GET /api/contest/active
async function getActive(_req, res) {
  const { data, error } = await sb
    .from("contests")
    .select("id,title,status,submission_cap,created_at")
    .in("status", ["open", "voting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return err(res, 500, error.message);
  ok(res, { contest: data || null });
}

// POST /api/contest/open  { title, submission_cap? }
async function postOpen(req, res) {
  if (req.method !== "POST") return err(res, 405, "POST only");
  const body = await readJson(req);
  const title = String(body.title || "").trim();
  const cap   = Number(body.submission_cap || 10) || 10;
  if (!title) return err(res, 400, "title required");

  // prevent multiple active contests
  const { data: existing, error: e1 } = await sbAdmin
    .from("contests")
    .select("id,status")
    .in("status", ["open", "voting"]);
  if (e1) return err(res, 500, e1.message);
  if (Array.isArray(existing) && existing.length)
    return err(res, 409, "An active contest already exists");

  const { data, error } = await sbAdmin
    .from("contests")
    .insert({ title, submission_cap: cap, status: "open" })
    .select()
    .single();
  if (error) return err(res, 500, error.message);
  ok(res, { contest: data });
}

// POST /api/contest/start-voting  { contest_id }
async function postStartVoting(req, res) {
  if (req.method !== "POST") return err(res, 405, "POST only");
  const { contest_id } = await readJson(req);
  if (!contest_id) return err(res, 400, "contest_id required");

  const { data: c, error: e1 } = await sbAdmin
    .from("contests")
    .select("id,status")
    .eq("id", contest_id)
    .single();
  if (e1) return err(res, 500, e1.message);
  if (!c || c.status !== "open") return err(res, 400, "contest is not open");

  const { data, error } = await sbAdmin
    .from("contests")
    .update({ status: "voting" })
    .eq("id", contest_id)
    .select()
    .single();
  if (error) return err(res, 500, error.message);
  ok(res, { contest: data });
}

// POST /api/contest/close  { contest_id }
async function postClose(req, res) {
  if (req.method !== "POST") return err(res, 405, "POST only");
  const { contest_id } = await readJson(req);
  if (!contest_id) return err(res, 400, "contest_id required");

  // entries with votes
  const { data: entries, error: eEntries } = await sb
    .from("contest_entries")
    .select(`
      id, meme_id, submitter_handle, created_at,
      contest_votes:contest_votes ( id )
    `)
    .eq("contest_id", contest_id);
  if (eEntries) return err(res, 500, eEntries.message);

  // pick winner
  let winner = null;
  if (Array.isArray(entries) && entries.length) {
    const withCounts = entries.map(e => ({
      ...e,
      _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0,
    })).sort((a,b) => b._votes - a._votes || (new Date(a.created_at) - new Date(b.created_at)));

    const top = withCounts[0];

    const { error: eClose } = await sbAdmin
      .from("contests")
      .update({ status: "closed" })
      .eq("id", contest_id);
    if (eClose) return err(res, 500, eClose.message);

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
    if (eWin) return err(res, 500, eWin.message);
    winner = inserted;
  } else {
    const { error: eCloseOnly } = await sbAdmin
      .from("contests")
      .update({ status: "closed" })
      .eq("id", contest_id);
    if (eCloseOnly) return err(res, 500, eCloseOnly.message);
  }

  ok(res, { closed: true, winner });
}

// POST /api/contest/submit  { contest_id?, handle, imgUrl?, meme_id? }
async function postSubmit(req, res) {
  if (req.method !== "POST") return err(res, 405, "POST only");
  let { contest_id, handle, imgUrl, meme_id } = await readJson(req);

  handle = String(handle || "").trim();
  if (handle.startsWith("@")) handle = handle.slice(1);
  if (!handle) return err(res, 400, "handle required");

  // infer open contest if not provided
  if (!contest_id) {
    const { data: c, error: e1 } = await sbAdmin
      .from("contests")
      .select("id,status")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) return err(res, 500, e1.message);
    if (!c) return err(res, 400, "contest_id required");
    contest_id = c.id;
  }

  // get or create meme
  let memeId = meme_id;
  if (!memeId && imgUrl) {
    const { data: ex, error: eFind } = await sbAdmin
      .from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
    if (eFind) return err(res, 500, eFind.message);

    if (ex?.id) {
      memeId = ex.id;
    } else {
      const { data: ins, error: eIns } = await sbAdmin
        .from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
      if (eIns) {
        // race: fetch after unique error
        const { data: got } = await sbAdmin
          .from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
        memeId = got?.id;
      } else {
        memeId = ins.id;
      }
    }
  }
  if (!memeId) return err(res, 400, "Provide imgUrl or meme_id");

  // one entry per handle per contest
  const { data: dup } = await sbAdmin
    .from("contest_entries")
    .select("id")
    .eq("contest_id", contest_id)
    .eq("submitter_handle", handle)
    .limit(1)
    .maybeSingle();
  if (dup) return ok(res, { duplicate: true });

  const { data: entry, error: eEntry } = await sbAdmin
    .from("contest_entries")
    .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
    .select("id")
    .single();
  if (eEntry) return err(res, 500, eEntry.message);

  ok(res, { entry_id: entry.id });
}

// POST /api/contest/vote  { entry_id, voter_handle }
async function postVote(req, res) {
  if (req.method !== "POST") return err(res, 405, "POST only");
  const { entry_id, voter_handle } = await readJson(req);
  if (!entry_id || !voter_handle) return err(res, 400, "entry_id and voter_handle required");

  const { data: entry, error: e1 } = await sb
    .from("contest_entries")
    .select("id, contest_id")
    .eq("id", entry_id)
    .single();
  if (e1 || !entry) return err(res, 400, "Invalid entry_id");

  const { error: e2 } = await sbAdmin
    .from("contest_votes")
    .insert({
      contest_id: entry.contest_id,
      entry_id,
      voter_handle: String(voter_handle).trim()
    });

  if (e2) {
    if (e2.code === "23505") return ok(res, { duplicate: true }); // unique dup
    return err(res, 400, e2.message || "Vote failed");
  }
  ok(res, {});
}

// GET /api/contest/entries?contest_id=...
async function getEntries(req, res) {
  const { contest_id } = getQuery(req);
  if (!contest_id) return err(res, 400, "contest_id required");

  const { data, error } = await sb
    .from("contest_entries")
    .select(`
      id, contest_id, meme_id, submitter_handle, created_at,
      memes:memes!contest_entries_meme_id_fkey ( id, handle, img_url )
    `)
    .eq("contest_id", contest_id)
    .order("created_at", { ascending: false });
  if (error) return err(res, 500, error.message);
  ok(res, { items: data || [] });
}

// GET /api/contest/leaderboard?contest_id=...
async function getLeaderboard(req, res) {
  let { contest_id } = getQuery(req);

  if (!contest_id) {
    const { data: c1, error: e1 } = await sb
      .from("contests")
      .select("id,status,created_at")
      .in("status", ["voting", "open"])
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) return err(res, 500, e1.message);
    if (!c1) return err(res, 400, "No active contest");
    contest_id = c1.id;
  }

  // simple JS aggregation
  const { data: rows, error: e2 } = await sb
    .from("contest_entries")
    .select(`
      id,
      submitter_handle,
      memes:memes!inner ( id, handle, img_url ),
      votes:contest_votes ( id )
    `)
    .eq("contest_id", contest_id);
  if (e2) return err(res, 500, e2.message);

  const items = (rows || []).map(r => ({
    id: r.id,
    submitter_handle: r.submitter_handle,
    memes: r.memes,
    votes: Array.isArray(r.votes) ? r.votes.length : 0
  })).sort((a,b) => b.votes - a.votes);

  ok(res, { contest_id, items });
}

// GET /api/contest/winners?limit=1
async function getWinners(req, res) {
  const limit = Math.max(1, Math.min(parseInt(getQuery(req).limit || "3", 10) || 3, 12));

  const { data: contest, error: e1 } = await sb
    .from("contests")
    .select("id,title,status,created_at")
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) return err(res, 500, e1.message);
  if (!contest) return ok(res, { contest: null, winners: [] });

  const { data: winnersRows, error: e2 } = await sb
    .from("contest_winners")
    .select("winner_handle, won_at, meme:memes ( id, handle, img_url )")
    .eq("contest_id", contest.id)
    .order("won_at", { ascending: true })
    .limit(limit);
  if (e2) return err(res, 500, e2.message);

  const winners = (winnersRows || []).map((w,i) => ({
    rank: i + 1,
    winner_handle: w.winner_handle,
    meme: w.meme,
    won_at: w.won_at,
  }));

  ok(res, { contest, winners });
}