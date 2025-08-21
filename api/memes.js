import sb from './_supabase.js';

export default async function handler(req, res) {
  try {
    const page  = Math.max(0, Number(req.query.page ?? 0));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 12)));
    const handle = (req.query.handle || '').trim().toLowerCase() || null;

    let q = sb
      .from('memes')
      .select('id, handle, img_url', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (handle) q = q.eq('handle', handle);

    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const has_more = (page + 1) * limit < (count ?? 0);
    return res.json({ items: data ?? [], has_more });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}