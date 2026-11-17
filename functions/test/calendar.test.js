const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Load index.js without the Firebase packages: stub them.
const realLoad = Module._load;
Module._load = function (name, ...rest) {
  if (name === 'firebase-admin') return { initializeApp() {}, firestore() { throw new Error('not in tests'); } };
  if (name === 'firebase-functions/v2/https') return { onRequest: (opts, fn) => fn };
  return realLoad.call(this, name, ...rest);
};
const { _handle } = require('../index.js');
Module._load = realLoad;

function res() {
  const r = { code: 0, headers: {}, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.set = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
const TOK = 'abcdefghijklmnopqrstuvwxyz0123';
const docs = { [TOK]: { exists: true, get: (k) => (k === 'ics' ? 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' : null) } };
const getDoc = async (t) => docs[t] || { exists: false, get: () => null };

test('serves the calendar for a known token', async () => {
  for (const path of ['/' + TOK + '.ics', '/' + TOK, '/calendar/' + TOK + '.ics']) {
    const r = res(); await _handle({ method: 'GET', path }, r, getDoc);
    assert.strictEqual(r.code, 200, path);
    assert.match(r.headers['content-type'], /^text\/calendar/);
    assert.match(r.body, /BEGIN:VCALENDAR/);
  }
});

test('unknown, short or odd tokens get 404 without a lookup for bad ones', async () => {
  let looked = 0;
  const spy = async (t) => { looked++; return getDoc(t); };
  for (const path of ['/zzzzzzzzzzzzzzzzzzzzzzzzzzzz.ics', '/short.ics', '/../etc/passwd', '/', '/' + TOK + '.ics/extra']) {
    const r = res(); await _handle({ method: 'GET', path }, r, spy);
    assert.strictEqual(r.code, 404, path);
  }
  assert.strictEqual(looked, 1);
});

test('only GET / HEAD', async () => {
  const r = res(); await _handle({ method: 'POST', path: '/' + TOK + '.ics' }, r, getDoc);
  assert.strictEqual(r.code, 405);
});
