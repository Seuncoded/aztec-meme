// /api/memes.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const page  = Math.max(parseInt(req.query.page || "0", 10), 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "12", 10), 1), 60);
    const handle = (req.query.handle || "").toString().trim().toLowerCase();

    const from = page * limit;
    const to   = from + limit - 1;

    const client = sb();
    const base = client
      .from("memes")
      .select("id, handle, img_url, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    const q = handle ? base.eq("handle", handle) : base;

    const { data, count, error } = await q.range(from, to);
    if (error) throw error;

    const total = count ?? 0;
    const served = (data || []).length;
    const has_more = from + served < total;

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
    return res.status(200).json({ items: data || [], has_more });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}