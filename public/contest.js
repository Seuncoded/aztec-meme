// public/contest.js

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const toast = (m)=>{ const t=$("#toast"); if(!t) return;
  t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2000);
};

// ----- unified contest API url builder -----
const contestUrl = (action, params = {}) => {
  const qs = new URLSearchParams({ action, ...params });
  return `/api/contest?${qs.toString()}`;
};

// safe JSON to tolerate non‑JSON server errors
async function safeJson(res){
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { _nonjson:true, text, status: res.status }; }
}

// admin header (only when on admin mode)
const qs = new URLSearchParams(location.search);
const isAdmin = qs.get("admin")==="1";
const adminHeaders = () => (
  isAdmin ? { 'x-az-admin-token': (localStorage.getItem('az-admin-token') || '').trim() } : {}
);

// ----- element refs -----
const els = {
  status: $("#status"),
  submitBox: $("#submitBox"),
  entriesBox: $("#entriesBox"),
  voteBox: $("#voteBox"),
  leaderBox: $("#leaderBox"),
  adminBox: $("#adminBox"),

  handle: $("#handle"),
  imgUrl: $("#imgUrl"),
  uploadFile: $("#uploadFile"),
  memeId: $("#memeId"),
  submitBtn: $("#submitBtn"),
  submitHint: $("#submitHint"),

  entriesCount: $("#entriesCount"),
  entriesGrid: $("#entriesGrid"),

  voterHandle: $("#voterHandle"),
  voteGrid: $("#voteGrid"),

  leaderGrid: $("#leaderGrid"),

  newTitle: $("#newTitle"),
  newCap: $("#newCap"),
  openBtn: $("#openBtn"),
  useContestId: $("#useContestId"),
  startVotingBtn: $("#startVotingBtn"),
  closeBtn: $("#closeBtn"),
};

function setContestIdField(id){
  const el = document.getElementById("useContestId");
  if (el) {
    el.value = id || "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

let active = null;
let entries = [];

init().catch(err=>console.error(err));

async function init(){
  if (isAdmin && els.adminBox) els.adminBox.style.display = "block";
  await refreshActive();
  wireEvents();
  if (active) await renderByStatus();
}

function wireEvents(){
  els.submitBtn?.addEventListener("click", onSubmit);
  els.openBtn?.addEventListener("click", onOpen);
  els.startVotingBtn?.addEventListener("click", onStartVoting);
  els.closeBtn?.addEventListener("click", onClose);

  els.uploadFile?.addEventListener("change", () => {
    if (els.uploadFile.files?.length) els.imgUrl.value = "";
  });
  els.imgUrl?.addEventListener("input", () => {
    if (els.imgUrl.value.trim()) els.uploadFile.value = "";
  });

  els.voteGrid?.addEventListener("click", async (e)=>{
    const btn = e.target.closest("button[data-entry]");
    if (!btn) return;

    const entry = btn.dataset.entry;
    const voter = (els.voterHandle.value || "").trim();
    if (!voter) { toast("Enter your @handle first"); return; }

    btn.disabled = true;
    try {
      const r = await fetch(contestUrl("vote"), {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ entry_id: entry, voter_handle: voter })
      });
      const j = await safeJson(r);

      if (!r.ok || j._nonjson) {
        toast(String(j?.error || j.text || "Vote failed")); return;
      }

      toast(j.duplicate ? "Already voted" : "Voted!");
      await renderLeaderboard();
    } catch (err) {
      toast(String(err));
    } finally {
      btn.disabled = false;
    }
  });
}

async function refreshActive(){
  const r = await fetch(contestUrl("active"));
  const j = await safeJson(r);
  if (!r.ok || j._nonjson) {
    toast(j.error || j.text || "Active API error"); return;
  }
  active = j.contest || null;
  if (els.status) els.status.innerHTML = renderStatus(active);
  if (active && els.useContestId) els.useContestId.value = active.id;
  setContestIdField(active ? active.id : "");
}

