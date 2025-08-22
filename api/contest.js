

import * as Pub from "./_supabase.js";
import * as Admin from "./_supabase_admin.js";

function normalizeUrl(u) {
  try {
    const s = String(u || "").trim();
    if (!s) return "";
    const url = new URL(s);
    
    url.hash = "";
 
    return url.toString();
  } catch {
    return String(u || "").trim();
  }
}

const sb =
  Pub.sb || Pub.supabase || Pub.client || Pub.default;
const sbAdmin =
  Admin.sbAdmin || Admin.supabaseAdmin || Admin.client || Admin.default;

export default async function handler(req, res) {
 
  if (!res.headersSent) res.setHeader("content-type", "application/json");

  try {
    const url = new URL(req.url, "http://x");
    const action = resolveAction(url, req.method);

 
    if (req.method === "GET") {
      if (action === "active")       return getActive(res);
      if (action === "entries")      return getEntries(res, url);
      if (action === "leaderboard")  return getLeaderboard(res, url);
      if (action === "winners")      return getWinners(res, url);
      return send(res, 404, { error: "Not found" });
    }

   
    const body = await readJson(req);

    if (action === "open") {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      return postOpen(res, body);
    }
    if (action === "start-voting") {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      return postStartVoting(res, body);
    }
    if (action === "close") {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      return postClose(res, body);
    }
    if (action === "submit")  return postSubmit(res, body);
    if (action === "vote")    return postVote(res, body);

    return send(res, 404, { error: "Unknown action" });
  } catch (e) {
    // Final safety net — still return JSON
    if (!res.headersSent) return send(res, 500, { error: "server error" });
  }
}



function resolveAction(url, method) {

  const after = url.pathname.replace(/^\/api\/contest\/?/, "");
  const seg = after.split("/").filter(Boolean)[0] || "";
  const q = (url.searchParams.get("action") || "").toLowerCase();
  const pick = (seg || q || "").toLowerCase();
  if (pick) return pick;
  return method === "GET" ? "active" : "";
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function send(res, code, obj) {
  if (res.headersSent) return;
  res.statusCode = code;
  res.end(JSON.stringify(obj));
}

function requireAdmin(req) {
  const got  = String(req.headers["x-az-admin-token"] || "").trim();
  const need = String(process.env.AZ_ADMIN_TOKEN || "").trim();
  return Boolean(need && got === need);
}



async function getActive(res) {
  const { data, error } = await sb
    .from("contests")
    .select("id,title,status,submission_cap,created_at,starts_at,submissions_deadline,voting_deadline")
    .in("status", ["open", "voting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return send(res, 500, { error: error.message });
  return send(res, 200, { contest: data || null });
}

async function getEntries(res, url) {
  const contest_id = url.searchParams.get("contest_id") || "";
  if (!contest_id) return send(res, 400, { error: "contest_id required" });

  const { data, error } = await sb
    .from("contest_entries")
    .select(`
      id, contest_id, meme_id, submitter_handle, created_at,
      memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
    `)
    .eq("contest_id", contest_id)
    .order("created_at", { ascending: false });

  if (error) return send(res, 500, { error: error.message });
  return send(res, 200, { items: data || [] });
}

async function getLeaderboard(res, url) {
  let contest_id = url.searchParams.get("contest_id") || "";


  if (!contest_id) {
    const { data: c1, error: e1 } = await sb
      .from("contests")
      .select("id,status,created_at")
      .in("status", ["voting", "open"])
      .order("status", { ascending: true })      
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) return send(res, 500, { error: e1.message });
    if (!c1) return send(res, 400, { error: "No active contest" });
    contest_id = c1.id;
  }

  
  const { data: rows, error: e2 } = await sb
    .from("contest_entries")
    .select(`
      id,
      submitter_handle,
      memes:memes!inner(id, handle, img_url),
      contest_votes:contest_votes(id)
    `)
    .eq("contest_id", contest_id);

  if (e2) return send(res, 500, { error: e2.message });

  const items = (rows || [])
    .map(r => ({
      id: r.id,
      submitter_handle: r.submitter_handle,
      memes: r.memes,
      votes: Array.isArray(r.contest_votes) ? r.contest_votes.length : 0
    }))
    .sort((a, b) => b.votes - a.votes);

  return send(res, 200, { ok: true, contest_id, items });
}

async function getWinners(res, url) {
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "3", 10) || 3, 12));

 
  const { data: contest, error: e1 } = await sb
    .from("contests")
    .select("id,title,status,created_at")
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();


  if (e1) return send(res, 200, { contest: null, winners: [] });
  if (!contest) return send(res, 200, { contest: null, winners: [] });

  const q = await sb
    .from("contest_winners")
    .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
    .eq("contest_id", contest.id)
    .order("won_at", { ascending: true })
    .limit(limit);

  if (!q.error && Array.isArray(q.data) && q.data.length) {
    const winners = q.data.map((w, i) => ({
      rank: i + 1,
      winner_handle: w.winner_handle,
      meme: w.meme,
      won_at: w.won_at
    }));
    return send(res, 200, { contest, winners });
  }

 
  const ent = await sb
    .from("contest_entries")
    .select(`id, meme_id, submitter_handle, created_at, memes:memes(id, handle, img_url), votes:contest_votes(count)`)
    .eq("contest_id", contest.id);

  if (ent.error || !ent.data || !ent.data.length) {
    return send(res, 200, { contest, winners: [] });
  }

  const sorted = ent.data
    .map(r => ({ ...r, _votes: (r.votes?.[0]?.count ?? 0) }))
    .sort((a,b) => b._votes - a._votes || new Date(a.created_at) - new Date(b.created_at));

  const top = sorted[0];
  const winners = [{
    rank: 1,
    winner_handle: top.submitter_handle,
    meme: { id: top.memes?.id, handle: top.memes?.handle, img_url: top.memes?.img_url },
    won_at: top.created_at
  }];

  return send(res, 200, { contest, winners });
}



