// ===== helpers =====
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const grid = $('#grid');
const msg  = $('#msg');
const btn  = $('#submitBtn');

// Small pill that shows when a handle filter is active
let filterHandle = null;
function ensureFilterBar() {
  let bar = $('#filterBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'filterBar';
    bar.style.cssText = `
      display:none; margin:8px auto 6px; text-align:center;
    `;
    // insert before the grid
    const wrap = $('.wrap') || document.body;
    wrap.insertBefore(bar, grid);
  }
  return bar;
}
function renderFilterBar() {
  const bar = ensureFilterBar();
  if (!filterHandle) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  bar.style.display = 'block';
  bar.innerHTML = `
    <span style="
      display:inline-block; padding:8px 12px; border-radius:999px;
      background:#0f1a39; border:1px solid #1d2952; color:#dbe0ff; font-weight:800; font-size:13px;">
      Showing memes by @${filterHandle}
      <button id="clearFilter" style="
        margin-left:10px; padding:4px 8px; border:0; cursor:pointer;
        border-radius:999px; background:#22305d; color:#fff; font-weight:800;">Clear</button>
    </span>
  `;
  $('#clearFilter')?.addEventListener('click', () => {
    filterHandle = null;
    render(); // reload default feed
  });
}

function showToast(message, type = 'info', ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast ' + (type === 'success' ? 'success'
                         : type === 'error'   ? 'error'
                         : type === 'warn'    ? 'warn' : '');
  void el.offsetWidth;             // restart animation
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ===== UI builders =====
function tileNode(item, delayIdx){
  const div = document.createElement('article');
  div.className = 'tile';
  div.style.setProperty('--d', `${(delayIdx||0) * 0.03}s`);
  div.innerHTML = `
    <img class="img" src="${item.img_url}" alt="meme by @${item.handle}" loading="lazy" decoding="async">
<div class="meta">
  <button class="by" data-h="${item.handle}" title="See all by @${item.handle}">
    @${item.handle}
  </button>
</div>
  `;
  return div;
}

// ===== data =====
async function listMemes(handle){
  const q = handle ? `?handle=${encodeURIComponent(handle)}` : '';
  const r = await fetch('/api/memes' + q, { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

// ===== render =====
async function render(){
  if (!grid) return;
  try {
    if (msg) msg.textContent = '';
    renderFilterBar();

    const memes = await listMemes(filterHandle);

    if (!Array.isArray(memes) || !memes.length){
      grid.innerHTML = '<div style="color:#c8cff9;padding:20px">No memes yet. Be the first!</div>';
      return;
    }

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    memes.forEach((m, i) => frag.appendChild(tileNode(m, i)));
    grid.appendChild(frag);
  } catch (e){
    if (msg) msg.textContent = 'Failed to load memes.';
  }
}

// ===== click a handle to filter =====
grid?.addEventListener('click', (e) => {
  const byBtn = e.target.closest('.by');
  if (!byBtn) return;
  const h = (byBtn.dataset.h || '').trim().toLowerCase();
  if (!h) return;
  filterHandle = h;
  render();
});

// ===== link submit =====
$('#form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const rawHandle = $('#handle')?.value;
  const imgUrl    = $('#imgUrl')?.value?.trim();
  if (!rawHandle || !imgUrl) { showToast('Enter @handle and image URL', 'warn'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  if (msg) msg.textContent = '';

  try {
    const r = await fetch('/api/submit-meme', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imgUrl })
    });
    const j = await r.json();

    if (!r.ok) {
      showToast(j?.error || 'Network error', 'error', 3200);
      if (msg) msg.textContent = j?.error || 'Network error';
    } else {
      if (j.duplicate) {
        showToast('That image is already on the wall ✨', 'warn');
      } else {
        showToast('Meme added! 🎉', 'success');
      }
      $('#form')?.reset();
      // If we were filtering to that same user, keep the filter active and re-render
      if (filterHandle && filterHandle === (rawHandle || '').replace(/^@+/, '').toLowerCase()) {
        await render();
      } else {
        await render();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch {
    showToast('Network error', 'error', 3200);
    if (msg) msg.textContent = 'Network error';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
});

// ===== upload submit =====
const uploadForm   = $('#uploadForm');
const uploadFile   = $('#file');            // matches your HTML id="file"
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
  if (!rawHandle) { showToast('Enter your @handle', 'warn'); return; }
  const file = uploadFile?.files?.[0];
  if (!file) { showToast('Choose an image', 'warn'); return; }

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

    if (!resp.ok || !j.ok) {
      showToast(j?.error || 'Upload failed', 'error', 3200);
    } else {
      showToast('Uploaded ✅', 'success');
      uploadForm?.reset();
      if (preview) preview.style.display = 'none';
      await render();
      window.scrollTo({ top: 0, behavior:'smooth' });
    }
  } catch {
    showToast('Network error', 'error', 3200);
  } finally {
    if (uploadBtn){ uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Meme'; }
  }
});

// ===== init =====
render();