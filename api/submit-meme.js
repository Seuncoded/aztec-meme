// /api/submit-meme.js
import { sbAdmin } from "./_supabase_admin.js";


async function handler(req, res) {
  try {
    const body = await readJSON(req);
    const handle = String(body?.handle || "").replace(/^@+/, "").trim().toLowerCase();
    const imgUrl = String(body?.imgUrl || "").trim();

    if (!handle || !imgUrl) return send(res, 400, { ok: false, error: "handle and imgUrl required" });

    const { data, error } = await sbAdmin
      .from("memes")
      .insert([{ handle, img_url: imgUrl }])
      .select()
      .maybeSingle();

    if (error) {
      const msg = String(error.message || "");
    
      if (msg.includes("duplicate key value") || msg.includes("23505")) {
        return send(res, 200, { ok: true, duplicate: true, meme: { handle, img_url: imgUrl } });
      }
      return send(res, 400, { ok: false, error: msg });
    }

    return send(res, 200, { ok: true, meme: data });
  } catch (e) {
    return send(res, 500, { ok: false, error: "server error" });
  }
}


function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
async function readJSON(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default handler;
export const POST = handler;