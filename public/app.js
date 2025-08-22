
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];


const contestUrl = (action, params = {}) => {
  const qs = new URLSearchParams({ action, ...params });
  return `/api/contest?${qs.toString()}`;
};

const grid = $('#grid');
const msg  = $('#msg');

let filterHandle = null;
let page = 0;
const LIMIT = 12;
let loading = false;
let done = false;

let sentinel;


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
  $('#clearFilter')?.addEventListener('click', () => setFilter(null));
}


function tileNode(item, delayIdx, eager = false){
  const div = document.createElement('article');
  div.className = 'tile';
  div.style.setProperty('--d', `${(delayIdx||0) * 0.03}s`);
  const imgAttrs = eager ? `decoding="async" fetchpriority="high"` : `loading="lazy" decoding="async"`;
  div.innerHTML = `
    <img class="img" ${imgAttrs}
         src="${item.img_url}"
         alt="meme by @${item.handle}"
         onerror="this.style.opacity=0; this.alt='image failed to load';">
    <div class="meta">
      <button class="by" data-h="${item.handle}" title="See all by @${item.handle}">
        <span class="at">@</span>${item.handle}
      </button>
    </div>
  `;
  return div;
}


async function fetchPage(p, handle){
  const params = new URLSearchParams();
  params.set('page', String(p));
  params.set('limit', String(LIMIT));
  if (handle) params.set('handle', handle);
  const r = await fetch('/api/memes?' + params.toString(), { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  return r.json();
}


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
  grid.classList.add('fade-out');
  filterHandle = handle ? handle.toLowerCase() : null;
  renderFilterBar();

  page = 0; done = false; loading = false;

  setTimeout(async ()=>{
    grid.innerHTML = '';
    grid.classList.remove('fade-out');
    grid.classList.add('fade-in');

    await loadNextPage(true);
    setupObserver();

    setTimeout(()=> grid.classList.remove('fade-in'), 250);
  }, 180);
}

async function loadNextPage(initial=false){
  if (loading || done) return;
  loading = true;

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

function skeletonNode(){
  const div = document.createElement('article');
  div.className = 'tile skeleton';
  div.innerHTML = `
    <div class="img" style="
      width:100%;
      aspect-ratio: 1 / 1;
      border-radius:14px;
      background: linear-gradient(90deg, #0f1a39 25%, #142046 37%, #0f1a39 63%);
      background-size: 400% 100%;
      animation: skel 1.2s ease-in-out infinite;
    "></div>
    <div class="meta" style="height:18px;margin-top:6px;background:#0f1a39;border-radius:8px;"></div>
  `;
  return div;
}


async function initFeed(){
  renderFilterBar();
  await loadNextPage(true);
  setupObserver();
}
initFeed();


grid?.addEventListener('click', (e) => {
  const byBtn = e.target.closest('.by');
  if (!byBtn) return;
  const h = (byBtn.dataset.h || '').trim().toLowerCase();
  if (!h) return;
  setFilter(h);
});



const unifiedForm = document.getElementById('unifiedForm');
const handleAll   = document.getElementById('handleAll');
const imgAll      = document.getElementById('imgAll');
const fileAll     = document.getElementById('fileAll');
const submitAll   = document.getElementById('submitAll');

unifiedForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const rawHandle = (handleAll?.value || '').trim();
  const url       = (imgAll?.value || '').trim();
  const file      = fileAll?.files?.[0] || null;

  if (!rawHandle)    { showToast('Enter @handle', 'warn'); return; }
  if (!url && !file) { showToast('Add an image URL or choose a file', 'warn'); return; }

  submitAll.disabled = true;
  submitAll.textContent = 'Submitting…';

  try {
    
    if (file) {
      if (file.size > 3 * 1024 * 1024) { showToast('Image too large (max 6MB)', 'error'); return; }

      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });

      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle: rawHandle, imageBase64: dataUrl })
      });
      const uj = await resp.json();

      if (!resp.ok || !uj.ok) {
        showToast(uj?.error || 'Upload failed', 'error');
      } else if (uj.duplicate) {
        showToast('Already on the wall ✨', 'warn');
      } else {
        showToast('Uploaded ✅', 'success');
      }

      unifiedForm.reset();
      setFilter(filterHandle);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return; 
    }

    
    const r = await fetch('/api/submit-meme', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imgUrl: url })
    });
    const j = await r.json();

    if (!r.ok) {
      showToast(j?.error || 'Network error', 'error');
    } else if (j.duplicate) {
      showToast('Already on the wall ✨', 'warn');
    } else {
      showToast('Meme added! 🎉', 'success');
    }

    unifiedForm.reset();
    setFilter(filterHandle);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch {
    showToast('Network error', 'error');
  } finally {
    submitAll.disabled = false;
    submitAll.textContent = 'Submit';
  }
});



