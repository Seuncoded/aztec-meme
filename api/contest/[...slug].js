// api/contest/[...slug].js
import { sb } from "../_supabase.js";
import { sbAdmin } from "../_supabase_admin.js";

export default async function handler(req, res) {
  try {
    // figure out which sub-path we’re on: /api/contest/<action>
    const url = new URL(req.url, "http://localhost");
    const after = url.pathname.split("/api/contest")[1] || "";
    const segs = after.split("/").filter(Boolean);
    const action = segs[0] || ""; // e.g. "active", "entries", etc.

    // ---------- READ ENDPOINTS ----------
    if (req.method === "GET") {
      if (action === "active") {
        const { data, error } = await sb
          .from("contests")
          .select("id,title,status,submission_cap,created_at")
          .in("status", ["open", "voting"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { contest: data || null });
      }

      if (action === "entries") {
        const contest_id = url.searchParams.get("contest_id") || "";
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

      if (action === "leaderboard") {
        const contest_id = url.searchParams.get("contest_id") || "";
        if (!contest_id) return json(res, 400, { error: "contest_id required" });

        // try RPC first; fall back to join+count
        const rpc = await sb.rpc("contest_leaderboard", { p_contest_id: contest_id });
        if (!rpc.error && rpc.data) return json(res, 200, { items: rpc.data });

        const { data: rows, error } = await sb
          .from("contest_entries")
          .select(`
            id, submitter_handle,
            memes:memes!inner(id, handle, img_url),
            votes:contest_votes(count)
          `)
          .eq("contest_id", contest_id);
        if (error) return json(res, 500, { error: error.message });

        const items = (rows || [])
          .map(r => ({
            id: r.id,
            submitter_handle: r.submitter_handle,
            memes: r.memes,
            votes: r.votes?.[0]?.count ?? 0
          }))
          .sort((a,b)=> b.votes - a.votes);

        return json(res, 200, { items });
      }

      if (action === "winners") {
        const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit")||"3",10)||3, 12));

        const { data: contest, error: e1 } = await sb
          .from("contests")
          .select("id,title,status,created_at")
          .eq("status","closed")
          .order("created_at",{ ascending:false })
          .limit(1)
          .maybeSingle();
        if (e1) return json(res, 500, { error: e1.message });
        if (!contest) return json(res, 200, { contest:null, winners:[] });

        const { data: rows, error: e2 } = await sb
          .from("contest_winners")
          .select("winner_handle, won_at, meme:memes(id,handle,img_url)")
          .eq("contest_id", contest.id)
          .order("won_at",{ ascending:true })
          .limit(limit);
        if (e2) return json(res, 500, { error: e2.message });

        const winners = (rows||[]).map((w,i)=>({
          rank: i+1, winner_handle: w.winner_handle, meme: w.meme, won_at: w.won_at
        }));
        return json(res, 200, { contest, winners });
      }

      // unknown GET
      return json(res, 404, { error: "Not found" });
    }

    // ---------- WRITE ENDPOINTS ----------
    // Body helper
    const body = await readBody(req);

    if (action === "" || body.action) {
      // allow POST /api/contest with {action:"open"|...} from admin page
      const a = action || String(body.action||"");
      if (a === "open") {
        const { title, submission_cap=10 } = body || {};
        if (!title) return json(res, 400, { error: "title required" });

        const existing = await sbAdmin
          .from("contests")
          .select("id,status")
          .in("status",["open","voting"]);
        if (existing.error) return json(res, 500, { error: existing.error.message });
        if ((existing.data||[]).length) return json(res, 409, { error: "An active contest already exists" });

        const ins = await sbAdmin
          .from("contests")
          .insert({ title, submission_cap:Number(submission_cap)||10, status:"open" })
          .select()
          .single();
        if (ins.error) return json(res, 500, { error: ins.error.message });
        return json(res, 200, { contest: ins.data });
      }

      if (a === "start-voting") {
        const { contest_id } = body || {};
        if (!contest_id) return json(res, 400, { error: "contest_id required" });
        const upd = await sbAdmin
          .from("contests")
          .update({ status:"voting" })
          .eq("id", contest_id)
          .select()
          .single();
        if (upd.error) return json(res, 500, { error: upd.error.message });
        return json(res, 200, { contest: upd.data });
      }

      if (a === "close") {
        const { contest_id } = body || {};
        if (!contest_id) return json(res, 400, { error: "contest_id required" });

        // get entries + votes
        const entries = await sb
          .from("contest_entries")
          .select("id,meme_id,submitter_handle,created_at,contest_votes:contest_votes(id)")
          .eq("contest_id", contest_id);
        if (entries.error) return json(res, 500, { error: entries.error.message });

        // choose winner
        let winner = null;
        if ((entries.data||[]).length) {
          const withCounts = entries.data.map(e => ({
            ...e, _votes: Array.isArray(e.contest_votes) ? e.contest_votes.length : 0
          })).sort((a,b)=> b._votes - a._votes || (new Date(a.created_at)-new Date(b.created_at)));

          winner = withCounts[0];
        }

        const close = await sbAdmin.from("contests").update({ status:"closed" }).eq("id", contest_id);
        if (close.error) return json(res, 500, { error: close.error.message });

        if (winner) {
          const win = await sbAdmin
            .from("contest_winners")
            .insert({
              contest_id,
              entry_id: winner.id,
              meme_id: winner.meme_id,
              winner_handle: winner.submitter_handle,
              won_at: new Date().toISOString()
            })
            .select("*")
            .single();
          if (win.error) return json(res, 500, { error: win.error.message });
          return json(res, 200, { ok:true, winner: win.data });
        }
        return json(res, 200, { ok:true, winner:null });
      }

      if (a === "submit") {
        let { contest_id, handle, imgUrl, meme_id } = body || {};
        handle = (handle||"").replace(/^@+/,"").trim().toLowerCase();
        if (!handle) return json(res, 400, { error: "handle required" });

        if (!contest_id) {
          const c = await sb
            .from("contests")
            .select("id,status")
            .in("status",["open"])
            .order("created_at",{ ascending:false })
            .limit(1)
            .maybeSingle();
          if (c.error) return json(res, 500, { error: c.error.message });
          if (!c.data) return json(res, 400, { error: "contest_id required" });
          contest_id = c.data.id;
        }

        let memeId = meme_id;
        if (!memeId && imgUrl) {
          const existing = await sbAdmin.from("memes").select("id").eq("img_url", imgUrl).maybeSingle();
          if (existing.error) return json(res, 500, { error: existing.error.message });
          memeId = existing.data?.id;
          if (!memeId) {
            const ins = await sbAdmin.from("memes").insert([{ handle, img_url: imgUrl }]).select("id").single();
            if (ins.error) return json(res, 500, { error: ins.error.message });
            memeId = ins.data.id;
          }
        }
        if (!memeId) return json(res, 400, { error: "Provide imgUrl or meme_id" });

        const dup = await sbAdmin
          .from("contest_entries")
          .select("id")
          .eq("contest_id", contest_id)
          .eq("submitter_handle", handle)
          .maybeSingle();
        if (dup.error) return json(res, 500, { error: dup.error.message });
        if (dup.data) return json(res, 200, { ok:true, duplicate:true });

        const entry = await sbAdmin
          .from("contest_entries")
          .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
          .select("id")
          .single();
        if (entry.error) return json(res, 500, { error: entry.error.message });
        return json(res, 200, { ok:true, entry_id: entry.data.id });
      }

      if (a === "vote") {
        const { entry_id, voter_handle } = body || {};
        if (!entry_id || !voter_handle) return json(res, 400, { error: "entry_id and voter_handle required" });

        const entry = await sb.from("contest_entries").select("id,contest_id").eq("id", entry_id).single();
        if (entry.error || !entry.data) return json(res, 400, { error: "Invalid entry_id" });

        const ins = await sbAdmin.from("contest_votes").insert({
          contest_id: entry.data.contest_id,
          entry_id,
          voter_handle: String(voter_handle).trim()
        });
        if (ins.error) {
          if (ins.error.code === "23505") return json(res, 200, { ok:true, duplicate:true });
          return json(res, 400, { error: ins.error.message || "Vote failed" });
        }
        return json(res, 200, { ok:true });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    // Fallback
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}

// helpers
function json(res, status, obj){
  res.statusCode = status;
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify(obj));
}
async function readBody(req){
  if (req.body && typeof req.body === "object") return req.body;
  const buf = [];
  for await (const c of req) buf.push(c);
  const raw = Buffer.concat(buf).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}