function renderStatus(c){
  if (!c) return `<div class="row"><div class="pill"><strong>No active contest</strong></div></div>`;
  const left = c.status === "open" ? `<span class="pill">Status: open</span>` :
              c.status === "voting" ? `<span class="pill">Status: voting</span>` :
              `<span class="pill">Status: ${c.status}</span>`;
  return `
    <div class="row">
      <div class="title" style="font-size:20px">${c.title}</div>
      <div style="flex:1"></div>
      ${left}
      <span class="pill">Cap: ${c.submission_cap}</span>
      <span class="muted">id: ${c.id}</span>
    </div>
  `;
}

async function renderByStatus(){
  if (!els.submitBox || !els.entriesBox || !els.voteBox || !els.leaderBox) return;

  els.submitBox.style.display = "none";
  els.entriesBox.style.display = "none";
  els.voteBox.style.display = "none";
  els.leaderBox.style.display = "none";

  entries = active ? await getEntries(active.id) : [];
  if (!active) return;

  if (active.status === "open"){
    els.submitBox.style.display = "block";
    els.entriesBox.style.display = "block";
    if (els.entriesCount) els.entriesCount.textContent = `(${entries.length}/${active.submission_cap})`;
    if (els.entriesGrid) els.entriesGrid.innerHTML = entries.map(entryTile).join("");
    if (els.submitHint) els.submitHint.textContent = `One entry per handle.`;

    const full = entries.length >= active.submission_cap;
    if (els.submitBtn) els.submitBtn.disabled = full;
    if (els.handle) els.handle.disabled = full;
    if (els.imgUrl) els.imgUrl.disabled = full;
    if (els.uploadFile) els.uploadFile.disabled = full;
    if (els.memeId) els.memeId.disabled = full;

    if (els.submitHint) els.submitHint.textContent = full
      ? "Submission cap reached — entries are closed."
      : "One entry per handle.";
  }
  else if (active.status === "voting"){
    els.voteBox.style.display = "block";
    if (els.voteGrid) els.voteGrid.innerHTML = entries.map(voteTile).join("");
    await renderLeaderboard();
  }
  else if (active.status === "closed"){
    await renderLeaderboard();
  }
}

async function getEntries(contest_id){
  const r = await fetch(contestUrl("entries", { contest_id }));
  const j = await safeJson(r);
  if (!r.ok || j._nonjson) { toast(j.error || j.text || "Entries API error"); return []; }
  return j.items || [];
}

function entryTile(e){
  const m = e.memes;
  return `
    <article class="tile">
      <img src="${m.img_url}" alt="entry by @${e.submitter_handle}">
      <div class="meta">
        <span class="muted">@${e.submitter_handle}</span>
        <code style="opacity:.7">${e.id.slice(0,8)}…</code>
      </div>
    </article>
  `;
}
function voteTile(e){
  const m = e.memes;
  return `
    <article class="tile">
      <img src="${m.img_url}" alt="entry by @${e.submitter_handle}">
      <div class="meta">
        <span class="muted">@${e.submitter_handle}</span>
        <button class="btn" data-entry="${e.id}">Vote</button>
      </div>
    </article>
  `;
}

async function renderLeaderboard(){
  if (!active) return;
  els.leaderBox.style.display = "block";
  const r = await fetch(contestUrl("leaderboard", { contest_id: active.id }));
  const j = await safeJson(r);
  if (!r.ok || j._nonjson) { toast(j.error || j.text || "Leaderboard API error"); return; }
  const items = j.items || [];
  if (els.leaderGrid) {
    els.leaderGrid.innerHTML = items.map((e,i)=>{
      const m = e.memes;
      return `
        <article class="tile">
          <img src="${m.img_url}" alt="entry by @${e.submitter_handle}">
          <div class="meta">
            <span>#${i+1} • @${e.submitter_handle}</span>
            <span class="muted">${e.votes} votes</span>
          </div>
        </article>
      `;
    }).join("");
  }
}

