// /api/contest/active.js
import { sb } from "../_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const client = sb;
    const { data, error } = await client
      .from("contests")
      .select("id,title,status,submission_cap,starts_at,submissions_deadline,voting_deadline,created_at")
      .in("status", ["open", "voting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return res.json({ contest: data || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}