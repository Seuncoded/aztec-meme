// /api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const client = sb();

    const limit  = Math.min(parseInt(req.query.limit || "60", 10), 120);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
    const shuffle = req.query.shuffle === "1";

    // Just pull a page
    const { data, error } = await client
      .from("memes")
      .select("id, handle, img_url, source, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Optional shuffle on the server
    const out = Array.isArray(data) ? data.slice() : [];
    if (shuffle) {
      for (let i = out.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [out[i], out[j]] = [out[j], out[i]];
      }
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}