async function postOpen(res, body) {
  const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = body || {};
  if (!title) return send(res, 400, { error: "title required" });

  const existing = await sbAdmin
    .from("contests")
    .select("id,status")
    .in("status", ["open", "voting"]);

  if (existing.error) return send(res, 500, { error: existing.error.message });
  if (Array.isArray(existing.data) && existing.data.length) {
    return send(res, 409, { error: "An active contest already exists" });
  }

  const ins = await sbAdmin
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

  if (ins.error) return send(res, 500, { error: ins.error.message });
  return send(res, 200, { ok: true, contest: ins.data });
}


async function postStartVoting(res, body) {
  const { contest_id } = body || {};
  if (!contest_id) return send(res, 400, { error: "contest_id required" });

  const { data: c, error: e1 } = await sbAdmin
    .from("contests")
    .select("id,status")
    .eq("id", contest_id)
    .single();

  if (e1 || !c) return send(res, 400, { error: e1?.message || "contest not found" });
  if (c.status === "voting") return send(res, 200, { ok: true, contest: c }); // idempotent
  if (c.status !== "open")   return send(res, 400, { error: "contest is not open" });

  const upd = await sbAdmin
    .from("contests")
    .update({ status: "voting" })
    .eq("id", contest_id)
    .select()
    .single();

  if (upd.error) return send(res, 500, { error: upd.error.message });
  return send(res, 200, { ok: true, contest: upd.data });
}


async function postClose(res, body) {
  try {
    const { contest_id } = body || {};
    if (!contest_id) return send(res, 400, { error: "contest_id required" });

    
    const cur = await sbAdmin
      .from("contests")
      .select("id,status,created_at")
      .eq("id", contest_id)
      .maybeSingle();
    if (cur.error) return send(res, 500, { error: cur.error.message });
    if (!cur.data) return send(res, 400, { error: "contest not found" });

    
    if (cur.data.status === "closed") {
      
      const w = await sb
        .from("contest_winners")
        .select("winner_handle, meme:memes(id,handle,img_url), won_at")
        .eq("contest_id", contest_id)
        .maybeSingle();
      return send(res, 200, { ok: true, closed: true, winner: w?.data || null });
    }

    const ent = await sb
      .from("contest_entries")
      .select("id, meme_id, submitter_handle, created_at, contest_votes:contest_votes(id)")
      .eq("contest_id", contest_id);
    if (ent.error) return send(res, 500, { error: ent.error.message });

   
    const closed = await sbAdmin
      .from("contests")
      .update({ status: "closed" })
      .eq("id", contest_id);
    if (closed.error) return send(res, 500, { error: closed.error.message });

    if (!ent.data || !ent.data.length) {
      return send(res, 200, { ok: true, closed: true, winner: null });
    }

   
    const [top] = ent.data
      .map(e => ({ ...e, _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0 }))
      .sort((a, b) => (b._votes - a._votes) || (new Date(a.created_at) - new Date(b.created_at)));

    
    const already = await sb
      .from("contest_winners")
      .select("id")
      .eq("contest_id", contest_id)
      .limit(1)
      .maybeSingle();
    if (!already.error && already.data) {
      return send(res, 200, { ok: true, closed: true, winner: already.data });
    }

    const ins = await sbAdmin
      .from("contest_winners")
      .insert({
        contest_id,
        entry_id: top.id,
        meme_id: top.meme_id,
        winner_handle: top.submitter_handle,
        won_at: new Date().toISOString(),
      })
      .select("winner_handle, meme:memes(id,handle,img_url), won_at")
      .single();

    if (ins.error) return send(res, 500, { error: ins.error.message });
    return send(res, 200, { ok: true, closed: true, winner: ins.data });
  } catch {
    return send(res, 500, { error: "server error" });
  }
}

