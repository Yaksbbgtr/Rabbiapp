// Stand-in for supabase-js inside the test browser. Every query goes to the test's in-memory Postgres (with the real
// schema and row level security) through window.__pg, run as the signed-in test account. Live updates are sent by the
// test after each change, like Supabase Realtime. Only the parts of supabase-js that js/sync.js uses are here.
(function () {
  window.REBBI_SYNC_CONFIG = { url: 'https://test.supabase.co', key: 'test-key' };
  var SESSION = 'fake.session';
  function session() { try { return JSON.parse(localStorage.getItem(SESSION)); } catch (e) { return null; } }
  var authCbs = [], channels = [];
  function fire(ev) { var s = session(); authCbs.forEach(function (cb) { cb(ev, s); }); }
  function call(op) {
    if (navigator.onLine === false) return Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    var s = session();
    return window.__pg(s ? s.user : null, op);
  }
  function builder(table) {
    var op = { table: table, kind: 'select', cols: '*', filters: [], single: false };
    var b = {
      select: function (cols) { if (op.kind === 'select') op.cols = cols || '*'; return b; },
      eq: function (c, v) { op.filters.push([c, v]); return b; },
      maybeSingle: function () { op.single = true; return b; },
      insert: function (row) { op.kind = 'insert'; op.row = row; return b; },
      upsert: function (row) { op.kind = 'upsert'; op.row = row; return b; },
      update: function (row) { op.kind = 'update'; op.row = row; return b; },
      delete: function () { op.kind = 'delete'; return b; },
      then: function (ok, fail) { return call(op).then(ok, fail); }
    };
    return b;
  }
  window.supabase = { createClient: function () {
    return {
      auth: {
        onAuthStateChange: function (cb) { authCbs.push(cb); setTimeout(function () { cb('INITIAL_SESSION', session()); }, 0); return { data: { subscription: { unsubscribe: function () {} } } }; },
        getSession: function () { return Promise.resolve({ data: { session: session() }, error: null }); },
        signInWithOAuth: function () {
          var u = JSON.parse(localStorage.getItem('fake.account') || 'null');
          if (!u) return Promise.resolve({ data: null, error: { message: 'no test account' } });
          localStorage.setItem(SESSION, JSON.stringify({ user: u, access_token: 'tok-' + u.id }));
          setTimeout(function () { fire('SIGNED_IN'); }, 0);
          return Promise.resolve({ data: {}, error: null });
        },
        signOut: function () { localStorage.removeItem(SESSION); setTimeout(function () { fire('SIGNED_OUT'); }, 0); return Promise.resolve({ error: null }); }
      },
      from: builder,
      storage: { from: function (bucket) {
        var st = function (op) { return { then: function (ok, fail) { return call(Object.assign({ kind: 'storage', bucket: bucket }, op)).then(ok, fail); } }; };
        return {
          upload: function (path, file, o) {
            return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.readAsDataURL(file); })
              .then(function (dataUrl) { return call({ kind: 'storage', bucket: bucket, op: 'upload', path: path, dataUrl: dataUrl }); });
          },
          createSignedUrl: function (path) { return st({ op: 'sign', path: path }); },
          remove: function (paths) { return st({ op: 'remove', paths: paths }); }
        };
      } },
      rpc: function (name, args) { return { then: function (ok, fail) { return call({ kind: 'rpc', fn: name, args: args || {} }).then(ok, fail); } }; },
      channel: function () {
        var ch = { handlers: [], on: function (type, filter, cb) { ch.handlers.push([filter.table, cb]); return ch; },
          subscribe: function (cb) { channels.push(ch); setTimeout(function () { cb && cb('SUBSCRIBED'); }, 0); return ch; } };
        return ch;
      },
      removeChannel: function (ch) { channels = channels.filter(function (c) { return c !== ch; }); return Promise.resolve(); }
    };
  } };
  window.__rtEmit = function (ev) {
    if (navigator.onLine === false) return;
    channels.forEach(function (ch) { ch.handlers.forEach(function (h) { if (h[0] === ev.table) h[1](ev); }); });
  };
})();
