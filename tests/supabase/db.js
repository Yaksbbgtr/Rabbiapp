// A throwaway Postgres (PGlite, in memory) set up like a Supabase project: auth.uid() / auth.jwt(), the anon and
// authenticated roles and the supabase_realtime publication. Then schema.sql is loaded exactly as in the dashboard.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const SUPABASE_BASICS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
create publication supabase_realtime;
`;

async function makeDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_BASICS);
  await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/schema.sql'), 'utf8'));
  await db.exec('grant all on all tables in schema public to service_role;');
  return db;
}

// Runs one query as a signed-in user (or anon when user is null), the way PostgREST does.
let n = 0;
async function as(db, user, sql, params) {
  const claims = user ? { sub: user.id, email: user.email, role: 'authenticated',
    app_metadata: { provider: user.provider || 'google', providers: [user.provider || 'google'] } } : { role: 'anon' };
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec('set local role ' + (user ? 'authenticated' : 'anon'));
    return tx.query(sql, params || []);
  });
}
const user = (name, extra) => Object.assign({ id: '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), email: name + '@example.com' }, extra);

module.exports = { makeDb, as, user };
