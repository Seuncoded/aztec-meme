// /api/upload.js
import { createHash } from "crypto";
import { sbAdmin } from "./_supabase_admin.js"; 

export default async function upload(req, res) {
  try {
    const { handle, imageBase64 } = await getJson(req);
    if (!handle || !imageBase64) {
      return send(res, 400, { error: "handle and imageBase64 required" });
    }

    const h = String(handle).replace(/^@+/, "").trim().toLowerCase();

  
    const m = /^data:(.+);base64,(.*)$/.exec(imageBase64 || "");
    if (!m) return send(res, 400, { error: "bad image data" });
    const contentType = m[1];
    const buf = Buffer.from(m[2], "base64");

   
    const hash = createHash("sha256").update(buf).digest("hex");
    const ext  = (contentType.split("/")[1] || "png").toLowerCase();
    const path = `${hash}.${ext}`;

  
    const up = await sbAdmin.storage
      .from("memes")
      .upload(path, buf, { contentType, upsert: false })
      .catch(e => ({ error: e }));

    if (up?.error) {
      const msg = String(up.error?.message || "");
      const already = msg.toLowerCase().includes("resource already exists");
      if (!already) return send(res, 400, { error: msg || "upload failed" });
    }


    const { data: pub, error: pubErr } = sbAdmin.storage.from("memes").getPublicUrl(path);
    if (pubErr) return send(res, 400, { error: pubErr.message || "public url failed" });
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return send(res, 400, { error: "no public url" });

 
const { data: insData, error: insErr } = await sbAdmin
  .from("memes")
  .insert([{ handle: h, img_url: publicUrl }])
  .select()
  .maybeSingle();

if (insErr) {
  const msg = String(insErr.message || "");
  const dup = msg.includes("duplicate key value") || msg.includes("23505");
  if (!dup) return send(res, 400, { error: msg || "insert failed" });
  return send(res, 200, { ok: true, duplicate: true, meme: { handle: h, img_url: publicUrl } });
}

return send(res, 200, { ok: true, meme: insData });
  } catch (e) {
    return send(res, 500, { error: e?.message || "server error" });
  }
}

/* helpers */
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
async function getJson(req) {
  if (req.body && typeof req.body === "object") return req.body; 
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}