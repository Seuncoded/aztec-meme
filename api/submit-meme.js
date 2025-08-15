// /api/submit.js
import { sb } from "./_supabase.js";

const DEFAULT_PFP = "/img/default-pfp.svg";
const T1 = process.env.TWITTER_BEARER;            // primary
const T2 = process.env.TWITTER_BEARER_TOKEN_2;    // optional backup

const mustStartWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const clean = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

async function fetchTwitterPfp(handle, bearer){
  if (!bearer) return null;
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const base = j?.data?.profile_image_url;
  if (!base) return null;
  // upgrade to 400x400 where possible
  return base.replace("_normal.", "_400x400.").replace("_normal.", ".");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const raw = req.body?.handle;
    if (!mustStartWithAt(raw)) return res.status(400).json({ error: "Please enter your @handle" });

    const handle = clean(raw);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });

    // 1) Twitter (T1 then T2)
    let pfpUrl = await fetchTwitterPfp(handle, T1);
    if (!pfpUrl && T2) pfpUrl = await fetchTwitterPfp(handle, T2);

    // 2) Unavatar JSON (direct image URL)
    if (!pfpUrl) {
      try {
        const r = await fetch(`https://unavatar.io/twitter/${encodeURIComponent(handle)}?json`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (r.ok) {
          const j = await r.json();
          if (j?.url) pfpUrl = j.url;  // direct image
        }
      } catch {}
    }

    // 3) Final fallback
    if (!pfpUrl) pfpUrl = DEFAULT_PFP;

    // 4) Save
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        { handle, pfp_url: pfpUrl, last_refreshed: new Date().toISOString() },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}