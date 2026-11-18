const test = require('node:test');
const assert = require('node:assert');
const { makeDb, as, user } = require('./db');

const rebbiA = user('rebbia'), rebbiB = user('rebbib'), office = user('office'), stranger = user('stranger'),
  faker = user('office', { provider: 'email' }); // same address, not via Google
const rows = async (p) => (await p).rows;
const fails = async (p, re) => { await assert.rejects(p, re); };

let db;
test.before(async () => {
  db = await makeDb();
  await db.query("insert into public.admins values ('office@example.com')");
});

test('a rebbi uploads a class and only he (and the office) can see it', async () => {
  await as(db, rebbiA, "insert into public.classes (id, owner_email, name, data) values ('c1', 'rebbia@example.com', 'A', '{\"lessons\":\"[]\"}')");
  assert.strictEqual((await rows(as(db, rebbiA, 'select id from public.classes'))).length, 1);
  assert.strictEqual((await rows(as(db, rebbiB, 'select id from public.classes'))).length, 0);
  assert.strictEqual((await rows(as(db, office, 'select id from public.classes'))).length, 1);
  assert.strictEqual((await rows(as(db, faker, 'select id from public.classes'))).length, 0, 'email sign-up with the office address');
  assert.strictEqual((await rows(as(db, null, 'select id from public.classes').catch(() => ({ rows: [] })))).length, 0);
});

test('nobody can put a class in someone else\'s name or take one', async () => {
  await fails(as(db, rebbiB, "insert into public.classes (id, owner) values ('c2', $1)", [rebbiA.id]), /row-level security/);
  await as(db, rebbiB, "update public.classes set owner = $1 where id = 'c1'", [rebbiB.id]); // sees no row: nothing happens
  await fails(as(db, rebbiA, "update public.classes set owner = $1 where id = 'c1'", [rebbiB.id]), /row-level security/);
  const r = await rows(db.query("select owner from public.classes where id = 'c1'"));
  assert.strictEqual(r[0].owner, rebbiA.id);
});

test('class_patch changes only the keys given, and only on your own class', async () => {
  await as(db, rebbiA, "select public.class_patch('c1', 'dev1', '{\"name\":\"A2\"}', '{\"talmidim\":\"[1]\"}', null, '{\"i1\":\"{}\"}', null)");
  await as(db, office, "select public.class_patch('c1', 'dev9', '{}', null, null, '{\"i2\":\"{}\"}', null)");
  await as(db, rebbiA, "select public.class_patch('c1', 'dev1', '{}', null, '{lessons}', null, '{i1}')");
  const r = (await rows(db.query("select * from public.classes where id = 'c1'")))[0];
  assert.deepStrictEqual(r.data, { talmidim: '[1]' });
  assert.deepStrictEqual(r.issues, { i2: '{}' });
  assert.strictEqual(r.name, 'A2');
  assert.strictEqual(r.updated_device, 'dev1');
  await fails(as(db, rebbiB, "select public.class_patch('c1', 'x', '{}', '{\"talmidim\":\"[]\"}', null, null, null)"), /not found or not yours/);
});

test('nobody can make himself office', async () => {
  await fails(as(db, rebbiA, "insert into public.admins values ('rebbia@example.com')"), /permission denied|row-level/);
  assert.strictEqual((await rows(as(db, rebbiA, 'select * from public.admins'))).length, 0);
  assert.strictEqual((await rows(as(db, office, 'select * from public.admins'))).length, 1);
  assert.strictEqual((await rows(as(db, rebbiA, 'select public.is_admin() as a')))[0].a, false);
  assert.strictEqual((await rows(as(db, office, 'select public.is_admin() as a')))[0].a, true);
});

test('the rebbeim directory: only for accounts with a class, and only your own entry', async () => {
  await as(db, rebbiA, "insert into public.people (email, uid, profiles) values ('rebbia@example.com', $1, '{\"c1\":{\"name\":\"A\"}}')", [rebbiA.id]);
  await fails(as(db, rebbiB, "insert into public.people (email, uid) values ('rebbia@example.com', $1)", [rebbiB.id]), /row-level|duplicate/);
  assert.strictEqual((await rows(as(db, rebbiB, 'select * from public.people'))).length, 0, 'no class yet');
  await as(db, stranger, "insert into public.people (email, uid) values ('stranger@example.com', $1) on conflict (email) do update set profiles = excluded.profiles", [stranger.id]);
  assert.deepStrictEqual((await rows(as(db, stranger, 'select email from public.people'))).map((r) => r.email), ['stranger@example.com'], 'only his own (empty) entry');
  await as(db, rebbiB, "insert into public.people (email, uid, profiles) values ('rebbib@example.com', $1, '{\"c3\":{\"name\":\"B\"}}')", [rebbiB.id]);
  assert.strictEqual((await rows(as(db, rebbiB, 'select * from public.people'))).length, 3);
  assert.strictEqual((await rows(as(db, office, 'select * from public.people'))).length, 3);
  assert.strictEqual((await rows(as(db, stranger, 'select * from public.people'))).length, 1, 'stranger: only himself');
});

