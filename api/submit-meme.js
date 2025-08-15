// api/submit-meme.js
import { sb } from './_supabase.js';

const startsWithAt = (v) => typeof v === 'string' && v.trim().startsWith('@');
const cleanHandle  = (s) => s?.trim().replace(/^@+/, '').toLowerCase() || '';
const isHttpUrl    = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawHandle = req.body?.handle;
    const imgUrl    = (req.body?.imgUrl || '').trim();

    // Basic validations
    if (!startsWithAt(rawHandle)) return res.status(400).json({ error: 'Handle must start with @' });
    const handle = cleanHandle(rawHandle);
    if (!handle) return res.status(400).json({ error: 'Invalid handle' });
    if (!imgUrl || !isHttpUrl(imgUrl)) return res.status(400).json({ error: 'Image URL must be http(s)' });

    // Insert
    const client = sb();
    const { error } = await client
      .from('memes')
      .insert([{ handle, img_url: imgUrl, source: 'web' }]);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}