// /api/upload.js
import { sbAdmin } from "./_supabase_admin.js";

export const config = {
  api: { bodyParser: { sizeLimit: "7mb" } }, // enough for max 6MB images + base64 overhead
};

const BANNED = ["porn", "pornhub", "xvideos"].map(s => s.toLowerCase());
const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const cleanHandle  = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";
const validHandle  = h => /^[a-z0-9_]{3,30}$/.test(h);

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const [, mime, b64] = m;
  const buf = Buffer.from(b64, "base64");
  return { mime, buf };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { handle: rawHandle, imageBase64 } = req.body || {};
    if (!startsWithAt(rawHandle)) return res.status(400).json({ error: "Enter your @handle (must start with @)" });
    const handle = cleanHandle(rawHandle);
    if (!handle || !validHandle(handle)) return res.status(400).json({ error: "Invalid handle" });
    if (BANNED.some(b => handle.includes(b))) return res.status(400).json({ error: "Handle not allowed" });

    const parsed = parseDataUrl(imageBase64);
    if (!parsed) return res.status(400).json({ error: "Invalid image" });
    if (parsed.buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: "Image too large (max 6MB)" });

    const supa = sbAdmin();

    // upload to storage
    const ext = parsed.mime.split("/")[1] || "png";
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supa.storage
      .from("memes")
      .upload(fileName, parsed.buf, { contentType: parsed.mime, upsert: false });
    if (upErr) throw upErr;

    // public URL
    const { data: pub } = supa.storage.from("memes").getPublicUrl(fileName);
    const img_url = pub?.publicUrl;
    if (!img_url) return res.status(500).json({ error: "URL create failed" });

    // insert row
    const { data, error } = await supa
      .from("memes")
      .insert({ handle, img_url, source: "upload" })
      .select()
      .single();
    if (error) throw error;

    return res.status(200).json({ ok: true, meme: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}