test('shared issues: members read and reply; only the sender edits; others see nothing', async () => {
  const members = ['rebbia@example.com', 'rebbib@example.com'];
  await as(db, rebbiA, "select public.shared_put('i9', 'c1', $1, '{rebbi:c3}', '{\"t\":1}', '555')", [members]);
  assert.strictEqual((await rows(as(db, rebbiB, 'select * from public.shared'))).length, 1);
  assert.strictEqual((await rows(as(db, stranger, 'select * from public.shared'))).length, 0);
  assert.strictEqual((await rows(as(db, office, 'select * from public.shared'))).length, 0);
  await as(db, rebbiB, "select public.shared_reply('i9', 'n1', '{\"text\":\"hi\"}')");
  await as(db, rebbiB, "select public.shared_seen('i9', 'c3', 2)");
  await fails(as(db, stranger, "select public.shared_reply('i9', 'n2', 'x')"), /not on this issue/);
  await as(db, rebbiB, "update public.shared set issue = 'hacked' where id = 'i9'");             // not his: no rows change
  assert.strictEqual((await rows(as(db, rebbiB, "select public.shared_put('i9', 'c3', $1, '{}', 'hacked', '') as ok", [members])))[0].ok, false);
  await as(db, rebbiA, "select public.shared_put('i9', 'c1', $1, '{rebbi:c3}', '{\"t\":2}', '555')", [members]);
  const r = (await rows(db.query("select * from public.shared where id = 'i9'")))[0];
  assert.strictEqual(r.issue, '{"t":2}');
  assert.deepStrictEqual(r.replies, { n1: '{"text":"hi"}' }, 'resending keeps replies');
  assert.deepStrictEqual(r.seen, { c3: 2 });
  await fails(as(db, rebbiB, "select public.shared_put('i10', 'c3', '{someone@example.com}', '{}', 'x', '')"), /row-level/);
});

test('calendars: owner only; long token', async () => {
  await as(db, rebbiA, "insert into public.calendars (token, ics) values ('abcdefghijklmnopqrstuvwxyz12', 'BEGIN:VCALENDAR')");
  await fails(as(db, rebbiA, "insert into public.calendars (token, ics) values ('short', 'x')"), /check/);
  assert.strictEqual((await rows(as(db, rebbiB, 'select * from public.calendars'))).length, 0);
  await as(db, rebbiB, 'delete from public.calendars');
  assert.strictEqual((await rows(db.query('select * from public.calendars'))).length, 1);
});

test('documents: only the class\'s rebbi and the office', async () => {
  const add = (u, path) => as(db, u, "insert into storage.objects (bucket_id, name) values ('limud-files', $1)", [path]);
  await add(rebbiA, 'c1/u1/f1/sheet.pdf');
  await fails(add(rebbiB, 'c1/u1/f2/hack.pdf'), /row-level/);
  await fails(add(rebbiA, 'c3/u1/f3/x.pdf'), /row-level/, 'not his class');
  await fails(add(rebbiA, 'sheet.pdf'), /row-level/, 'must be in a class folder');
  await add(office, 'c1/u1/f4/office.pdf');
  const see = async (u) => (await rows(as(db, u, "select name from storage.objects where bucket_id = 'limud-files' order by name"))).map((r) => r.name);
  assert.deepStrictEqual(await see(rebbiA), ['c1/u1/f1/sheet.pdf', 'c1/u1/f4/office.pdf']);
  assert.deepStrictEqual(await see(rebbiB), []);
  assert.deepStrictEqual(await see(stranger), []);
  await as(db, rebbiB, "delete from storage.objects where name = 'c1/u1/f1/sheet.pdf'");
  assert.strictEqual((await see(rebbiA)).length, 2, 'another rebbi can\'t delete');
  await as(db, rebbiA, "delete from storage.objects where name = 'c1/u1/f1/sheet.pdf'");
  assert.deepStrictEqual(await see(office), ['c1/u1/f4/office.pdf']);
});

test('schema.sql can be run a second time', async () => {
  await db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../supabase/schema.sql'), 'utf8'));
});
