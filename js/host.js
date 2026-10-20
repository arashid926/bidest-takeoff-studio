/* ==========================================================================
   BidEst host layer — standalone edition
   --------------------------------------------------------------------------
   The studio was first built as a claude.ai artifact, which supplied three
   services through `claude.use(name)`:  'db', 'downloads' and 'assets'.
   This file provides the same three services inside any browser, so the app
   runs from GitHub Pages, a USB stick or a local folder:

     db        -> IndexedDB document store (projects, templates, rate library)
     downloads -> a normal browser file download
     assets    -> drawing files (PDF / DXF) kept in IndexedDB, served to the
                  app through the same '/_blob/<id>' address it already uses

   Everything stays on this computer, in this browser. Use
   BidEstHost.backup() / BidEstHost.restore() (buttons in the Projects
   window) to move work between machines or keep a safety copy.
   ========================================================================== */
(function () {
  'use strict';

  const DB_NAME = 'bidest-takeoff-studio';
  const DB_VER = 1;
  let dbp = null;

  function openIDB() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(err('unavailable', 'This browser has no IndexedDB.')); return; }
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs');   // key: "collection/id"
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); // key: asset id
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(err('blocked', 'Close other BidEst tabs and reload.'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function err(code, message) { const e = new Error(message); e.code = code; return e; }
  function tx(store, mode, fn) {
    return openIDB().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      fn(t.objectStore(store));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error && t.error.name === 'QuotaExceededError'
        ? err('quota_or_state', 'Browser storage is full.') : t.error);
      t.onabort = () => reject(t.error || err('aborted', 'Storage write was cancelled.'));
    }));
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const newId = p => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

  /* ---------------- db: a small Firestore-style document API ---------------- */
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      async get() {
        const v = await openIDB().then(d => reqP(d.transaction('docs').objectStore('docs').get(path)));
        return { id: path.split('/').pop(), exists: v !== undefined, data: () => clone(v) };
      },
      async set(data, opts) {
        let val = clone(data);
        if (opts && opts.merge) {
          const cur = await this.get();
          if (cur.exists) val = Object.assign(cur.data(), val);
        }
        await tx('docs', 'readwrite', s => { s.put(val, path); });
      },
      async update(data) { return this.set(data, { merge: true }); },
      async delete() { await tx('docs', 'readwrite', s => { s.delete(path); }); }
    };
  }
  function query(coll, order, lim) {
    return {
      orderBy(field, dir) { return query(coll, { field, dir: dir || 'asc' }, lim); },
      limit(n) { return query(coll, order, n); },
      async get() {
        const d = await openIDB();
        const pre = coll + '/';
        const range = IDBKeyRange.bound(pre, pre + '￿');
        const store = d.transaction('docs').objectStore('docs');
        const [keys, vals] = await Promise.all([reqP(store.getAllKeys(range)), reqP(store.getAll(range))]);
        let docs = keys.map((k, i) => ({ id: String(k).slice(pre.length), _v: vals[i] }))
          .filter(x => x.id.indexOf('/') < 0);
        if (order) {
          const f = order.field, m = order.dir === 'desc' ? -1 : 1;
          docs.sort((a, b) => {
            const x = a._v && a._v[f], y = b._v && b._v[f];
            return (x > y ? 1 : x < y ? -1 : 0) * m;
          });
        }
        if (lim) docs = docs.slice(0, lim);
        return {
          size: docs.length, empty: !docs.length,
          docs: docs.map(x => ({ id: x.id, exists: true, data: () => clone(x._v) }))
        };
      }
    };
  }
  const dbService = {
    doc: path => docRef(path),
    collection: name => Object.assign(query(name), {
      doc: id => docRef(name + '/' + (id || newId())),
      async add(data) { const r = docRef(name + '/' + newId()); await r.set(data); return r; }
    })
  };

  /* ---------------- downloads ---------------- */
  const downloadsService = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { filename };
    }
  };

  /* ---------------- assets (drawing files) ---------------- */
  const MAX_ASSET = 200 * 1024 * 1024;
  const assetsService = {
    async upload(blob, opts) {
      if (blob.size > MAX_ASSET) throw err('too_large', 'File is too large to store.');
      const id = newId('a');
      const type = (opts && opts.type) || blob.type || 'application/octet-stream';
      const buf = await blob.arrayBuffer();
      await tx('blobs', 'readwrite', s => { s.put({ type, buf, name: blob.name || '', at: Date.now() }, id); });
      return { id, url: '/_blob/' + id };
    },
    async delete(id) { await tx('blobs', 'readwrite', s => { s.delete(id); }); },
    async get(id) { return openIDB().then(d => reqP(d.transaction('blobs').objectStore('blobs').get(id))); }
  };

  /* The app reads stored drawings with fetch('/_blob/<id>'); answer that here. */
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^(?:https?:\/\/[^/]+)?\/_blob\/([^/?#]+)/.exec(u);
    if (m && (typeof input === 'string' ? input.startsWith('/_blob/') : true)) {
      return assetsService.get(decodeURIComponent(m[1])).then(rec =>
        rec ? new Response(rec.buf, { status: 200, headers: { 'Content-Type': rec.type } })
            : new Response('Not found', { status: 404 }));
    }
    return realFetch(input, init);
  };

  /* ---------------- the `claude.use()` entry point the app expects ---------------- */
  const services = { db: dbService, downloads: downloadsService, assets: assetsService };
  window.claude = {
    async use(name) {
      if (!services[name]) throw err('unknown_capability', 'Not available: ' + name);
      await openIDB();               // fail early (e.g. private mode) so the app falls back cleanly
      return services[name];
    }
  };

  /* ---------------- backup & restore ---------------- */
  function bufToB64(buf) {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBuf(s) {
    const bin = atob(s), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  }
  async function backup(withDrawings) {
    const d = await openIDB();
    const ds = d.transaction('docs').objectStore('docs');
    const [dk, dv] = await Promise.all([reqP(ds.getAllKeys()), reqP(ds.getAll())]);
    const out = { app: 'BidEst Take-Off Studio', format: 1, exported: new Date().toISOString(),
      docs: dk.map((k, i) => ({ path: k, data: dv[i] })), blobs: [] };
    if (withDrawings !== false) {
      const bs = d.transaction('blobs').objectStore('blobs');
      const [bk, bv] = await Promise.all([reqP(bs.getAllKeys()), reqP(bs.getAll())]);
      out.blobs = bk.map((k, i) => ({ id: k, type: bv[i].type, name: bv[i].name, data: bufToB64(bv[i].buf) }));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await downloadsService.save({ filename: 'BidEst_backup_' + stamp + '.json',
      data: new Blob([JSON.stringify(out)], { type: 'application/json' }) });
    return { projects: out.docs.length, drawings: out.blobs.length };
  }
  function pickFile(accept) {
    return new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept;
      i.onchange = () => res(i.files && i.files[0]);
      i.click();
    });
  }
  async function restore(file) {
    file = file || await pickFile('.json,application/json');
    if (!file) return null;
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.docs)) throw err('bad_file', 'That is not a BidEst backup file.');
    await tx('docs', 'readwrite', s => { obj.docs.forEach(x => s.put(x.data, x.path)); });
    if (Array.isArray(obj.blobs) && obj.blobs.length) {
      await tx('blobs', 'readwrite', s => {
        obj.blobs.forEach(x => s.put({ type: x.type, name: x.name || '', buf: b64ToBuf(x.data), at: Date.now() }, x.id));
      });
    }
    return { projects: obj.docs.length, drawings: (obj.blobs || []).length };
  }

  window.BidEstHost = { backup, restore, standalone: true };

  /* Ask the browser not to clear this site's storage under pressure. */
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }
})();
