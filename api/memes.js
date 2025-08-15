// /api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = sb();
    const handle = (req.query.handle || "").toString().trim().toLowerCase();

    if (handle) {
      // Filter by handle, newest first (no shuffle)
      const { data, error } = await client
        .from("memes")
        .select("id, handle, img_url, created_at")
        .eq("handle", handle)
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      res.setHeader("Cache-Control", "no-store"); // always fresh when filtering
      return res.status(200).json(data || []);
    }

    // Default: latest 300, then shuffle (what you had before)
    const { data, error } = await client
      .from("memes")
      .select("id, handle, img_url, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const arr = [...(data || [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json(arr);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}