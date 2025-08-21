// /api/contest/open.js
import { sbAdmin } from "../_supabase_admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { title, submission_cap = 10, submissions_deadline = null, voting_deadline = null } = req.body || {};
    if (!title) return res.status(400).json({ error: "title required" });

    const admin = sbAdmin;

   
    const { data: existing, error: e1 } = await admin
      .from("contests")
      .select("id,status")
      .in("status", ["open", "voting"]);
    if (e1) throw e1;
    if (Array.isArray(existing) && existing.length) {
      return res.status(409).json({ error: "An active contest already exists" });
    }

    const { data, error } = await admin
      .from("contests")
      .insert({
        title,
        submission_cap: Number(submission_cap) || 10,
        submissions_deadline,
        voting_deadline,
        status: "open"
      })
      .select()
      .single();
    if (error) throw error;

    return res.json({ ok: true, contest: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}