// /api/submit-meme.js
import { sb } from "./_supabase.js";

const BANNED = ["porn", "pornhub", "xvideos"].map(s => s.toLowerCase());
const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const cleanHandle = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

function isImageUrl(s = "") {
  try {
    const u = new URL(s);
    // quick filter on extensions or content-type later
    return /\.(png|jpe?g|gif|webp|avif)$/i.test(u.pathname);
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { handle: rawHandle, imgUrl } = req.body || {};

    // 1) Validate handle (“@” required)
    if (!startsWithAt(rawHandle)) {
      return res.status(400).json({ error: "Enter your @handle (must start with @)" });
    }
    const handle = cleanHandle(rawHandle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });
    if (BANNED.some(b => handle.includes(b))) {
      return res.status(400).json({ error: "Handle not allowed" });
    }

    // 2) Validate image URL
    if (typeof imgUrl !== "string" || !imgUrl.trim()) {
      return res.status(400).json({ error: "Image URL is required" });
    }
    const url = imgUrl.trim();

    // Allow common image hosts; you can loosen this later
    if (!isImageUrl(url)) {
      // Still try to HEAD it to confirm content-type is an image
      try {
        const head = await fetch(url, { method: "HEAD" });
        const ct = head.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) {
          return res.status(400).json({ error: "URL must point to an image" });
        }
      } catch {
        return res.status(400).json({ error: "URL not reachable" });
      }
    }

    // 3) (Optional) Basic cooldown per handle (60s)
    //    This avoids spam while keeping it simple.
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

    // 4) Insert (allow duplicates of img_url if you want — or you can prevent duplicates)
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