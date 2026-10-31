// Works out the mode, loads the published records, and draws
// the strip at the top of the page (figures date for viewers, Publish button for the publisher).
//
//   standalone  page opened directly as a file: behaves exactly as the original pages did
//   viewer      the normal link: published figures, nothing can be changed
//   publisher   the link with ?publisher: upload and edit, then Publish for everyone
window.PPC = (function () {
  const KEY_STORE = 'ppc_publisher_key';
  const SET_NAMES = { stock: 'Stock and dispatch' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  const api = {
    mode: location.protocol === 'file:' ? 'standalone' : (new URLSearchParams(location.search).has('publisher') ? 'publisher' : 'viewer'),
    published: null,     // what the server returned, or null
    unreachable: false,  // true when the figures could not be fetched
    start, mountBar, keepFiles, ready
  };

  const css = document.createElement('style');
  css.textContent = `
    html.ppc-loading body{visibility:hidden}
    .ppc-viewer .ppc-pub-only,.ppc-viewer [data-edit],.ppc-viewer [data-del],.ppc-viewer .ed-btn,.ppc-viewer #liTableBody button[data-rm]{display:none!important}
    .ppc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:8px 16px;font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#eef1f4;color:#3c434a;border-bottom:1px solid #d9dde1}
    .ppc-bar.pub{background:#fff6e0;border-bottom-color:#e8d49a;color:#4f3f12;position:sticky;top:0;z-index:50}
    .ppc-bar.warn{background:#fdecec;border-bottom-color:#f0c4c4;color:#7a2020}
    .ppc-bar b{font-weight:600}
    .ppc-bar .ppc-grow{flex:1 1 auto;min-width:0}
    .ppc-bar button{font:inherit;font-weight:600;padding:6px 14px;border-radius:6px;border:1px solid #2a78d6;background:#2a78d6;color:#fff;cursor:pointer;min-height:32px}
    .ppc-bar button.plain{background:transparent;color:#4f3f12;border-color:#c8b271}
    .ppc-bar button[hidden]{display:none}
    .ppc-bar button[disabled]{background:#c9ced3;border-color:#c9ced3;cursor:default}
    .ppc-bar a{color:inherit}
    @media (prefers-color-scheme:dark){
      .ppc-bar{background:#1b2025;color:#b9c0c7;border-bottom-color:#30363c}
      .ppc-bar.pub{background:#3a2f12;border-bottom-color:#5c4b1d;color:#f0e0b0}
      .ppc-bar.warn{background:#3d1a1a;border-bottom-color:#5e2a2a;color:#f3c4c4}
      .ppc-bar button.plain{color:#f0e0b0;border-color:#7d6a33}
      .ppc-bar button[disabled]{background:#3a4047;border-color:#3a4047;color:#8a9199}
    }`;
  document.head.appendChild(css);
  if (api.mode !== 'standalone') document.documentElement.classList.add('ppc-loading');
  const loadingGuard = setTimeout(ready, 8000);

  function ready() {
    clearTimeout(loadingGuard);
    document.documentElement.classList.remove('ppc-loading');
  }

  async function fetchWithin(url, opts, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({ signal: ctl.signal, cache: 'no-store' }, opts)); }
    finally { clearTimeout(t); }
  }

  async function checkKey(key) {
    try {
      const r = await fetchWithin('/api/verify', { method: 'POST', headers: { 'x-publish-key': key } }, 8000);
      return r.ok ? 'ok' : r.status === 401 ? 'wrong' : 'error';
    } catch (e) { return 'error'; }
  }

  async function signIn() {
    let key = store.get(KEY_STORE), askedFor = false;
    if (!key) { key = window.prompt('Enter the publisher key:'); askedFor = true; }
    if (!key) return false;
    const res = await checkKey(key);
    if (res === 'ok') { store.set(KEY_STORE, key); return true; }
    if (res === 'wrong') { store.del(KEY_STORE); window.alert('That publisher key is not correct. The page will open for viewing only.'); return false; }
    if (askedFor) store.set(KEY_STORE, key);
    return true; // server unreachable: keep working on the draft; Publish will report the problem
  }

  // Resolves with the published data sets, or null when there are none to use.
  async function start() {
    if (api.mode === 'standalone') return null;
    if (api.mode === 'publisher' && !(await signIn())) api.mode = 'viewer';
    document.documentElement.classList.add('ppc-' + api.mode);
    try {
      const r = await fetchWithin('/api/data', {}, 15000);
      if (!r.ok) throw new Error('status ' + r.status);
      api.published = await r.json();
    } catch (e) { api.unreachable = true; api.published = null; }
    return api.published;
  }

  // Keeps a copy of the workbooks the publisher uploads. A failure here never blocks the upload.
  function keepFiles(files, set) {
    if (api.mode !== 'publisher') return;
    [...files].forEach(f => {
      fetch(`/api/files?set=${encodeURIComponent(set)}&name=${encodeURIComponent(f.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-publish-key': store.get(KEY_STORE) || '' }, body: f
      }).catch(() => {});
    });
  }

  const when = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  function latest(setIds) {
    const stamps = setIds.map(s => api.published && api.published[s] && api.published[s].publishedAt).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }

  function mountBar(cfg) {
    if (api.mode === 'standalone') return;
    const bar = document.createElement('div');
    bar.className = 'ppc-bar';
    document.body.insertBefore(bar, document.body.firstChild);
    const ids = cfg.sets.map(s => s.id);

    if (api.mode === 'viewer') {
      const at = latest(ids);
      if (api.unreachable) { bar.classList.add('warn'); bar.textContent = 'The latest figures could not be loaded. Check the connection and reload.'; }
      else bar.innerHTML = at ? `<span>Figures as of <b>${when(at)}</b></span>` : '<span>No figures have been published yet.</span>';
      return;
    }

    bar.classList.add('pub');
    bar.innerHTML = '<span class="ppc-grow"><b>Publisher mode.</b> <span id="ppcState"></span></span>' +
      (cfg.discard ? '<button type="button" id="ppcDiscard" class="plain">Discard changes</button>' : '') + '<button type="button" id="ppcPublish">Publish</button>';
    const state = bar.querySelector('#ppcState'), btn = bar.querySelector('#ppcPublish'), discard = bar.querySelector('#ppcDiscard');
    let busy = false, note = '', noteFailed = false, noteTimer = null;
    if (discard) discard.addEventListener('click', () => { if (window.confirm('Discard your unpublished changes and go back to the published figures?')) cfg.discard(); });

    const baseKey = id => 'ppc_base_' + id;
    const curRev = id => (api.published && api.published[id] ? api.published[id].rev : 0);
    cfg.sets.forEach(s => { if (!s.dirty() || store.get(baseKey(s.id)) === null) store.set(baseKey(s.id), String(curRev(s.id))); });

    function paint() {
      if (busy) return;
      const dirty = cfg.sets.filter(s => s.dirty());
      btn.disabled = !dirty.length;
      if (discard) discard.hidden = !dirty.length;
      const at = latest(ids);
      const pub = at ? `Last published ${when(at)}.` : 'Nothing published yet.';
      if (dirty.length && !noteFailed) note = '';
      state.textContent = note || (dirty.length ? `Not yet published: ${dirty.map(s => SET_NAMES[s.id]).join(', ')}. Only you can see these changes.` : `${pub} No unpublished changes.`);
    }

    async function send(s, force) {
      const body = JSON.stringify({ data: s.payload(), source: s.source(), baseRev: +store.get(baseKey(s.id)) || 0, force: !!force });
      return fetch('/api/data/' + s.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-publish-key': store.get(KEY_STORE) || '' }, body });
    }

    btn.addEventListener('click', async () => {
      const dirty = cfg.sets.filter(s => s.dirty());
      if (!dirty.length) return;
      if (!window.confirm(`Publish ${dirty.map(s => SET_NAMES[s.id]).join(', ')} for everyone?`)) return;
      busy = true; btn.disabled = true; state.textContent = 'Publishing…';
      const done = [], failed = [];
      for (const s of dirty) {
        try {
          let r = await send(s);
          if (r.status === 409 && window.confirm(`${SET_NAMES[s.id]} was published again since you started these changes. Replace that version with yours?`)) r = await send(s, true);
          if (r.status === 409) { failed.push(`${SET_NAMES[s.id]} (a newer version exists; discard your changes and reload to see it)`); continue; }
          const out = await r.json().catch(() => ({}));
          if (!r.ok) { failed.push(`${SET_NAMES[s.id]}: ${out.error || 'could not be saved'}`); continue; }
          api.published = api.published || {};
          api.published[s.id] = { rev: out.rev, publishedAt: out.publishedAt, source: s.source(), data: s.payload() };
          store.set(baseKey(s.id), String(out.rev));
          s.onPublished(api.published[s.id]);
          done.push(SET_NAMES[s.id]);
        } catch (e) { failed.push(`${SET_NAMES[s.id]}: the server could not be reached`); }
      }
      busy = false;
      noteFailed = failed.length > 0;
      note = noteFailed ? `Not published: ${failed.join('; ')}.${done.length ? ' Published: ' + done.join(', ') + '.' : ''}` : `Published ${done.join(', ')}. Everyone now sees these figures.`;
      paint();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { note = ''; noteFailed = false; paint(); }, 12000);
    });

    paint();
    setInterval(paint, 1000);
  }

  return api;
})();