async function postSubmit(res, body) {
  let { contest_id, handle, imgUrl, meme_id } = body || {};
  handle = (handle || "").toString().trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return send(res, 400, { error: "handle required" });


  if (!contest_id) {
    const openC = await sbAdmin
      .from("contests")
      .select("id,status")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openC.error) return send(res, 500, { error: openC.error.message });
    if (!openC.data) return send(res, 400, { error: "contest_id required" });
    contest_id = openC.data.id;
  }

 
  let memeId = meme_id;
  if (!memeId && imgUrl) {
    const cleanUrl = normalizeUrl(imgUrl);

   
    const existing = await sbAdmin
      .from("memes")
      .select("id")
      .eq("img_url", cleanUrl)
      .limit(1)
      .maybeSingle();
    if (existing.error) return send(res, 500, { error: existing.error.message });

    if (existing.data?.id) {
      memeId = existing.data.id;
    } else {
    
      const up = await sbAdmin
        .from("memes")
        .upsert({ handle, img_url: cleanUrl }, { onConflict: "img_url" })
        .select("id")
        .single();
      if (up.error) return send(res, 500, { error: up.error.message });
      memeId = up.data.id;
    }
  }

  if (!memeId) return send(res, 400, { error: "Provide imgUrl or meme_id" });

  
  const dup = await sbAdmin
    .from("contest_entries")
    .select("id")
    .eq("contest_id", contest_id)
    .eq("submitter_handle", handle)
    .limit(1)
    .maybeSingle();
  if (dup.error) return send(res, 500, { error: dup.error.message });
  if (dup.data) return send(res, 200, { ok: true, duplicate: true });

  
  const entry = await sbAdmin
    .from("contest_entries")
    .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
    .select("id")
    .single();

  if (entry.error) return send(res, 500, { error: entry.error.message });
  return send(res, 200, { ok: true, entry_id: entry.data.id });
}


async function postVote(res, body) {
  try {
    let { entry_id, voter_handle } = body || {};

    
    if (!entry_id || typeof entry_id !== "string" || entry_id.length < 8) {
      return send(res, 400, { error: "entry_id required" });
    }

    
    voter_handle = String(voter_handle || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    if (!voter_handle) {
      return send(res, 400, { error: "voter_handle required" });
    }
   
    if (voter_handle.length > 40 || !/^[a-z0-9._-]+$/.test(voter_handle)) {
      return send(res, 400, { error: "invalid voter_handle" });
    }

    
    let entry;
    try {
      const r = await sb
        .from("contest_entries")
        .select("id, contest_id")
        .eq("id", entry_id)
        .single();
      if (r.error || !r.data) {
        return send(res, 400, { error: "Invalid entry_id" });
      }
      entry = r.data;
    } catch (e) {
      return send(res, 500, { error: "lookup failed" });
    }

    
    try {
      const ins = await sbAdmin
        .from("contest_votes")
        .insert({
          contest_id: entry.contest_id,
          entry_id: entry.id,
          voter_handle
        });

    
      if (ins?.error) throw ins.error;

      
      return send(res, 200, { ok: true });
    } catch (e) {
      const msg = String(e?.message || e || "");
      
      if (
        msg.includes("duplicate key") ||
        msg.includes("23505") ||
        msg.toLowerCase().includes("duplicate")
      ) {
        return send(res, 200, { ok: true, duplicate: true });
      }

   
      if (msg.toLowerCase().includes("relation") && msg.toLowerCase().includes("does not exist")) {
        return send(res, 500, { error: "contest_votes table not found" });
      }
      if (msg.toLowerCase().includes("permission")) {
        return send(res, 500, { error: "insert permission denied" });
      }

     
      return send(res, 400, { error: msg || "Vote failed" });
    }
  } catch {
    
    return send(res, 500, { error: "server error" });
  }
}