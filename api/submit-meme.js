// /api/submit-meme.js
import * as Admin from "./_supabase_admin.js";

const sbAdmin =
  Admin.sbAdmin || Admin.supabaseAdmin || Admin.client || Admin.default;

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    if (req.method !== "POST")
      return send(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    let { handle, imgUrl } = body || {};

    handle = String(handle || "").trim().replace(/^@+/, "").toLowerCase();
    imgUrl = String(imgUrl || "").trim();
    if (!handle || !imgUrl) {
      return send(res, 400, { error: "handle and imgUrl required" });
    }

  
    const ins = await sbAdmin
      .from("memes")
      .insert([{ handle, img_url: imgUrl }])
      .select()
      .maybeSingle();

    if (ins.error) {
      const msg = String(ins.error.message || "");
      const isDup = msg.includes("duplicate key value") || msg.includes("23505");
      if (isDup) return send(res, 200, { ok: true, duplicate: true });
      return send(res, 400, { error: msg || "insert failed" });
    }

    return send(res, 200, { ok: true, meme: ins.data });
  } catch (e) {
    return send(res, 500, { error: "server error" });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
function send(res, code, obj) {
  res.statusCode = code;
  res.end(JSON.stringify(obj));
}