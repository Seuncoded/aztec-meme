// api/upload.js
import * as Pub from "./_supabase.js";
import * as Admin from "./_supabase_admin.js";
import { randomUUID } from "crypto";

const sb      = Pub.sb || Pub.supabase || Pub.client || Pub.default;
const sbAdmin = Admin.sbAdmin || Admin.supabaseAdmin || Admin.client || Admin.default;

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") return end(res, 405, { error: "POST only" });

  try {
    const body = await readJson(req);
    let { handle, imageBase64 } = body || {};

    
    handle = String(handle || "").replace(/^@+/, "").trim().toLowerCase();
    if (!handle) return end(res, 400, { error: "handle required" });

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return end(res, 400, { error: "imageBase64 required" });
    }


    const m = imageBase64.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (!m) return end(res, 400, { error: "Invalid image format" });

    const mime = m[1];
    const ext  = (m[2] || "png").toLowerCase();
    const b64  = m[3];

    const buf = Buffer.from(b64, "base64");
    const MAX = 3 * 1024 * 1024; 
    if (buf.length > MAX) return end(res, 413, { error: "Image too large (max 3MB)" });

   
    const fileName = `uploads/${randomUUID()}.${ext}`;
    const up = await sbAdmin.storage
      .from("memes")
      .upload(fileName, buf, { contentType: mime, upsert: false });

    if (up?.error) {
      
      const msg = String(up.error.message || "").toLowerCase();
      if (!msg.includes("already exists") && !msg.includes("duplicate")) {
        return end(res, 500, { error: up.error.message });
      }
    }

   
    const { data: pub } = sbAdmin.storage.from("memes").getPublicUrl(fileName);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return end(res, 500, { error: "Failed to get public URL" });

    const cleanUrl = normalizeUrl(publicUrl);

    
    const upsert = await sbAdmin
      .from("memes")
      .upsert({ handle, img_url: cleanUrl }, { onConflict: "img_url" })
      .select("id, handle, img_url")
      .single()
      .catch(e => ({ error: e }));

    if (upsert.error) {
      const msg = String(upsert.error.message || "");
    
      if (msg.includes("23505") || msg.toLowerCase().includes("duplicate")) {
        const got = await sbAdmin
          .from("memes")
          .select("id, handle, img_url")
          .eq("img_url", cleanUrl)
          .maybeSingle();
        if (got.error) return end(res, 500, { error: got.error.message });
        return end(res, 200, { ok: true, duplicate: true, url: cleanUrl, meme: got.data });
      }
      return end(res, 500, { error: msg });
    }

   
    const isDup = upsert.data?.img_url === cleanUrl && !!upsert.data?.id;
    return end(res, 200, {
      ok: true,
      duplicate: isDup,
      url: cleanUrl,
      meme: upsert.data
    });
  } catch (e) {
    return end(res, 500, { error: String(e?.message || e) });
  }
}



function normalizeUrl(u) {
  try {
    const x = new URL(String(u));
    x.hash = "";
    x.search = "";                 
    return x.toString().replace(/\/+$/, ""); 
  } catch {
    return String(u || "").trim();
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function end(res, code, obj) {
  res.statusCode = code;
  res.end(JSON.stringify(obj));
}