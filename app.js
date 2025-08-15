// helpers
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const grid = $('#grid');
const msg  = $('#msg');
const btn  = $('#submitBtn');

/* ---------- card builder ---------- */
function tileNode(item, delayIdx = 0){
  const el = document.createElement('article');
  el.className = 'tile';
  el.style.setProperty('--d', `${delayIdx * 0.03}s`);
  el.innerHTML = `
    <img class="img"
      src="${item.img_url}"
      alt="meme by @${item.handle}"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      sizes="(max-width:640px) 100vw, (max-width:1024px) 33vw, 300px"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none'"
    />
    <div class="meta">
      <span class="by">@${item.handle}</span>
      <span></span>
    </div>
  `;
  return el;
}

/* ---------- data ---------- */
async function listMemes(){
  const r = await fetch('/api/memes', { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  return r.json();
}

/* ---------- render (progressive) ---------- */
async function render(){
  if (!grid) return;
  try {
    msg && (msg.textContent = '');
    const memes = await listMemes();

    if (!Array.isArray(memes) || !memes.length){
      grid.innerHTML = '<div style="color:#c8cff9;padding:20px">No memes yet. Be the first!</div>';
      return;
    }

    grid.innerHTML = '';
    let i = 0;
    const CHUNK = 24;

    const addSome = (n) => {
      const frag = document.createDocumentFragment();
      for (let k = 0; k < n && i < memes.length; k++, i++){
        frag.appendChild(tileNode(memes[i], i));
      }
      grid.appendChild(frag);
    };

    // first paint
    addSome(CHUNK);

    // sentinel for progressive loading
    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    grid.appendChild(sentinel);

    const io = new IntersectionObserver((entries)=>{
      if (entries[0].isIntersecting){
        addSome(CHUNK);
        if (i >= memes.length) io.disconnect();
      }
    }, { rootMargin: '1200px 0px' });

    io.observe(sentinel);

  } catch (e){
    msg && (msg.textContent = 'Failed to load memes.');
  }
}

/* ---------- link submit ---------- */
$('#form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const rawHandle = $('#handle')?.value || '';
  const imgUrl    = $('#imgUrl')?.value?.trim() || '';
  if (!rawHandle || !imgUrl) return;

  if (btn){ btn.disabled = true; btn.textContent = 'Submitting…'; }
  msg && (msg.textContent = '');

  try {
    const r = await fetch('/api/submit-meme', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imgUrl })
    });
    const j = await r.json();
    if (!r.ok || !j.ok){
      msg && (msg.textContent = j?.error || 'Network error');
    } else {
      $('#form')?.reset();
      await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch {
    msg && (msg.textContent = 'Network error');
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = 'Submit'; }
  }
});

/* ---------- upload submit ---------- */
const uploadForm   = $('#uploadForm');
const uploadFile   = $('#uploadFile');
const uploadHandle = $('#uploadHandle');
const uploadBtn    = $('#uploadBtn');
const uploadMsg    = $('#uploadMsg');
const preview      = $('#preview');
const previewImg   = $('#previewImg');

uploadFile?.addEventListener('change', () => {
  const f = uploadFile.files?.[0];
  if (!f){ if (preview) preview.style.display = 'none'; return; }
  const reader = new FileReader();
  reader.onload = () => {
    if (previewImg) previewImg.src = reader.result;
    if (preview) preview.style.display = 'block';
  };
  reader.readAsDataURL(f);
});

uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (uploadMsg) uploadMsg.textContent = '';

  const rawHandle = uploadHandle?.value?.trim();
  if (!rawHandle){ if (uploadMsg) uploadMsg.textContent = 'Enter your @handle'; return; }
  const file = uploadFile?.files?.[0];
  if (!file){ if (uploadMsg) uploadMsg.textContent = 'Choose an image'; return; }

  // -> dataURL
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  try {
    if (uploadBtn){ uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…'; }

    const resp = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imageBase64: dataUrl })
    });
    const j = await resp.json();

    if (!resp.ok || !j.ok){
      if (uploadMsg) uploadMsg.textContent = j?.error || 'Upload failed';
    } else {
      if (uploadMsg) uploadMsg.textContent = 'Uploaded ✅';
      uploadForm?.reset?.();
      if (preview) preview.style.display = 'none';
      await render();
      window.scrollTo({ top: 0, behavior:'smooth' });
    }
  } catch {
    if (uploadMsg) uploadMsg.textContent = 'Network error';
  } finally {
    if (uploadBtn){ uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Meme'; }
  }
});

/* init */
render();