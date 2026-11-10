'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseReply } = require('../src/parser');
const roster = require('../data/school.sample.json').rebbeim[0].talmidim;

const ids = list => list.map(s => s.id).sort();

test('single names and nicknames', () => {
  assert.deepStrictEqual(ids(parseReply('Yanky', roster).absent), ['g3']);
  assert.deepStrictEqual(ids(parseReply('Avi, Duvi', roster).absent), ['g1', 'g6']);
  assert.deepStrictEqual(ids(parseReply('Shmuel and Itzy', roster).absent), ['g2', 'g7']);
});

test('names on separate lines or without commas', () => {
  assert.deepStrictEqual(ids(parseReply('Yanky\nDovid', roster).absent), ['g3', 'g6']);
  assert.deepStrictEqual(ids(parseReply('yanky duvi', roster).absent), ['g3', 'g6']);
  assert.deepStrictEqual(ids(parseReply('moshe k avi', roster).absent), ['g1', 'g5']);
});

test('filler words are ignored', () => {
  assert.deepStrictEqual(ids(parseReply('Dovid is absent today', roster).absent), ['g6']);
  assert.deepStrictEqual(ids(parseReply('Shmuel sick, Yanky out', roster).absent), ['g3', 'g7']);
});

test('typos are tolerated', () => {
  assert.deepStrictEqual(ids(parseReply('Yitchak', roster).absent), ['g2']);
  assert.deepStrictEqual(ids(parseReply('Fridman', roster).absent), ['g3']);
});

test('two boys with the same first name ask which one', () => {
  const r = parseReply('Moshe', roster);
  assert.strictEqual(r.absent.length, 0);
  assert.strictEqual(r.ambiguous.length, 1);
  assert.deepStrictEqual(ids(r.ambiguous[0].options), ['g4', 'g5']);
  assert.deepStrictEqual(ids(parseReply('Moshe K', roster).absent), ['g5']);
  assert.deepStrictEqual(ids(parseReply('Moshe Goldberg', roster).absent), ['g4']);
  assert.deepStrictEqual(ids(parseReply('Moishy', roster).absent), ['g5']);
});

test('late and came in', () => {
  const r = parseReply('Dovid late, Yanky', roster);
  assert.deepStrictEqual(ids(r.late), ['g6']);
  assert.deepStrictEqual(ids(r.absent), ['g3']);
  assert.deepStrictEqual(ids(parseReply('Yanky came in', roster).present), ['g3']);
});

test('Hebrew names', () => {
  assert.deepStrictEqual(ids(parseReply('יעקב, דוד', roster).absent), ['g3', 'g6']);
});

test('commands and nobody absent', () => {
  for (const w of ['none', 'None!', 'all here', 'Everyone is here', 'nobody']) assert.strictEqual(parseReply(w, roster).command, 'none', w);
  assert.strictEqual(parseReply('UNDO', roster).command, 'undo');
  assert.strictEqual(parseReply('list', roster).command, 'list');
  assert.strictEqual(parseReply('help', roster).command, 'help');
});

test('unknown names are reported', () => {
  const r = parseReply('Yanky, Zalman', roster);
  assert.deepStrictEqual(ids(r.absent), ['g3']);
  assert.deepStrictEqual(r.unknown, ['zalman']);
});
