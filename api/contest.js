// api/contest.js  — ONE serverless function for all contest actions
import { sb as pub } from "./_supabase.js";
import { sbAdmin as admin } from "./_supabase_admin.js";

// tiny helpers
const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};
const getJson = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
};

export default async function handler(req, res) {
  const action = (req.query?.action || "").toLowerCase();

  try {
    // ---------- ACTIVE (GET) ----------
    if (action === "active") {
      if (req.method !== "GET") return send(res, 405, { error: "GET only" });
      const { data, error } = await pub
        .from("contests")
        .select("id,title,status,submission_cap,starts_at,submissions_deadline,voting_deadline,created_at")
        .in("status", ["open", "voting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { contest: data || null });
    }

    // ---------- OPEN (POST) ----------
    if (action === "open") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = await getJson(req);
      if (!title) return send(res, 400, { error: "title required" });

      const { data: existing, error: e1 } = await admin
        .from("contests").select("id,status").in("status", ["open", "voting"]);
      if (e1) return send(res, 400, { error: e1.message });
      if (existing?.length) return send(res, 409, { error: "An active contest already exists" });

      const { data, error } = await admin
        .from("contests")
        .insert({
          title,
          submission_cap: Number(submission_cap) || 10,
          submissions_deadline,
          voting_deadline,
          status: "open",
        })
        .select()
        .single();
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true, contest: data });
    }

    // ---------- START VOTING (POST) ----------
    if (action === "start-voting") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      const { contest_id } = await getJson(req);
      if (!contest_id) return send(res, 400, { error: "contest_id required" });

      const { data: c, error: e1 } = await admin
        .from("contests").select("id,status").eq("id", contest_id).single();
      if (e1) return send(res, 400, { error: e1.message });
      if (!c || c.status !== "open") return send(res, 400, { error: "contest is not open" });

      const { data, error } = await admin
        .from("contests").update({ status: "voting" }).eq("id", contest_id).select().single();
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true, contest: data });
    }

    // ---------- CLOSE (POST) + PICK WINNER ----------
    if (action === "close") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      const { contest_id } = await getJson(req);
      if (!contest_id) return send(res, 400, { error: "contest_id required" });

      const { data: contest, error: eContest } = await pub.from("contests").select("*").eq("id", contest_id).single();
      if (eContest) return send(res, 400, { error: eContest.message });
      if (!contest) return send(res, 404, { error: "contest not found" });

      const { data: entries, error: eEntries } = await pub
        .from("contest_entries")
        .select(`
          id, meme_id, submitter_handle, created_at,
          contest_votes:contest_votes(id)
        `)
        .eq("contest_id", contest_id);
      if (eEntries) return send(res, 400, { error: eEntries.message });

      let winnerRow = null;
      if (entries?.length) {
        const withCounts = entries.map(e => ({ ...e, _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0 }));
        withCounts.sort((a,b)=> b._votes - a._votes || (new Date(a.created_at) - new Date(b.created_at)));
        const top = withCounts[0];

        const { error: eClose } = await admin.from("contests").update({ status: "closed" }).eq("id", contest_id);
        if (eClose) return send(res, 400, { error: eClose.message });
        const { data: inserted, error: eWin } = await admin
          .from("contest_winners")
          .insert({ contest_id, entry_id: top.id, meme_id: top.meme_id, winner_handle: top.submitter_handle, won_at: new Date().toISOString() })
          .select("*")
          .single();
        if (eWin) return send(res, 400, { error: eWin.message });
        winnerRow = inserted;
      } else {
        const { error: eCloseOnly } = await admin.from("contests").update({ status: "closed" }).eq("id", contest_id);
        if (eCloseOnly) return send(res, 400, { error: eCloseOnly.message });
      }
      return send(res, 200, { ok: true, closed: true, winner: winnerRow });
    }

    // ---------- SUBMIT ENTRY (POST) ----------
    if (action === "submit") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      let { contest_id, handle, imgUrl, meme_id } = await getJson(req);
      handle = String(handle || "").trim().replace(/^@+/, "");
      if (!handle) return send(res, 400, { error: "handle required" });

      if (!contest_id) {
        const { data: openC, error: openErr } = await admin
          .from("contests").select("id,status").eq("status","open")
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if (openErr) return send(res, 400, { error: openErr.message });
        if (!openC) return send(res, 400, { error: "contest_id required" });
        contest_id = openC.id;
      }

      let memeId = meme_id;
      if (!memeId && imgUrl) {
        const { data: existing, error: findErr } = await admin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
        if (findErr) return send(res, 400, { error: findErr.message });
        if (existing?.id) {
          memeId = existing.id;
        } else {
          const { data: inserted, error: insErr } = await admin
            .from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
          if (insErr) {
            const { data: got, error: getErr } = await admin.from("memes").select("id").eq("img_url", imgUrl).limit(1).maybeSingle();
            if (getErr) return send(res, 400, { error: insErr.message });
            memeId = got?.id;
          } else {
            memeId = inserted.id;
          }
        }
      }
      if (!memeId) return send(res, 400, { error: "Provide imgUrl or meme_id" });

      const { data: dup, error: dupErr } = await admin
        .from("contest_entries").select("id").eq("contest_id", contest_id).eq("submitter_handle", handle).limit(1).maybeSingle();
      if (dupErr) return send(res, 400, { error: dupErr.message });
      if (dup) return send(res, 200, { ok: true, duplicate: true });

      const { data: entry, error: entryErr } = await admin
        .from("contest_entries").insert([{ contest_id, meme_id: memeId, submitter_handle: handle }]).select("id").single();
      if (entryErr) return send(res, 400, { error: entryErr.message });

      return send(res, 200, { ok: true, entry_id: entry.id });
    }

    // ---------- VOTE (POST) ----------
    if (action === "vote") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      const { entry_id, voter_handle } = await getJson(req);
      if (!entry_id || !voter_handle) return send(res, 400, { error: "entry_id and voter_handle required" });

      const { data: entry, error: e1 } = await admin.from("contest_entries").select("id,contest_id").eq("id", entry_id).single();
      if (e1 || !entry) return send(res, 400, { error: "Invalid entry_id" });

      const { error: e2 } = await admin
        .from("contest_votes")
        .insert({ contest_id: entry.contest_id, entry_id, voter_handle: voter_handle.trim() });
      if (e2) {
        if (e2.code === "23505") return send(res, 200, { ok: true, duplicate: true });
        return send(res, 400, { error: e2.message || "Vote failed" });
      }
      return send(res, 200, { ok: true });
    }

    // ---------- ENTRIES (GET) ----------
    if (action === "entries") {
      if (req.method !== "GET") return send(res, 405, { error: "GET only" });
      const { contest_id } = req.query || {};
      if (!contest_id) return send(res, 400, { error: "contest_id required" });

      const { data, error } = await pub
        .from("contest_entries")
        .select(`
          id, contest_id, meme_id, submitter_handle, created_at,
          memes:memes!contest_entries_meme_id_fkey(id, handle, img_url)
        `)
        .eq("contest_id", contest_id)
        .order("created_at", { ascending: false });
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { items: data || [] });
    }

    // ---------- LEADERBOARD (GET) ----------
    if (action === "leaderboard") {
      if (req.method !== "GET") return send(res, 405, { error: "GET only" });
      let { contest_id } = req.query || {};

      if (!contest_id) {
        const { data: c1, error: e1 } = await pub
          .from("contests")
          .select("id,status,created_at")
          .in("status", ["voting", "open"])
          .order("status", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e1) return send(res, 400, { error: e1.message });
        if (!c1) return send(res, 400, { error: "No active contest" });
        contest_id = c1.id;
      }

      const { data, error } = await pub.rpc("contest_leaderboard", { p_contest_id: contest_id });
      if (!error && data) return send(res, 200, { ok: true, contest_id, items: data });

      const { data: rows, error: e2 } = await pub
        .from("contest_entries")
        .select(`
          id,
          submitter_handle,
          memes:memes!inner(id, handle, img_url),
          votes:contest_votes(count)
        `)
        .eq("contest_id", contest_id);
      if (e2) return send(res, 400, { error: e2.message });

      const items = (rows || [])
        .map(r => ({ id: r.id, submitter_handle: r.submitter_handle, memes: r.memes, votes: (r.votes?.[0]?.count ?? 0) }))
        .sort((a,b) => b.votes - a.votes);
      return send(res, 200, { ok: true, contest_id, items });
    }

    // ---------- WINNERS (GET) ----------
    if (action === "winners") {
      if (req.method !== "GET") return send(res, 405, { error: "GET only" });
      const limit = Math.max(1, Math.min(parseInt((req.query.limit ?? "3"), 10) || 3, 12));

      const { data: contest, error: e1 } = await pub
        .from("contests")
        .select("id,title,status,created_at")
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) return send(res, 500, { error: e1.message });
      if (!contest) return send(res, 200, { contest: null, winners: [] });

      const { data: rows, error: e2 } = await pub
        .from("contest_winners")
        .select("winner_handle, won_at, meme:memes(id, handle, img_url)")
        .eq("contest_id", contest.id)
        .order("won_at", { ascending: true })
        .limit(limit);
      if (e2) return send(res, 500, { error: e2.message });

      const winners = (rows || []).map((w,i)=>({ rank: i+1, winner_handle: w.winner_handle, meme: w.meme, won_at: w.won_at }));
      return send(res, 200, { contest, winners });
    }

    // ---------- Unknown ----------
    return send(res, 400, { error: "Unknown action" });
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) });
  }
}