async function loadWinners() {
  const box   = document.getElementById('winnersBox');
  const grid  = document.getElementById('winnersGrid');
  const title = document.getElementById('winnersContestTitle');

  if (!box || !grid || !title) {
    console.warn('[winners] elements missing on page');
    return;
  }

  try {
    const r = await fetch(contestUrl('winners', { limit: 1 }), { cache: 'no-store' });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch {
      console.error('[winners] Non-JSON response:', text);
      grid.innerHTML = `<div class="muted">Winners API error (non-JSON). Check server logs.</div>`;
      box.style.display = 'block';
      return;
    }

    if (!r.ok) {
      console.error('[winners] API error:', j);
      grid.innerHTML = `<div class="muted">Winners API error: ${j.error || r.status}</div>`;
      box.style.display = 'block';
      return;
    }

    const winners = j.winners || [];
    if (!winners.length) {
      title.textContent = '';
      grid.innerHTML = `<div class="muted">No winners yet.</div>`;
      box.style.display = 'block';
      return;
    }

  
    const winner = winners[0];
title.innerHTML = `
  <div id="winnersTitle">
    <span class="trophy">🏆</span>
    <span class="text">Meme of the Week</span>
    
  </div>
`;
    grid.innerHTML = winnerTile(winner);
    box.style.display = 'block';
  } catch (e) {
    console.error('[winners] fetch failed:', e);
    if (grid) {
      grid.innerHTML = `<div class="muted">Failed to load winners.</div>`;
      box.style.display = 'block';
    }
  }
}

function winnerTile(w) {
  const m = w.meme || {};
  return `
    <article class="tile" style="position:relative; max-width:320px; margin:0 auto;">
      <div style="
        position:absolute;
        top:10px; left:10px;
        background:#6a5acd;
        color:white;
        padding:4px 10px;
        border-radius:999px;
        font-weight:600;
        font-size:13px;
      ">🏆 Winner</div>
      <img src="${m.img_url || ''}" alt="Winning meme" style="border-radius:12px;">
      <div class="meta" style="text-align:center; margin-top:6px;">
        <span style="color:#c8cff9; font-weight:700;">@${m.handle || 'anon'}</span>
      </div>
    </article>
  `;
}
loadWinners();


async function refreshCtas(){
  const contestBtn = document.getElementById('contestCta');
  const voteBtn    = document.getElementById('voteCta');
  if (!contestBtn || !voteBtn) return; 


  contestBtn.style.display = 'none';
  voteBtn.style.display = 'none';

  try {
    const r = await fetch(contestUrl('active'), { cache: 'no-store' });
    if (!r.ok) return;
    const { contest } = await r.json();

    if (!contest || !contest.status) return;

   
    const cid = contest.id;
    if (cid) {
      contestBtn.href = `/contest.html?contest_id=${cid}`;
      voteBtn.href    = `/contest.html?contest_id=${cid}#voting`;
    }

   
    if (contest.status === 'open') {
      contestBtn.style.display = 'inline-flex';
    } else if (contest.status === 'voting') {
      voteBtn.style.display = 'inline-flex';
    }
  } catch {
   
  }
}


refreshCtas();


setInterval(refreshCtas, 60000);