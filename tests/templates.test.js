// Run with: node tests/templates.test.js
const assert = require('assert');
const T = require('../js/templates.js');

let failures = 0;
function check(name, fn) { try { fn(); } catch (e) { failures++; console.error('FAIL', name, '-', e.message); } }
let n = 0; const uid = () => 'id' + (++n);
const tpl = name => T.defaults(uid).find(t => t.name === name).body;
const base = { name: 'Avraham', parent: 'Mr. and Mrs. Adler', rebbi: 'Rabbi Cohen', class: 'Kitah Gimmel', parsha: 'Toldos',
  detail: '', strengths: '', working_on: '', bechina: '', score: '', absences: '' };

check('detail becomes its own sentence', () => {
  const out = T.fill(tpl('Sharing nachas'), { ...base, detail: 'great interactions with friends' });
  assert.ok(out.includes('\n\nGreat interactions with friends.\n\n'), out);
  assert.ok(!/He Great/.test(out));
});

check('empty optional parts leave no blanks or leftovers', () => {
  for (const t of T.defaults(uid)) {
    const out = T.fill(t.body, base);
    assert.ok(!/[{}\[\]]/.test(out), t.name + ': leftover brackets\n' + out);
    assert.ok(!/\n{3,}/.test(out), t.name + ': extra blank lines');
    assert.ok(!/  | [.,]|\.\./.test(out), t.name + ': spacing/punctuation\n' + out);
    assert.ok(out.startsWith('Dear Mr. and Mrs. Adler,'), t.name);
    assert.ok(out.endsWith('Rabbi Cohen'), t.name);
  }
});

check('records are woven in when present', () => {
  const vals = { ...base, strengths: 'Brachos 1:1–1:2 and Nekudos', working_on: 'Parshas Toldos – first aliyah',
    bechina: 'Parshas Chayei Sarah bechina', score: '72 out of 100 (72%)', absences: '3', detail: 'he should read the pesukim aloud each night' };
  for (const t of T.defaults(uid)) {
    const out = T.fill(t.body, vals);
    assert.ok(!/[{}\[\]]/.test(out), t.name + '\n' + out);
    assert.ok(out.length > 350, t.name + ' is too short: ' + out.length);
  }
  assert.ok(T.fill(tpl('Bechina results'), vals).includes('his mark was 72 out of 100 (72%).'));
  assert.ok(T.fill(tpl('Needs chazara at home'), vals).includes('needs more review on Parshas Toldos – first aliyah. He is trying'));
  assert.ok(T.fill(tpl('We missed him (absent)'), vals).includes('out 3 times in the past month'));
  assert.ok(T.fill(tpl('Weekly update & parsha'), vals).includes('Parshas Toldos, and Avraham is working on'));
});

check('sentence helper', () => {
  assert.strictEqual(T.sentence('  he did well '), 'He did well.');
  assert.strictEqual(T.sentence('Wonderful!'), 'Wonderful!');
  assert.strictEqual(T.sentence(''), '');
});

check('upgrade replaces unedited old templates and keeps custom ones', () => {
  const data = { templates: [
    { id: 'a', name: 'Great week', body: 'Dear {parent},\n\nI wanted to share that {name} had a wonderful week! He {highlight}. You should have much nachas!\n\n{rebbi}' },
    { id: 'b', name: 'My own', body: 'Hello {parent}' } ] };
  T.upgrade(data, uid);
  assert.strictEqual(data.templates.length, T.defaults(uid).length + 1);
  assert.ok(data.templates.some(t => t.name === 'My own'));
  assert.ok(!data.templates.some(t => t.name === 'Great week'));
  const before = JSON.stringify(data); T.upgrade(data, uid);
  assert.strictEqual(JSON.stringify(data), before, 'second upgrade changes nothing');
});

check('old-style {highlight} templates still work', () => {
  assert.strictEqual(T.fill('He {highlight}!', { ...base, detail: 'learned well' }), 'He Learned well!');
});

if (failures) { console.error(failures + ' test(s) failed'); process.exit(1); }
console.log('All template tests passed');
