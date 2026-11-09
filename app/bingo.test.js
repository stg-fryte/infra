const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRACK_BUZZWORDS, CELL_COUNT, FREE_INDEX, buildCard, titleBuzzwords, isMarkableIndex, winningLines } = require('./bingo');

const session = { title: 'Securing Supply Chains with Sigstore', track: 'Security' };

test('every track in the schedule migration has a buzzword pool', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '002_schedule.sql'), 'utf8');
  const tracksBlock = sql.split('-- Tracks')[1].split('-- Locations')[0];
  const names = [...tracksBlock.matchAll(/\(\d+, '([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(names.length >= 23, `parsed ${names.length} tracks`);
  const missing = names.filter((name) => !(TRACK_BUZZWORDS[name]?.length >= 8));
  assert.deepEqual(missing, []);
});

test('card has 25 unique cells with FREE in the center', () => {
  const card = buildCard(session);
  assert.equal(card.length, CELL_COUNT);
  assert.equal(card[FREE_INDEX], 'FREE');
  assert.equal(new Set(card.map((c) => c.toLowerCase())).size, CELL_COUNT);
});

test('card includes words from the session title', () => {
  const card = buildCard(session).map((c) => c.toLowerCase());
  for (const word of ['securing', 'supply', 'chains', 'sigstore']) assert.ok(card.includes(word), word);
});

test('card for a track without a pool still fills', () => {
  assert.equal(buildCard({ title: 'Lunch', track: null }).length, CELL_COUNT);
});

test('title words drop stopwords and short words', () => {
  assert.deepEqual(titleBuzzwords('Welcome to the Mesh with eBPF'), ['Mesh', 'eBPF']);
});

test('row, column and diagonal wins are detected', () => {
  assert.equal(winningLines([12]).length, 0);
  assert.equal(winningLines([0, 1, 2, 3, 4]).length, 1);
  assert.equal(winningLines([2, 7, 12, 17, 22]).length, 1);
  assert.equal(winningLines([0, 6, 12, 18, 24]).length, 1);
  assert.equal(winningLines([4, 8, 12, 16, 20]).length, 1);
});

test('only non-FREE in-range integer cells are markable', () => {
  assert.equal(isMarkableIndex(3), true);
  assert.equal(isMarkableIndex(FREE_INDEX), false);
  assert.equal(isMarkableIndex(25), false);
  assert.equal(isMarkableIndex(-1), false);
  assert.equal(isMarkableIndex(Number.NaN), false);
});
