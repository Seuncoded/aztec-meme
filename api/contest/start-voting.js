// /api/contest/start-voting.js
import { sbAdmin } from "../_supabase_admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { contest_id } = req.body || {};
    if (!contest_id) return res.status(400).json({ error: "contest_id required" });

    const admin = sbAdmin;

   
    const { data: c, error: e1 } = await admin
      .from("contests")
      .select("id,status")
      .eq("id", contest_id)
      .single();
    if (e1) throw e1;
    if (!c || c.status !== "open") return res.status(400).json({ error: "contest is not open" });

    const { data, error } = await admin
      .from("contests")
      .update({ status: "voting" })
      .eq("id", contest_id)
      .select()
      .single();
    if (error) throw error;

    return res.json({ ok: true, contest: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}