// api/contest/submit.js
import sbAdmin from "../_supabase_admin.js";   
import { sb } from "../_supabase.js";          

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    let { contest_id, handle, imgUrl, meme_id } = req.body || {};
    handle = (handle || "").toString().trim();
    if (handle.startsWith("@")) handle = handle.slice(1);
    if (!handle) return res.status(400).json({ error: "handle required" });

   
    if (!contest_id) {
      const { data: openC, error: openErr } = await sbAdmin
        .from("contests")
        .select("id,status")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openErr) throw openErr;
      if (!openC) return res.status(400).json({ error: "contest_id required" });

      contest_id = openC.id;
    }

    
    let memeId = meme_id;

    if (!memeId && imgUrl) {
  
      const { data: existing, error: findErr } = await sbAdmin
        .from("memes")
        .select("id")
        .eq("img_url", imgUrl)
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;

      if (existing?.id) {
        memeId = existing.id;
      } else {
       
        const { data: inserted, error: insErr } = await sbAdmin
          .from("memes")
          .insert([{ handle, img_url: imgUrl }])
          .select("id")
          .single();

        if (insErr) {
          
          const { data: got, error: getErr } = await sbAdmin
            .from("memes")
            .select("id")
            .eq("img_url", imgUrl)
            .limit(1)
            .maybeSingle();
          if (getErr) throw insErr; 
          memeId = got?.id;
        } else {
          memeId = inserted.id;
        }
      }
    }

    if (!memeId) {
      return res.status(400).json({ error: "Provide imgUrl or meme_id" });
    }

    
    const { data: dup, error: dupErr } = await sbAdmin
      .from("contest_entries")
      .select("id")
      .eq("contest_id", contest_id)
      .eq("submitter_handle", handle)
      .limit(1)
      .maybeSingle();

    if (dupErr) throw dupErr;
    if (dup) return res.json({ ok: true, duplicate: true });

  
    const { data: entry, error: entryErr } = await sbAdmin
      .from("contest_entries")
      .insert([{ contest_id, meme_id: memeId, submitter_handle: handle }])
      .select("id")
      .single();

    if (entryErr) throw entryErr;

    return res.json({ ok: true, entry_id: entry.id });
  } catch (err) {
    console.error("contest/submit error", err);
    return res.status(500).json({ error: err.message || "server error" });
  }
}