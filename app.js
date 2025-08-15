const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const grid = $('#grid');
const featuredCard = $('#featuredCard');
const msg = $('#msg');
const btn = $('#submitBtn');

function tileNode(item, delayIdx){
  const div = document.createElement('article');
  div.className = 'tile';
  div.style.setProperty('--d', `${(delayIdx||0) * 0.03}s`);
  div.innerHTML = `
    <img class="img" src="${item.img_url}" alt="meme by @${item.handle}">
    <div class="meta">
      <span class="by">@${item.handle}</span>
      <span></span>
    </div>
  `;
  return div;
}

function featuredNode(item){
  const w = Math.min(860, window.innerWidth - 40);
  const div = document.createElement('div');
  div.className = 'card';
  div.style.width = `${w}px`;
  div.innerHTML = `
    <img class="img" src="${item.img_url}" alt="featured meme by @${item.handle}">
    <div class="cap"><span class="handle">@${item.handle}</span></div>
  `;
  return div;
}

async function listMemes(){
  const r = await fetch('/api/memes', { cache:'no-store' });
  if (!r.ok) throw new Error('memes list failed');
  return r.json();
}

async function render(){
  try {
    msg.textContent = '';
    const memes = await listMemes();
    if (!Array.isArray(memes) || !memes.length){
      grid.innerHTML = '<div style="color:#c8cff9;padding:20px">No memes yet. Be the first!</div>';
      featuredCard.classList.add('hidden');
      return;
    }

    // Grid
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    memes.forEach((m, i) => frag.appendChild(tileNode(m, i)));
    grid.appendChild(frag);
  } catch (e) {
    msg.textContent = 'Failed to load memes.';
  }
}

// submit handler
$('#form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const rawHandle = $('#handle').value;
  const imgUrl = $('#imgUrl').value.trim();
  if (!rawHandle || !imgUrl) return;

  btn.disabled = true; btn.textContent = 'Submitting…'; msg.textContent = '';

  try {
    const r = await fetch('/api/submit-meme', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ handle: rawHandle, imgUrl })
    });
    const j = await r.json();
    if (!r.ok || !j.ok){
      msg.textContent = j?.error || 'Network error';
    } else {
      $('#form').reset();
      await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch {
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false; btn.textContent = 'Submit';
  }
});

render();

// ----- Meme Upload (base64 JSON -> /api/upload) -----
const uploadForm  = document.getElementById('uploadForm');
const uploadFile  = document.getElementById('uploadFile');
const uploadHandle= document.getElementById('uploadHandle');
const uploadBtn   = document.getElementById('uploadBtn');
const uploadMsg   = document.getElementById('uploadMsg');
const preview     = document.getElementById('preview');
const previewImg  = document.getElementById('previewImg');

if (uploadFile) {
  uploadFile.addEventListener('change', () => {
    const f = uploadFile.files?.[0];
    if (!f) { preview.style.display = 'none'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      previewImg.src = reader.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(f);
  });
}

uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadMsg.textContent = '';

  const rawHandle = uploadHandle.value.trim();
  if (!rawHandle) { uploadMsg.textContent = 'Enter your @handle'; return; }
  const file = uploadFile.files?.[0];
  if (!file) { uploadMsg.textContent = 'Choose an image'; return; }

  // Read file as data URL (base64) to send as JSON
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
      body: JSON.stringify({
        handle: rawHandle,
        imageBase64: dataUrl,
      })
    });
    const j = await resp.json();
    if (!resp.ok || !j.ok) {
      uploadMsg.textContent = j?.error || 'Upload failed';
    } else {
      uploadMsg.textContent = 'Uploaded ✅';
      // Clear form + preview and refresh grid
      uploadForm.reset();
      preview.style.display = 'none';
      if (typeof render === 'function') await render();
      window.scrollTo({ top: 0, behavior:'smooth' });
    }
  } catch (err) {
    uploadMsg.textContent = 'Network error';
  } finally {
    uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Meme';
  }
});