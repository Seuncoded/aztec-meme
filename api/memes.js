// /api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = sb();

    // query params
    const handle = (req.query.handle || "").toString().trim().toLowerCase();
    const page   = Math.max(parseInt(req.query.page || "0", 10), 0);
    const limit  = Math.min(Math.max(parseInt(req.query.limit || "12", 10), 1), 48);
    const offset = page * limit;

    let q = client
      .from("memes")
      .select("id, handle, img_url, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (handle) q = q.eq("handle", handle);

    const { data, error, count } = await q;
    if (error) throw error;

    // quick "has_more": ask one extra row
    let has_more = false;
    {
      let q2 = client
        .from("memes")
        .select("id", { count: "exact", head: true })
        .order("created_at", { ascending: false });

      if (handle) q2 = q2.eq("handle", handle);

      const { count: total } = await q2;
      has_more = total ? (offset + limit) < total : false;
    }

    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=120");
    return res.status(200).json({ items: data || [], has_more });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}