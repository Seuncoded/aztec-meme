// ===== helpers =====
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const grid = $('#grid');
const msg  = $('#msg');
const btn  = $('#submitBtn');

// Filter state (click @handle to filter)
let filterHandle = null;

// Paging state
let page = 0;
const LIMIT = 12;
let loading = false;
let done = false;

// Sentinel for intersection observer
let sentinel;

// Toast
function showToast(message, type = 'info', ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast ' + (type === 'success' ? 'success'
                         : type === 'error'   ? 'error'
                         : type === 'warn'    ? 'warn' : '');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// Filter pill
function ensureFilterBar() {
  let bar = $('#filterBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'filterBar';
    bar.style.cssText = 'display:none; margin:8px auto 6px; text-align:center;';
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
    setFilter(null);
  });
}

// ===== UI builders =====
function tileNode(item, delayIdx, eager = false){
  const div = document.createElement('article');
  div.className = 'tile';
  div.style.setProperty('--d', `${(delayIdx||0) * 0.03}s`);

  // eager: first page (above-the-fold) loads immediately; later pages lazy-load
  const imgAttrs = eager ? `decoding="async" fetchpriority="high"` 
                         : `loading="lazy" decoding="async"`;

  div.innerHTML = `
    <img class="img" ${imgAttrs}
         src="${item.img_url}"
         alt="meme by @${item.handle}">
    <div class="meta">
      <button class="by" data-h="${item.handle}" title="See all by @${item.handle}">
        <span class="at">@</span>${item.handle}
      </button>
    </div>
  `;

  // Wait for the image to load, then reveal the meta
  const img = div.querySelector('img');
  if (img.complete && img.naturalWidth > 0) {
    div.classList.add('ready');
  } else {
    img.addEventListener('load', () => div.classList.add('ready'), { once:true });
    img.addEventListener('error', () => div.classList.add('ready'), { once:true }); // still show meta on error
  }

  return div;
}

// ===== data =====
async function fetchPage(p, handle){
  const params = new URLSearchParams();
  params.set('page', String(p));
  params.set('limit', String(LIMIT));
  if (handle) params.set('handle', handle);
  const r = await fetch('/api/memes?' + params.toString(), { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  return r.json(); // { items: [], has_more: bool }
}

// ===== render / paging =====
function addSentinel(){
  if (sentinel) return;
  sentinel = document.createElement('div');
  sentinel.id = 'sentinel';
  sentinel.style.height = '1px';
  sentinel.style.opacity = '0';
  grid.after(sentinel);
}

let io;
function setupObserver(){
  addSentinel();
  io?.disconnect();
  io = new IntersectionObserver(async (entries)=>{
    const entry = entries[0];
    if (!entry.isIntersecting) return;
    if (loading || done) return;
    await loadNextPage();
  }, { rootMargin: '600px 0px 600px 0px' });
  io.observe(sentinel);
}

function setFilter(handle){
  // smooth fade-out current grid
  grid.classList.add('fade-out');
  filterHandle = handle ? handle.toLowerCase() : null;
  renderFilterBar();
  // reset paging
  page = 0; done = false; loading = false;
  // clear and fade-in after small delay
  setTimeout(async ()=>{
    grid.innerHTML = '';
    grid.classList.remove('fade-out');
    grid.classList.add('fade-in');
    // initial page load
    await loadNextPage(true);
    // then ensure observer
    setupObserver();
    // remove fade-in flag to allow future transitions
    setTimeout(()=> grid.classList.remove('fade-in'), 250);
  }, 180);
}

async function loadNextPage(initial=false){
  if (loading || done) return;
  loading = true;

  // show a few skeletons only on initial load or if grid is empty
  const addSk = initial || grid.childElementCount === 0;
  let skels = [];
  if (addSk){
    for (let i=0; i<6; i++) {
      const s = skeletonNode();
      grid.appendChild(s);
      skels.push(s);
    }
  }

  try{
    const { items, has_more } = await fetchPage(page, filterHandle);
    // remove skeletons
    skels.forEach(s => s.remove());

    if (!items || items.length === 0){
      if (page === 0 && grid.childElementCount === 0){
        grid.innerHTML = '<div style="color:#c8cff9;padding:20px">No memes yet. Be the first!</div>';
      }
      done = true;
      return;
    }

    const frag = document.createDocumentFragment();
    const isFirstPage = (page === 0);
items.forEach((m, i) => frag.appendChild(tileNode(m, (page*LIMIT)+i, isFirstPage)));
    grid.appendChild(frag);

    page += 1;
    done = !has_more;
  } catch (e){
    skels.forEach(s => s.remove());
    if (msg) msg.textContent = 'Failed to load memes.';
  } finally {
    loading = false;
  }
}

// ===== init (first load + observer) =====
async function initFeed(){
  renderFilterBar();
  await loadNextPage(true);
  setupObserver();
}
initFeed();

// ===== click a handle to filter =====
grid?.addEventListener('click', (e) => {
  const byBtn = e.target.closest('.by');
  if (!byBtn) return;
  const h = (byBtn.dataset.h || '').trim().toLowerCase();
  if (!h) return;
  setFilter(h);
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

      // If we're filtered to this handle, reset feed and reload from page 0 for a smooth add
      const cleaned = (rawHandle || '').replace(/^@+/, '').toLowerCase();
      if (filterHandle && filterHandle === cleaned) {
        setFilter(filterHandle);
      } else {
        // otherwise just prepend a refresh by resetting the feed (keeps UX consistent)
        setFilter(filterHandle); // re-renders current view
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
const uploadFile   = $('#file');
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
      // refresh current view
      setFilter(filterHandle);
      window.scrollTo({ top: 0, behavior:'smooth' });
    }
  } catch {
    showToast('Network error', 'error', 3200);
  } finally {
    if (uploadBtn){ uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Meme'; }
  }
});