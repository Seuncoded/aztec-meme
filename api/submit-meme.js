// /api/submit-meme.js
import { sb } from "./_supabase.js";

const BANNED = ["porn", "pornhub", "xvideos"].map(s => s.toLowerCase());
const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const cleanHandle = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";
const HANDLE_RX = /^[a-z0-9_]{1,30}$/; // X-style

function pathLooksLikeImage(p = "") {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(p);
}

async function probeImageUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  const headers = { "User-Agent": "AztecMemeBot/1.0", Accept: "image/*" };
  try {
    // Try HEAD first
    let r = await fetch(url, { method: "HEAD", headers, signal: controller.signal });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      clearTimeout(timer);
      return ct.startsWith("image/");
    }
    // Some hosts block HEAD; try tiny GET
    r = await fetch(url, {
      method: "GET",
      headers: { ...headers, Range: "bytes=0-0" },
      signal: controller.signal,
    });
    const ct = r.headers.get("content-type") || "";
    clearTimeout(timer);
    return r.ok && ct.startsWith("image/");
  } catch {
    clearTimeout(timer);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { handle: rawHandle, imgUrl } = req.body || {};

    // 1) Require '@'
    if (!startsWithAt(rawHandle)) {
      return res.status(400).json({ error: "Enter your @handle (must start with @)" });
    }

    // 2) Normalize + banlist + format
    const handle = cleanHandle(rawHandle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });
    if (BANNED.some(b => handle.includes(b))) {
      return res.status(400).json({ error: "Handle not allowed" });
    }
    if (!HANDLE_RX.test(handle)) {
      return res.status(400).json({ error: "Handle must be letters/numbers/_ (≤30)" });
    }

    // 3) Validate image URL
    if (typeof imgUrl !== "string" || !imgUrl.trim()) {
      return res.status(400).json({ error: "Image URL is required" });
    }
    const url = imgUrl.trim();

    // Quick extension check; if unknown, probe the URL
    let ok = true;
    try {
      const u = new URL(url);
      ok = pathLooksLikeImage(u.pathname) || await probeImageUrl(url);
    } catch {
      ok = false;
    }
    if (!ok) return res.status(400).json({ error: "URL must point to an image" });

    // 4) Simple cooldown per handle (60s)
    const client = sb();
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

    // 5) Insert
    const { data, error } = await client
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