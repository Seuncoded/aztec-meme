// helpers
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const grid = $('#grid');
const msg  = $('#msg');
const btn  = $('#submitBtn');

grid.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG') {
      t.closest('.tile')?.remove();
    }
  },
  true // capture phase so image load errors are caught
);

function showToast(message, type = 'info', ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast ' + (type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warn' ? 'warn' : '');
  // force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// main.js (or whatever file has tileNode)

// 🔹 Add this near the top, before tileNode
function countOf(reactions, key) {
  const v = reactions?.[key];
  return typeof v === "string" ? (parseInt(v, 10) || 0) : (v || 0);
}


/* ---------- card builder (same size/feel as before) ---------- */
function tileNode(item, delayIdx){
  const counts = {
    like: countOf(item.reactions, "like"),
    love: countOf(item.reactions, "love"),
    lol:  countOf(item.reactions, "lol"),
    fire: countOf(item.reactions, "fire"),
    wow:  countOf(item.reactions, "wow"),
  };

  const div = document.createElement('article');
  div.className = 'tile';
  div.style.setProperty('--d', `${(delayIdx||0) * 0.03}s`);
  div.innerHTML = `
    <img
      class="img"
      src="${item.img_url}"
      alt="meme by @${item.handle}"
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror="this.onerror=null; this.closest('.tile')?.remove();"
    >
    <div class="meta">
      <span class="by">@${item.handle}</span>
      <div class="reactions" data-id="${item.id}">
        <button class="rx" data-r="like">👍 <i>${counts.like}</i></button>
        <button class="rx" data-r="love">❤️ <i>${counts.love}</i></button>
        <button class="rx" data-r="lol">😂 <i>${counts.lol}</i></button>
        <button class="rx" data-r="fire">🔥 <i>${counts.fire}</i></button>
        <button class="rx" data-r="wow">😮 <i>${counts.wow}</i></button>
      </div>
    </div>
  `;

  div.querySelectorAll('.rx').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id  = div.querySelector('.reactions').dataset.id;
      const key = btn.dataset.r;
      const iEl = btn.querySelector('i');

      // optimistic bump
      iEl.textContent = (parseInt(iEl.textContent||'0',10)+1);

      try{
        const r = await fetch('/api/react', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ memeId: id, reaction: key })
        });
        const j = await r.json();
        if(!r.ok || !j.ok){
          // rollback
          iEl.textContent = (parseInt(iEl.textContent||'1',10)-1);
        }else{
          const rx = j.reactions || {};
          div.querySelectorAll('.rx').forEach(b=>{
            const k = b.dataset.r;
            const el = b.querySelector('i');
            const v = typeof rx[k] === 'string' ? parseInt(rx[k],10)||0 : rx[k]||0;
            el.textContent = v;
          });
        }
      }catch{
        // rollback on network error
        iEl.textContent = (parseInt(iEl.textContent||'1',10)-1);
      }
    });
  });

  return div;
}

/* ---------- data ---------- */
async function listMemes(){
  const r = await fetch('/api/memes', { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  return r.json();
}

/* ---------- render (all at once, like before) ---------- */
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
    const frag = document.createDocumentFragment();
    memes.forEach((m, i) => frag.appendChild(tileNode(m, i)));
    grid.appendChild(frag);
  } catch (e){
    msg && (msg.textContent = 'Failed to load memes.');
  }
}

/* ---------- link submit ---------- */
$('#form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const rawHandle = $('#handle').value;
  const imgUrl = $('#imgUrl').value.trim();
  if (!rawHandle || !imgUrl) { showToast('Enter @handle and image URL', 'warn'); return; }

  btn.disabled = true; btn.textContent = 'Submitting…'; msg.textContent = '';

  try {
    const r = await fetch('/api/submit-meme', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imgUrl })
    });
    const j = await r.json();

    if (!r.ok) {
      showToast(j?.error || 'Network error', 'error', 3200);
      msg.textContent = j?.error || 'Network error';
    } else {
      if (j.duplicate) {
        showToast('That image is already on the wall ✨', 'warn');
      } else {
        showToast('Meme added! 🎉', 'success');
      }
      $('#form').reset();
      await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch {
    showToast('Network error', 'error', 3200);
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false; btn.textContent = 'Submit';
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
  uploadMsg.textContent = '';

  const rawHandle = uploadHandle.value.trim();
  if (!rawHandle) { showToast('Enter your @handle', 'warn'); return; }
  const file = uploadFile.files?.[0];
  if (!file) { showToast('Choose an image', 'warn'); return; }

  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  try {
    uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…';

    const resp = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imageBase64: dataUrl })
    });
    const j = await resp.json();

    if (!resp.ok || !j.ok) {
      showToast(j?.error || 'Upload failed', 'error', 3200);
    } else {
      showToast('Uploaded ✅', 'success');
      uploadForm.reset();
      preview.style.display = 'none';
      if (typeof render === 'function') await render();
      window.scrollTo({ top: 0, behavior:'smooth' });
    }
  } catch {
    showToast('Network error', 'error', 3200);
  } finally {
    uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Meme';
  }
});

/* init */
render();

