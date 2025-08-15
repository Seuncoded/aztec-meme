// /api/upload.js
import { sbAdmin } from "./_supabase_admin.js";

// Max 5MB
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function parseDataUrl(dataUrl = "") {
  // data:[mime];base64,XXXX
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  return { mime, b64 };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { handle, imageBase64 } = req.body || {};
    const cleanHandle = String(handle || "").trim().replace(/^@+/, "").toLowerCase();
    if (!cleanHandle) return res.status(400).json({ error: "Handle required" });

    // Parse & validate image
    const parsed = parseDataUrl(imageBase64);
    if (!parsed) return res.status(400).json({ error: "Invalid image data" });
    if (!ALLOWED.has(parsed.mime)) return res.status(400).json({ error: "Unsupported image type" });
    const buf = Buffer.from(parsed.b64, "base64");
    if (buf.length > MAX_BYTES) return res.status(400).json({ error: "Image too large (max 5MB)" });

    const ext =
      parsed.mime === "image/jpeg" ? "jpg" :
      parsed.mime === "image/png"  ? "png" :
      parsed.mime === "image/webp" ? "webp" :
      parsed.mime === "image/gif"  ? "gif" : "bin";

    const filename = `${cleanHandle}-${Date.now()}.${ext}`;
    const client = sbAdmin();

    // Upload to public bucket `memes`
    const { error: upErr } = await client.storage.from("memes").upload(filename, buf, {
      contentType: parsed.mime,
      upsert: false,
    });
    if (upErr) return res.status(500).json({ error: "Upload failed" });

    // Get public URL
    const { data: pub } = client.storage.from("memes").getPublicUrl(filename);
    const img_url = pub?.publicUrl;
    if (!img_url) return res.status(500).json({ error: "Could not get public URL" });

    // Insert into table
    const { error: dbErr } = await client.from("memes").insert({
      handle: cleanHandle,
      img_url,
    });
    if (dbErr) return res.status(500).json({ error: "DB insert failed" });

    return res.status(200).json({ ok: true, img_url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}