async function onSubmit(){
  if (!active) { toast("No open contest"); return; }
  if (entries.length >= active.submission_cap) {
    toast("Submission cap reached — entries are closed."); return;
  }

  let handle = (els.handle?.value || "").trim();
  const url  = (els.imgUrl?.value || "").trim();
  const file = els.uploadFile?.files?.[0] || null;

  if (!handle) { toast("Enter your @handle"); return; }
  if (!handle.startsWith("@")) handle = "@"+handle;
  if (!url && !file) { toast("Add an image URL or choose a file"); return; }

  els.submitBtn && (els.submitBtn.disabled = true);
  try {
    let finalUrl = url;

    if (file) {
      const MAX = 6 * 1024 * 1024; // 6MB consistent
      if (file.size > MAX) { toast("Image too large (max 6MB)"); return; }

      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, imageBase64: dataUrl })
      });
      const uj = await safeJson(up);
      if (!up.ok || uj._nonjson || !uj.ok) {
        toast(uj?.error || uj.text || "Upload failed"); return;
      }
      finalUrl = uj.url || uj.meme?.img_url;
      if (!finalUrl) { toast("Upload failed: no URL returned"); return; }
    }

    const r = await fetch(contestUrl("submit"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contest_id: active?.id, handle, imgUrl: finalUrl })
    });
    const j = await safeJson(r);
    if (!r.ok || j._nonjson) { toast(j?.error || j.text || "Submit failed"); return; }

    toast(j.duplicate ? "Already submitted" : "Submitted!");
    // reset
    if (els.handle) els.handle.value = "";
    if (els.imgUrl) els.imgUrl.value = "";
    if (els.uploadFile) els.uploadFile.value = "";
    await refreshActive();
    await renderByStatus();
  } finally {
    els.submitBtn && (els.submitBtn.disabled = false);
  }
}

async function onOpen(){
  const title = (els.newTitle?.value || "").trim();
  const cap   = Number(els.newCap?.value || 10);
  if (!title) { toast("title required"); return; }

  const r = await fetch(contestUrl("open"), {
    method: "POST",
    headers: { "content-type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ title, submission_cap: cap })
  });
  const j = await safeJson(r);
  if (!r.ok || j._nonjson){ toast(j.error || j.text || "Open failed"); return; }

  toast("Contest opened");
  if (els.newTitle) els.newTitle.value = "";
  if (els.newCap) els.newCap.value = "";

  await refreshActive();
  if (j.contest?.id) setContestIdField(j.contest.id);
}

async function getActiveId() {
  if (active?.id) return active.id;
  try {
    const r = await fetch(contestUrl("active"));
    const j = await safeJson(r);
    if (!r.ok || j._nonjson) return "";
    if (j?.contest?.id) {
      active = j.contest;
      const f = document.getElementById('useContestId');
      if (f) f.value = active.id;
      return active.id;
    }
  } catch {}
  return "";
}

async function onStartVoting() {
  const id = await getActiveId();
  if (!id) { toast("No active contest id"); return; }

  const r = await fetch(contestUrl("start-voting"), {
    method: "POST",
    headers: { "content-type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ contest_id: id })
  });
  const j = await safeJson(r);
  if (!r.ok || j._nonjson) { toast(j.error || j.text || "Failed"); return; }
  toast("Voting started");
  await refreshActive(); await renderByStatus();
}

async function onClose() {
  const id = await getActiveId();
  if (!id) { toast("No active contest id"); return; }

  const r = await fetch(contestUrl("close"), {
    method: "POST",
    headers: { "content-type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ contest_id: id })
  });
  const j = await safeJson(r);
  if (!r.ok || j._nonjson) { toast(j.error || j.text || "Close failed"); return; }
  toast("Closed. Winner picked!");
  await refreshActive(); await renderByStatus();
}