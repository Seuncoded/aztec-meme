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