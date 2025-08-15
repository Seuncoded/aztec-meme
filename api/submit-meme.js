// /api/submit-meme.js
import { sb } from "./_supabase.js";

const BANNED = ["porn", "pornhub", "xvideos"].map(s => s.toLowerCase());
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB

const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const cleanHandle = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";
const validHandle = h => /^[a-z0-9_]{3,30}$/.test(h);

// Safe parse helper
function tryParseUrl(s = "") {
  try { return new URL(s.trim()); } catch { return null; }
}

function isImagePathname(pathname = "") {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(pathname);
}

// Normalize for storage; DB also lower/trim via img_url_norm
function normalizeUrl(s = "") {
  const u = tryParseUrl(s);
  if (!u) return s.trim();
  // if it already has an image extension, drop query for stability
  if (isImagePathname(u.pathname)) u.search = "";
  return u.toString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { handle: rawHandle, imgUrl } = req.body || {};

    // 1) Handle validation
    if (!startsWithAt(rawHandle)) {
      return res.status(400).json({ error: "Enter your @handle (must start with @)" });
    }
    const handle = cleanHandle(rawHandle);
    if (!handle || !validHandle(handle)) {
      return res.status(400).json({ error: "Invalid handle (letters/numbers/_ only)" });
    }
    if (BANNED.some(b => handle.includes(b))) {
      return res.status(400).json({ error: "Handle not allowed" });
    }

    // 2) Image URL validation
    if (typeof imgUrl !== "string" || !imgUrl.trim()) {
      return res.status(400).json({ error: "Image URL is required" });
    }
    const url = normalizeUrl(imgUrl);
    const parsed = tryParseUrl(url);
    if (!parsed) return res.status(400).json({ error: "Invalid URL" });

    // If no extension, try HEAD to verify it’s actually an image
    if (!isImagePathname(parsed.pathname)) {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const ct = (head.headers.get("content-type") || "").toLowerCase();
        if (!ct.startsWith("image/")) {
          return res.status(400).json({ error: "URL must point to an image" });
        }
        const len = parseInt(head.headers.get("content-length") || "0", 10);
        if (len && len > MAX_IMAGE_BYTES) {
          return res.status(400).json({ error: "Image too large (max 6MB)" });
        }
      } catch {
        return res.status(400).json({ error: "URL not reachable" });
      }
    }

    const client = sb();

    // 3) Cooldown (60s per handle)
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await client
      .from("memes")
      .select("id")
      .eq("handle", handle)
      .gte("created_at", since)
      .limit(1);
    if (Array.isArray(recent) && recent.length) {
      return res.status(429).json({ error: "Please wait a minute before posting again" });
    }

    // 4) Optional pre-check for UX (DB is still the source of truth)
    const { data: exists } = await client
      .from("memes")
      .select("id")
      .eq("img_url_norm", url.toLowerCase().trim()) // <-- matches generated column
      .limit(1);
    if (Array.isArray(exists) && exists.length) {
      return res.status(409).json({ error: "This image is already on the wall" });
    }

    // 5) Insert and catch duplicate from DB (race-safe)
    const { data, error } = await client
      .from("memes")
      .insert({ handle, img_url: url, source: "url" })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique violation from our img_url_norm index
        return res.status(409).json({ error: "This image is already on the wall" });
      }
      throw error;
    }

    return res.status(200).json({ ok: true, meme: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}