// api/contest/[...slug].js
import { createClient } from "@supabase/supabase-js";

// build clients per request (no top-level throws)
function getAnon() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return (url && key) ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  return (url && key) ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const segs = Array.isArray(req.query.slug) ? req.query.slug : [];
  const action = (segs[0] || "").toLowerCase();

  // lightweight health
  if (!["active","open","start-voting","close","submit","entries","leaderboard","vote","winners"].includes(action)) {
    return json(res, 404, { error: "Unknown action" });
  }

  const sb  = getAnon();
  const sba = getAdmin();
  if (!sb || !sba) return json(res, 500, { error: "Missing Supabase env" });

  try {
    // --------- GET /api/contest/active
    if (action === "active" && req.method === "GET") {
      const { data, error } = await sb
        .from("contests")
        .select("id,title,status,submission_cap,created_at")
        .in("status", ["open","voting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { contest: data || null });
    }

    // --------- POST /api/contest/open
    if (action === "open" && req.method === "POST") {
      const { title, submission_cap = 10 } = req.body || {};
      if (!title) return json(res, 400, { error: "title required" });

      const { data: existing, error: e1 } = await sba
        .from("contests").select("id,status").in("status", ["open","voting"]);
      if (e1) return json(res, 500, { error: e1.message });
      if (existing?.length) return json(res, 409, { error: "An active contest already exists" });

      const { data, error } = await sba
        .from("contests")
        .insert({ title, submission_cap: Number(submission_cap)||10, status: "open" })
        .select("*")
        .single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { contest: data });
    }

    // --------- POST /api/contest/start-voting
    if (action === "start-voting" && req.method === "POST") {
      const { contest_id } = req.body || {};
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      const { data: c, error: e1 } = await sba.from("contests")
        .select("id,status").eq("id", contest_id).single();
      if (e1) return json(res, 400, { error: e1.message });
      if (!c || c.status !== "open") return json(res, 400, { error: "contest is not open" });

      const { data, error } = await sba.from("contests")
        .update({ status: "voting" }).eq("id", contest_id).select("*").single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { contest: data });
    }

    // --------- POST /api/contest/close
    if (action === "close" && req.method === "POST") {
      const { contest_id } = req.body || {};
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      // entries with votes (array)
      const { data: entries, error: eEntries } = await sb
        .from("contest_entries")
        .select("id,meme_id,submitter_handle,created_at,contest_votes:contest_votes(id)")
        .eq("contest_id", contest_id);
      if (eEntries) return json(res, 500, { error: eEntries.message });

      // close contest
      const { error: eClose } = await sba.from("contests")
        .update({ status: "closed" }).eq("id", contest_id);
      if (eClose) return json(res, 500, { error: eClose.message });

      if (!entries?.length) return json(res, 200, { ok: true, closed: true, winner: null });

      const withCounts = entries.map(e => ({ ...e, _votes: (e.contest_votes||[]).length }));
      withCounts.sort((a,b)=> (b._votes-a._votes) || (new Date(a.created_at)-new Date(b.created_at)));
      const top = withCounts[0];

      const { data: winner, error: eWin } = await sba
        .from("contest_winners")
        .insert({
          contest_id,
          entry_id: top.id,
          meme_id: top.meme_id,
          winner_handle: top.submitter_handle,
          won_at: new Date().toISOString()
        })
        .select("*").single();
      if (eWin) return json(res, 500, { error: eWin.message });

      return json(res, 200, { ok: true, closed: true, winner });
    }

    // --------- POST /api/contest/submit
    if (action === "submit" && req.method === "POST") {
      let { contest_id, handle, imgUrl, meme_id } = req.body || {};
      handle = (handle||"").trim().replace(/^@+/, "");
      if (!handle) return json(res, 400, { error: "handle required" });

      if (!contest_id) {
        const { data: c, error } = await sba.from("contests")
          .select("id").eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
        if (error) return json(res, 500, { error: error.message });
        if (!c) return json(res, 400, { error: "contest_id required" });
        contest_id = c.id;
      }

      let memeId = meme_id;
      if (!memeId && imgUrl) {
        const { data: ex } = await sba.from("memes").select("id").eq("img_url", imgUrl).maybeSingle();
        if (ex?.id) memeId = ex.id;
        else {
          const { data: ins, error } = await sba.from("memes")
            .insert({ handle, img_url: imgUrl }).select("id").single();
          if (error) {
            const { data: got } = await sba.from("memes")
              .select("id").eq("img_url", imgUrl).maybeSingle();
            memeId = got?.id;
          } else {
            memeId = ins.id;
          }
        }
      }
      if (!memeId) return json(res, 400, { error: "Provide imgUrl or meme_id" });

      // one entry per handle per contest
      const { data: dup } = await sba.from("contest_entries")
        .select("id").eq("contest_id", contest_id).eq("submitter_handle", handle)
        .maybeSingle();
      if (dup) return json(res, 200, { ok: true, duplicate: true });

      const { data: entry, error } = await sba.from("contest_entries")
        .insert({ contest_id, meme_id: memeId, submitter_handle: handle })
        .select("id").single();
      if (error) return json(res, 500, { error: error.message });

      return json(res, 200, { ok: true, entry_id: entry.id });
    }

    // --------- GET /api/contest/entries
    if (action === "entries" && req.method === "GET") {
      const contest_id = req.query.contest_id;
      if (!contest_id) return json(res, 400, { error: "contest_id required" });

      const { data, error } = await sb.from("contest_entries").select(`
        id, contest_id, meme_id, submitter_handle, created_at,
        memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
      `).eq("contest_id", contest_id).order("created_at",{ascending:false});
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { items: data||[] });
    }

    // --------- GET /api/contest/leaderboard
    if (action === "leaderboard" && req.method === "GET") {
      let contest_id = req.query.contest_id;
      if (!contest_id) {
        const { data: c } = await sb.from("contests")
          .select("id,status,created_at").in("status",["voting","open"])
          .order("status",{ascending:true}).order("created_at",{ascending:false})
          .limit(1).maybeSingle();
        if (!c) return json(res, 400, { error: "No active contest" });
        contest_id = c.id;
      }

      // fallback impl (no RPC)
      const { data: rows, error } = await sb.from("contest_entries").select(`
          id,
          submitter_handle,
          memes:memes!inner(id, handle, img_url),
          votes:contest_votes(count)
        `).eq("contest_id", contest_id);
      if (error) return json(res, 500, { error: error.message });

      const items = (rows||[]).map(r => ({
        id: r.id, submitter_handle: r.submitter_handle, memes: r.memes,
        votes: (r.votes?.[0]?.count ?? 0)
      })).sort((a,b)=> b.votes - a.votes);

      return json(res, 200, { ok:true, contest_id, items });
    }

    // --------- POST /api/contest/vote
    if (action === "vote" && req.method === "POST") {
      const { entry_id, voter_handle } = req.body || {};
      if (!entry_id || !voter_handle) return json(res, 400, { error: "entry_id and voter_handle required" });

      const { data: entry, error: e1 } = await sba.from("contest_entries")
        .select("id,contest_id").eq("id", entry_id).single();
      if (e1 || !entry) return json(res, 400, { error: "Invalid entry_id" });

      const { error } = await sba.from("contest_votes").insert({
        contest_id: entry.contest_id, entry_id, voter_handle: voter_handle.trim()
      });
      if (error) {
        if (String(error.code) === "23505") return json(res, 200, { ok:true, duplicate:true });
        return json(res, 400, { error: error.message || "Vote failed" });
      }
      return json(res, 200, { ok:true });
    }

    // --------- GET /api/contest/winners
    if (action === "winners" && req.method === "GET") {
      const limit = Math.max(1, Math.min(parseInt(req.query.limit||"3",10)||3, 12));
      const { data: contest } = await sb.from("contests")
        .select("id,title,status,created_at").eq("status","closed")
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (!contest) return json(res, 200, { contest:null, winners:[] });

      const { data: rows, error } = await sb.from("contest_winners")
        .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
        .eq("contest_id", contest.id).order("won_at",{ascending:true}).limit(limit);
      if (error) return json(res, 500, { error: error.message });

      const winners = (rows||[]).map((w,i)=>({
        rank: i+1, winner_handle: w.winner_handle, meme: w.meme, won_at: w.won_at
      }));
      return json(res, 200, { contest, winners });
    }

    // method not allowed for known action
    return json(res, 405, { error: "Method not allowed" });

  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}