const $ = s => document.querySelector(s);
const masonry = $("#masonry");
const featuredBox = $("#featured");
const msg = $("#msg");

function cardHTML(m){
  const handle = m.handle ? '@' + m.handle : '';
  const delay = (Math.random() * 350) | 0; // stagger drop
  return `
    <article class="tile" style="animation-delay:${delay}ms">
      <img src="${m.img_url}" alt="${handle} meme" loading="lazy" decoding="async">
      <div class="meta">
        <span class="handle">${handle}</span>
        <time datetime="${m.created_at}">${new Date(m.created_at).toLocaleDateString()}</time>
      </div>
    </article>
  `;
}

function pickFeatured(arr){
  if (!arr.length) return null;
  const i = (Math.random() * arr.length) | 0;
  return arr[i];
}

async function loadMemes({ offset=0, limit=80 } = {}){
  const r = await fetch(`/api/memes?offset=${offset}&limit=${limit}`);
  if (!r.ok) throw new Error("memes load failed");
  return r.json();
}

async function render(){
  msg.textContent = "";
  try{
    const data = await loadMemes({ offset:0, limit:100 });

    if (!Array.isArray(data) || !data.length){
      featuredBox.innerHTML = "";
      masonry.innerHTML = `<div style="color:#c8cff9;padding:20px">No memes yet. Be the first!</div>`;
      return;
    }

    // Featured
    const featured = pickFeatured(data);
    featuredBox.innerHTML = `
      <div class="card">
        <img src="${featured.img_url}" alt="@${featured.handle} featured meme">
        <div class="meta">
          <span>🎯 Featured</span>
          <span class="handle">@${featured.handle}</span>
          <span style="opacity:.8">${new Date(featured.created_at).toLocaleString()}</span>
        </div>
      </div>
    `;

    // Grid (shuffle client-side for variety)
    const rest = data.slice();
    // Fisher–Yates
    for(let i = rest.length - 1; i > 0; i--){
      const j = (Math.random() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    masonry.innerHTML = rest.map(cardHTML).join("");

  }catch(e){
    msg.textContent = "Failed to load memes.";
  }
}

$("#form")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const rawHandle = $("#handle").value;
  const imgUrl = $("#imgUrl").value.trim();
  const btn = $("#submitBtn");

  if (!rawHandle || !imgUrl) return;

  btn.disabled = true; btn.textContent = "Submitting…"; msg.textContent = "";

  try {
    const r = await fetch("/api/submit-meme", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ handle: rawHandle, imgUrl })
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      msg.textContent = j?.error || "Could not submit meme";
    } else {
      $("#form").reset();
      await render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch {
    msg.textContent = "Network error";
  } finally {
    btn.disabled = false; btn.textContent = "Submit";
  }
});

render();