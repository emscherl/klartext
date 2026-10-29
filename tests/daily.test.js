import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickForDay, alternativeForDay } from '../src/daily.js';
import { addDays } from '../src/dates.js';

const challenges = JSON.parse(readFileSync(new URL('../content/challenges.json', import.meta.url)));
const items = n => Array.from({ length: n }, (_, i) => ({ id: `c${String(i).padStart(2, '0')}` }));
const days = (start, n) => Array.from({ length: n }, (_, i) => addDays(start, i));

test('gleicher Tag liefert immer dieselbe Challenge', () => {
  assert.equal(pickForDay(challenges, '2026-10-29', 'challenge').id, pickForDay(challenges, '2026-10-29', 'challenge').id);
});

test('Reihenfolge der Inhaltsdatei ändert die Auswahl nicht', () => {
  const reversed = [...challenges].reverse();
  for (const d of days('2026-01-01', 60)) assert.equal(pickForDay(reversed, d, 'challenge').id, pickForDay(challenges, d, 'challenge').id);
});

test('aufeinanderfolgende Tage haben nie dieselbe Challenge (über drei Jahre)', () => {
  const list = days('2025-01-01', 3 * 365).map(d => pickForDay(challenges, d, 'challenge').id);
  for (let i = 1; i < list.length; i++) assert.notEqual(list[i], list[i - 1], `Wiederholung am Tag ${i}`);
});

test('innerhalb einer Runde kommt jede Challenge genau einmal', () => {
  const pool = items(7);
  // Runden beginnen bei Tagesnummern, die durch 7 teilbar sind; 1970-01-01 ist Tag 0
  for (const start of ['1970-01-01', '2026-10-29']) {
    const offset = (Math.round(Date.UTC(...start.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 864e5)) % 7;
    const first = addDays(start, (7 - offset) % 7);
    const ids = days(first, 7).map(d => pickForDay(pool, d).id);
    assert.equal(new Set(ids).size, 7);
  }
});

test('über viele Tage kommen alle Challenges vor', () => {
  const seen = new Set(days('2026-01-01', challenges.length * 2).map(d => pickForDay(challenges, d, 'challenge').id));
  assert.equal(seen.size, challenges.length);
});

test('verschiedene Runden haben verschiedene Reihenfolgen', () => {
  const pool = items(10);
  const round = r => days(addDays('1970-01-01', r * 10), 10).map(d => pickForDay(pool, d).id).join();
  assert.notEqual(round(2000), round(2001));
});

test('beruflich und privat wechseln sich über einen Monat ab', () => {
  const b = days('2026-11-01', 30).map(d => pickForDay(challenges, d, 'challenge').bereich);
  assert.ok(b.includes('beruflich') && b.includes('privat'));
});

test('Tipp und Challenge laufen unabhängig (eigener salt)', () => {
  const pool = items(30);
  const a = days('2026-01-01', 30).map(d => pickForDay(pool, d, 'challenge').id).join();
  const b = days('2026-01-01', 30).map(d => pickForDay(pool, d, 'tipp').id).join();
  assert.notEqual(a, b);
});

test('Alternative ist nie die ursprüngliche Tages-Challenge und stabil', () => {
  for (const d of days('2026-10-01', 40)) {
    const main = pickForDay(challenges, d, 'challenge').id;
    const alts = [1, 2, 3].map(k => alternativeForDay(challenges, d, k, 'challenge').id);
    assert.ok(!alts.includes(main));
    assert.equal(new Set(alts).size, 3);
    assert.equal(alternativeForDay(challenges, d, 1, 'challenge').id, alts[0]);
  }
});

test('leere Liste und Einzelelement', () => {
  assert.equal(pickForDay([], '2026-10-29'), null);
  assert.equal(pickForDay([{ id: 'x' }], '2026-10-29').id, 'x');
  assert.equal(alternativeForDay([{ id: 'x' }], '2026-10-29', 1).id, 'x');
});
