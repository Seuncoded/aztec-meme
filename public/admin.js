
(function () {
  const $ = (s, r=document) => r.querySelector(s);


  const tokenInput      = $('#tokenInput');
  const saveTokenBtn    = $('#saveTokenBtn');
  const checkBtn        = $('#checkBtn');
  const titleInput      = $('#titleInput');
  const capInput        = $('#capInput');
  const openBtn         = $('#openBtn');
  const startVotingBtn  = $('#startVotingBtn');
  const closeBtn        = $('#closeBtn');

  const activeTitle = $('#activeTitle');
  const activeStatus= $('#activeStatus');
  const activeCap   = $('#activeCap');
  const contestIdEl = $('#contestId');
  const resultBox   = $('#resultBox');

  function say(x){ resultBox.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2); }

  function saveToken() {
    const v = (tokenInput.value || '').trim();
    localStorage.setItem('az-admin-token', v);
    say(`Token saved (${v.slice(0,6)}…${v.slice(-4)})`);
  }


  const _fetch = window.fetch;
  window.fetch = function(url, opts={}) {
    const u = String(url);
    const m = (opts.method || 'GET').toUpperCase();
    if (u.startsWith('/api/contest') && m === 'POST') {
      const t = localStorage.getItem('az-admin-token') || '';
      opts.headers = Object.assign({}, opts.headers, { 'x-az-admin-token': t });
    }
    return _fetch(url, opts);
  };

  async function jsonOrText(r){
    const text = await r.text();
    try { return { ok:r.ok, data: JSON.parse(text) }; }
    catch { return { ok:r.ok, data: { error: text.slice(0,200) } }; }
  }

  async function refresh() {
    const r = await fetch('/api/contest/active', { cache:'no-store' });
    const { ok, data } = await jsonOrText(r);
    if (!ok) { say(data); return; }
    const c = data.contest;
    if (!c) {
      activeTitle.textContent = 'No active contest';
      activeStatus.textContent = '—';
      activeCap.textContent    = '—';
      contestIdEl.value = '';
      say('Ready.');
      return;
    }
    activeTitle.textContent  = c.title || '(untitled)';
    activeStatus.textContent = c.status;
    activeCap.textContent    = c.submission_cap ?? '—';
    contestIdEl.value        = c.id || '';
    say({ contest: c });
  }

  async function call(action, body) {
    const r = await fetch(`/api/contest/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return jsonOrText(r);
  }

 
  saveTokenBtn.addEventListener('click', saveToken);
  checkBtn.addEventListener('click', refresh);

  openBtn.addEventListener('click', async ()=>{
    openBtn.disabled = true;
    const title = (titleInput.value || '').trim();
    const cap = Number(capInput.value || 10);
    const { ok, data } = await call('open', { title, submission_cap: cap });
    say(data);
    await refresh();
    openBtn.disabled = false;
  });

  startVotingBtn.addEventListener('click', async ()=>{
    startVotingBtn.disabled = true;
    const id = contestIdEl.value;
    const { ok, data } = await call('start-voting', { contest_id: id });
    say(data);
    await refresh();
    startVotingBtn.disabled = false;
  });

  closeBtn.addEventListener('click', async ()=>{
    closeBtn.disabled = true;
    const id = contestIdEl.value;
    const { ok, data } = await call('close', { contest_id: id });
    say(data);
    await refresh();
    closeBtn.disabled = false;
  });

  
  tokenInput.value = localStorage.getItem('az-admin-token') || '';
  refresh();
})();
