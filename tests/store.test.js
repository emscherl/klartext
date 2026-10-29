import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportState, importState, defaultState, STORAGE_KEY } from '../src/store.js';
import { newCard } from '../src/srs.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m };
}

function sample() {
  const s = defaultState();
  s.entries['2026-10-29'] = { date: '2026-10-29', challengeId: 'p01-haushalt-gfk', bereich: 'privat', typ: 'schriftlich', skips: 1, answer: 'Meine Antwort „mit Umlauten“ äöüß', reflection: 'Ging gut', done: true, completedAt: '2026-10-29T19:00:00.000Z', feedback: [] };
  s.cards['technik:batna'] = newCard('technik:batna', '2026-10-29');
  s.reviewLog['2026-10-29'] = 4;
  return s;
}

test('leerer Speicher liefert Grundzustand', () => {
  assert.deepEqual(createStore(memoryStorage()).load(), defaultState());
});

test('Daten bleiben nach Neuladen erhalten', () => {
  const storage = memoryStorage();
  createStore(storage).save(sample());
  assert.deepEqual(createStore(storage).load(), sample());
});

test('kaputter Speicherinhalt führt nicht zum Absturz', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{kaputt');
  assert.deepEqual(createStore(storage).load(), defaultState());
  assert.equal(storage.getItem(`${STORAGE_KEY}:defekt`), '{kaputt');
});

test('Export und Import ergeben denselben Zustand', () => {
  const json = exportState(sample(), new Date('2026-10-29T20:00:00Z'));
  assert.equal(JSON.parse(json).app, 'klartext');
  assert.deepEqual(importState(json), sample());
});

test('Import lehnt fremde und ungültige Dateien ab', () => {
  assert.throws(() => importState('kein json'), /kein gültiges JSON/);
  assert.throws(() => importState(JSON.stringify({ decks: [] })), /keine Klartext-Sicherung/);
  assert.throws(() => importState(JSON.stringify({ app: 'klartext', version: 99 })), /neueren App-Version/);
});

test('Import verwirft einzelne kaputte Einträge und behält den Rest', () => {
  const data = JSON.parse(exportState(sample()));
  data.entries['2026-02-30'] = { challengeId: 'x' };
  data.entries['2026-10-28'] = { answer: 'ohne challengeId' };
  data.cards['boese:<script>'] = { due: '2026-10-30' };
  data.cards['tipp:t01'] = { due: 'morgen' };
  const s = importState(JSON.stringify(data));
  assert.deepEqual(Object.keys(s.entries), ['2026-10-29']);
  assert.deepEqual(Object.keys(s.cards), ['technik:batna']);
});

test('Feedback-Feld bleibt erhalten (Erweiterungspunkt)', () => {
  const s = sample();
  s.entries['2026-10-29'].feedback = [{ source: 'test', text: 'Gut formuliert', createdAt: '2026-10-29T20:00:00Z' }];
  assert.deepEqual(importState(exportState(s)).entries['2026-10-29'].feedback, s.entries['2026-10-29'].feedback);
});

test('Speicherfehler wird gemeldet statt geworfen', () => {
  const store = createStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  assert.equal(store.save(sample()), false);
});

test('Import verwirft ungültiges completedAt und kaputte Feedback-Einträge', () => {
  const data = JSON.parse(exportState(sample()));
  data.entries['2026-10-29'].completedAt = 'gestern';
  data.entries['2026-10-29'].feedback = [null, { text: 'ok' }];
  const e = importState(JSON.stringify(data)).entries['2026-10-29'];
  assert.equal(e.completedAt, null);
  assert.deepEqual(e.feedback, [{ text: 'ok' }]);
});
