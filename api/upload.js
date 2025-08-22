// api/upload.js
import * as Pub from "./_supabase.js";
import * as Admin from "./_supabase_admin.js";
import { randomUUID } from "crypto";

const sb      = Pub.sb || Pub.supabase || Pub.client || Pub.default;
const sbAdmin = Admin.sbAdmin || Admin.supabaseAdmin || Admin.client || Admin.default;

export default async function handler(req, res){
  res.setHeader("content-type","application/json");
  if (req.method !== "POST") return end(res, 405, { error: "POST only" });

  try{
    const body = await readJson(req);
    let { handle, imageBase64 } = body || {};
    handle = (handle||'').toString().replace(/^@+/,'').trim().toLowerCase();
    if (!handle) return end(res, 400, { error: "handle required" });
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return end(res, 400, { error: "imageBase64 required" });
    }

    // data URL expected: data:image/<ext>;base64,<data>
    const m = imageBase64.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (!m) return end(res, 400, { error: "Invalid image format" });
    const mime = m[1];
    const ext  = (m[2] || 'png').toLowerCase();
    const b64  = m[3];

    const buf = Buffer.from(b64, 'base64');
    const MAX = 2.5 * 1024 * 1024;   // 2.5MB safe for Vercel body limit
    if (buf.length > MAX) return end(res, 413, { error: "Image too large (max 2.5MB)" });

    // Upload to Supabase Storage (bucket: memes)
    const fileName = `uploads/${randomUUID()}.${ext}`;
    const up = await sbAdmin.storage
      .from('memes')
      .upload(fileName, buf, { contentType: mime, upsert: false });

    if (up.error) {
      // If already exists (rare), just continue to get url
      const msg = (up.error.message||'').toLowerCase();
      if (!msg.includes('duplicate')) return end(res, 500, { error: up.error.message });
    }

    const pub = sbAdmin.storage.from('memes').getPublicUrl(fileName);
    const url = pub?.data?.publicUrl;
    if (!url) return end(res, 500, { error: "Failed to get public URL" });

    // Insert into memes (dedupe on url)
    const check = await sbAdmin.from('memes').select('id').eq('img_url', url).maybeSingle();
    if (check.error) return end(res, 500, { error: check.error.message });

    if (check.data?.id) {
      return end(res, 200, { ok: true, duplicate: true, url, meme: { id: check.data.id, handle, img_url: url } });
    }

    const ins = await sbAdmin
      .from('memes')
      .insert({ handle, img_url: url })
      .select('id, handle, img_url')
      .single();

    if (ins.error) return end(res, 500, { error: ins.error.message });

    return end(res, 200, { ok: true, url, meme: ins.data });
  }catch(e){
    return end(res, 500, { error: String(e.message || e) });
  }
}

async function readJson(req){
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks=[]; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(s||'{}'); } catch { return {}; }
}
function end(res, code, obj){ res.statusCode = code; res.end(JSON.stringify(obj)); }