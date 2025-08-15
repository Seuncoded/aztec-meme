// pages/api/react.js
import { sb } from "./_supabase.js";

const ALLOWED = new Set(["like","love","lol","fire","wow"]);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  try {
    const { memeId, reaction } = req.body || {};
    if (!memeId || !ALLOWED.has(reaction)) {
      return res.status(400).json({ error: "Bad payload" });
    }

    const client = sb();

   
    const { data, error } = await client
      .rpc("inc_reaction", { p_id: memeId, p_key: reaction });

    if (error) throw error;
    return res.status(200).json({ ok: true, reactions: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}