// pages/api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = sb();

const { data, error } = await client
  .from("memes")
  .select("id, handle, img_url, reactions, created_at")
  .not("img_url", "is", null)
  .neq("img_url", "")
  .or("img_url.ilike.http%,img_url.ilike.https%") // ensure it looks like a real URL
  .order("created_at", { ascending: false })
  .limit(300);

    if (error) throw error;

    // ensure reactions is an object (not null) for every row
    const rows = (data || []).map(r => ({
      ...r,
      reactions: r.reactions || {}
    }));

    // keep your random shuffle
    for (let i = rows.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    // light edge caching
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}