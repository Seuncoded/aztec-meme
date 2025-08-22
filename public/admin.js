// public/admin.js
(() => {
  const $ = s => document.querySelector(s);

  const els = {
    token: $('#adminToken'),
    save: $('#saveTokenBtn'),

    statusDot: $('#statusDot'),
    capDot: $('#capDot'),
    activeId: $('#activeContestId'),
    check: $('#checkStatusBtn'),

    title: $('#newTitle'),
    cap: $('#newCap'),
    open: $('#openBtn'),

    start: $('#startVotingBtn'),
    close: $('#closeBtn'),

    log: $('#adminStatus'),
  };

  function log(x){ if(els.log) els.log.textContent = typeof x==='string'?x:JSON.stringify(x,null,2); }

  // Always add admin header for POSTs to /api/contest
  const _fetch = window.fetch;
  window.fetch = function(url, opts={}) {
    const isContestPost = String(url).includes('/api/contest') && (opts.method||'GET').toUpperCase()==='POST';
    if (isContestPost) {
      const t = localStorage.getItem('az-admin-token') || '';
      opts.headers = Object.assign({}, opts.headers, {'x-az-admin-token': t});
    }
    return _fetch(url, opts);
  };

  // Wire buttons
  els.save?.addEventListener('click', () => {
    const v = (els.token?.value||'').trim();
    if(!v){ log('No token entered'); return; }
    localStorage.setItem('az-admin-token', v);
    log(`Token saved (${v.slice(0,6)}…${v.slice(-4)})`);
  });

  els.check?.addEventListener('click', async () => {
    try{
      const r = await fetch('/api/contest/active', { cache:'no-store' });
      const j = await r.json();
      if(!r.ok){ log(j); return; }
      const c = j.contest;
      els.activeId.value = c?.id || '';
      els.statusDot.textContent = 'status: ' + (c?.status || '—');
      els.capDot.textContent = 'cap: ' + (c?.submission_cap ?? '—');
      log(j);
    }catch(e){ log(String(e)); }
  });

  els.open?.addEventListener('click', async () => {
    const title = (els.title?.value||'').trim();
    const cap = Number(els.cap?.value || 10);
    if(!title){ log('title required'); return; }
    try{
      const r = await fetch('/api/contest/open', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ title, submission_cap: cap })
      });
      const j = await r.json();
      log(j);
      if(r.ok){
        els.title.value=''; els.cap.value='';
        els.activeId.value = j.contest?.id || '';
        els.statusDot.textContent = 'status: ' + (j.contest?.status || 'open');
        els.capDot.textContent = 'cap: ' + (j.contest?.submission_cap ?? cap);
      }
    }catch(e){ log(String(e)); }
  });

  els.start?.addEventListener('click', async () => {
    const id = (els.activeId?.value||'').trim();
    if(!id){ log('No active contest id'); return; }
    try{
      const r = await fetch('/api/contest/start-voting', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ contest_id: id })
      });
      const j = await r.json(); log(j);
      if(r.ok){ els.statusDot.textContent = 'status: voting'; }
    }catch(e){ log(String(e)); }
  });

  els.close?.addEventListener('click', async () => {
    const id = (els.activeId?.value||'').trim();
    if(!id){ log('No active contest id'); return; }
    try{
      const r = await fetch('/api/contest/close', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ contest_id: id })
      });
      const j = await r.json(); log(j);
      if(r.ok){ els.statusDot.textContent = 'status: closed'; }
    }catch(e){ log(String(e)); }
  });

  // Pre-fill token if present
  const t = localStorage.getItem('az-admin-token');
  if (t && els.token) els.token.value = t;
  log('Ready.');
})();