// /api/upload.js
import { createHash } from "crypto";
import * as Admin from "./_supabase_admin.js";

const sbAdmin =
  Admin.sbAdmin || Admin.supabaseAdmin || Admin.client || Admin.default;

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    if (req.method !== "POST")
      return send(res, 405, { error: "Method not allowed" });

    const { handle, imageBase64 } = await readJson(req);
    if (!handle || !imageBase64)
      return send(res, 400, { error: "handle and imageBase64 required" });

    const h = String(handle).replace(/^@+/, "").trim().toLowerCase();

    // parse data URL
    const m = /^data:(.+);base64,(.*)$/.exec(imageBase64 || "");
    if (!m) return send(res, 400, { error: "bad image data" });
    const contentType = m[1];
    const buf = Buffer.from(m[2], "base64");

    // deterministic filename -> idempotent uploads
    const hash = createHash("sha256").update(buf).digest("hex");
    const ext = (contentType.split("/")[1] || "png").toLowerCase();
    const path = `${hash}.${ext}`;

    // upload (ignore "already exists")
    const up = await sbAdmin.storage
      .from("memes")
      .upload(path, buf, { contentType, upsert: false })
      .catch((e) => ({ error: e }));

    if (up?.error) {
      const msg = String(up.error?.message || "");
      if (!msg.toLowerCase().includes("the resource already exists")) {
        return send(res, 400, { error: msg || "upload failed" });
      }
    }

    const { data: pub } = sbAdmin.storage.from("memes").getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return send(res, 400, { error: "could not get public url" });

    // insert to memes; treat unique violation as duplicate but still ok
    const ins = await sbAdmin
      .from("memes")
      .insert([{ handle: h, img_url: publicUrl }])
      .select()
      .maybeSingle()
      .catch((e) => ({ error: e }));

    if (ins.error) {
      const msg = String(ins.error?.message || "");
      const isDup = msg.includes("duplicate key value") || msg.includes("23505");
      if (isDup) {
        return send(res, 200, { ok: true, duplicate: true, url: publicUrl });
      }
      return send(res, 400, { error: msg || "insert failed" });
    }

    return send(res, 200, { ok: true, url: publicUrl, meme: ins.data });
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