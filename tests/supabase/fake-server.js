// The test's side of fake-client.js: runs each query on the in-memory Postgres as the signed-in account (so row level
// security applies exactly as on Supabase) and sends a live-update message to every open page after each change.
const { as } = require('./db');

const PK = { classes: 'id', people: 'email', shared: 'id', calendars: 'token' };
const RPC_TABLE = { class_patch: 'classes', shared_put: 'shared', shared_reply: 'shared', shared_seen: 'shared' };

// The files themselves, shared by every test device (the database only keeps who may see them, like Supabase Storage).
const blobs = new Map();

async function attach(context, db) {
  const cols = {}, fns = {};
  for (const r of (await db.query("select table_name t, column_name c, udt_name u from information_schema.columns where table_schema = 'public'")).rows)
    (cols[r.t] = cols[r.t] || {})[r.c] = r.u;
  for (const r of (await db.query(`select p.proname n, p.proargnames a,
      (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) ty
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`)).rows)
    fns[r.n] = (r.a || []).map((a, i) => [a, r.ty[i]]);

  const arrLit = (a) => '{' + a.map((x) => '"' + String(x).replace(/["\\]/g, '\\$&') + '"').join(',') + '}';
  const val = (type, v) => (v === null || v === undefined ? null : /^(jsonb?)$/.test(type) ? JSON.stringify(v)
    : /^_|\[\]$/.test(type) ? arrLit(v) : String(v));
  const cast = (u) => (u.startsWith('_') ? u.slice(1) + '[]' : u);
  const clean = (row) => { for (const k in row) if (row[k] instanceof Date) row[k] = row[k].toISOString(); return row; };
  const name = (s) => { if (!/^[a-z_]+$/.test(s)) throw new Error('bad name ' + s); return s; };

  async function storage(user, op) {
    if (op.op === 'upload') {
      await as(db, user, 'insert into storage.objects (bucket_id, name) values ($1, $2)', [op.bucket, op.path]);
      blobs.set(op.bucket + '/' + op.path, op.dataUrl);
      return { data: { path: op.path } };
    }
    if (op.op === 'sign') {
      const r = await as(db, user, 'select name from storage.objects where bucket_id = $1 and name = $2', [op.bucket, op.path]);
      if (!r.rows.length) throw new Error('Object not found');
      return { data: { signedUrl: 'https://files.test/' + op.bucket + '/' + op.path } };
    }
    if (op.op === 'remove') {
      const r = await as(db, user, 'delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [op.bucket, '{' + op.paths.map((x) => '"' + x + '"').join(',') + '}']);
      r.rows.forEach((x) => blobs.delete(op.bucket + '/' + x.name));
      return { data: r.rows };
    }
    throw new Error('storage op ' + op.op);
  }

  async function run(user, op) {
    if (op.kind === 'storage') return storage(user, op);
    if (op.kind === 'rpc') {
      const sig = fns[name(op.fn)]; if (!sig) throw new Error('no function ' + op.fn);
      const params = sig.map(([a, t]) => val(t, op.args[a]));
      const r = await as(db, user, `select public.${op.fn}(${sig.map(([a, t], i) => `${a} => $${i + 1}::${t}`).join(', ')}) as r`, params);
      return { data: r.rows[0].r, changed: RPC_TABLE[op.fn] && { table: RPC_TABLE[op.fn], key: op.args.p_id } };
    }
    const t = name(op.table), types = cols[t];
    const params = [];
    const where = op.filters.map(([c, v]) => { params.push(val(types[name(c)], v)); return `${c} = $${params.length}::${cast(types[c])}`; });
    const wsql = where.length ? ' where ' + where.join(' and ') : '';
    if (op.kind === 'select') {
      if (!/^[\w, *]+$/.test(op.cols)) throw new Error('bad columns');
      const r = await as(db, user, `select ${op.cols} from public.${t}${wsql}`, params);
      const rows = r.rows.map(clean);
      return { data: op.single ? rows[0] || null : rows };
    }
    if (op.kind === 'delete') { await as(db, user, `delete from public.${t}${wsql}`, params); return { data: null, changed: { table: t, key: op.filters[0] && op.filters[0][1] } }; }
    const keys = Object.keys(op.row).map(name);
    const vals = keys.map((k) => { params.push(val(types[k], op.row[k])); return `$${params.length}::${cast(types[k])}`; });
    let sql = `insert into public.${t} (${keys.join(', ')}) values (${vals.join(', ')})`;
    if (op.kind === 'upsert') sql += ` on conflict (${PK[t]}) do update set ` + keys.filter((k) => k !== PK[t]).map((k) => `${k} = excluded.${k}`).join(', ');
    await as(db, user, sql, params);
    return { data: null, changed: { table: t, key: op.row[PK[t]] } };
  }

  await context.exposeBinding('__pg', async (source, user, op) => {
    try {
      const r = await run(user, op);
      if (r.changed) {
        const ev = { table: r.changed.table, eventType: 'UPDATE', new: { [PK[r.changed.table]]: r.changed.key } };
        for (const p of context.browser().contexts().flatMap((c) => c.pages())) p.evaluate((e) => window.__rtEmit && window.__rtEmit(e), ev).catch(() => {});
      }
      return { data: r.data === undefined ? null : r.data, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  });
  // Signed links: served from the shared file store, like Supabase's own file links.
  await context.route('https://files.test/**', (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const d = blobs.get(key);
    if (!d) return route.fulfill({ status: 404, body: 'not found' });
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(d);
    route.fulfill({ status: 200, contentType: m[1] || 'application/octet-stream', body: Buffer.from(m[3], m[2] ? 'base64' : 'utf8') });
  });
  await context.addInitScript({ path: require('node:path').join(__dirname, 'fake-client.js') });
}

module.exports = { attach };
