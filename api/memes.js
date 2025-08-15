// /api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const client = sb();
    const handle = (req.query.handle || "").trim().toLowerCase();

    let query = client
      .from("memes")
      .select("id, handle, img_url, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (handle) {
      query = query.eq("handle", handle);
    }

    const { data, error } = await query;
    if (error) throw error;

    // keep your random shuffle
    const rows = [...(data || [])];
    for (let i = rows.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}