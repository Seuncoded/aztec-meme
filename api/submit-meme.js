// /api/submit-meme.js
import { sbAdmin } from "./_supabase_admin.js";

const BANNED = ["porn", "pornhub", "xvideos"].map(s => s.toLowerCase());
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const cleanHandle  = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";
const validHandle  = h => /^[a-z0-9_]{3,30}$/.test(h);

function isImagePathname(pathname = "") {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(pathname);
}
function normalizeUrl(s = "") {
  const trimmed = s.trim();
  try {
    const u = new URL(trimmed);
    if (isImagePathname(u.pathname)) {
      u.search = "";
      return u.toString();
    }
  } catch {}
  return trimmed;
}


const hits = new Map();
function tooFast(ip, win = 8000) {
  const now = Date.now();
  const last = hits.get(ip) ?? 0;
  if (now - last < win) return true;
  hits.set(ip, now);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    if (tooFast(ip)) return res.status(429).json({ error: "Slow down a bit 🐢" });

    const { handle: rawHandle, imgUrl } = req.body || {};

    if (!startsWithAt(rawHandle)) {
      return res.status(400).json({ error: "Enter your @handle (must start with @)" });
    }
    const handle = cleanHandle(rawHandle);
    if (!handle || !validHandle(handle)) {
      return res.status(400).json({ error: "Invalid handle (use letters/numbers/_ only)" });
    }
    if (BANNED.some(b => handle.includes(b))) {
      return res.status(400).json({ error: "Handle not allowed" });
    }

    if (typeof imgUrl !== "string" || !imgUrl.trim()) {
      return res.status(400).json({ error: "Image URL is required" });
    }
    const url = normalizeUrl(imgUrl);

    if (!isImagePathname(new URL(url).pathname)) {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const ct = (head.headers.get("content-type") || "").toLowerCase();
        if (!ct.startsWith("image/")) return res.status(400).json({ error: "URL must point to an image" });
        const len = parseInt(head.headers.get("content-length") || "0", 10);
        if (len && len > MAX_IMAGE_BYTES) return res.status(400).json({ error: "Image too large (max 6MB)" });
      } catch {
        return res.status(400).json({ error: "URL not reachable" });
      }
    }

    const supa = sbAdmin();

  
    const { data: dup } = await supa
      .from("memes")
      .select("id")
      .eq("handle", handle)
      .eq("img_url", url)
      .limit(1);

    if (Array.isArray(dup) && dup.length) {
      return res.status(200).json({ ok: true, meme: dup[0], duplicate: true });
    }

    // insert (service role bypasses RLS)
    const { data, error } = await supa
      .from("memes")
      .insert({ handle, img_url: url, source: "url" })
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json({ ok: true, meme: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}