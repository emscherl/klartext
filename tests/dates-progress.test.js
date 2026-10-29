import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, isDateKey, todayKey, formatDe } from '../src/dates.js';
import { currentStreak, longestStreak, stats } from '../src/progress.js';

test('Datumsrechnung über Monats-, Jahres- und Sommerzeitgrenzen', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // Zeitumstellung 25.10.
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(todayKey(new Date(2026, 9, 29, 23, 59)), '2026-10-29');
});

test('Datumsprüfung', () => {
  assert.ok(isDateKey('2026-10-29'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.ok(!isDateKey('29.10.2026'));
  assert.equal(formatDe('2026-10-29'), 'Donnerstag, 29. Oktober 2026');
});

const done = (...dates) => Object.fromEntries(dates.map(d => [d, { date: d, done: true, bereich: 'privat', typ: 'alltag' }]));

test('Serie zählt bis heute', () => {
  assert.equal(currentStreak(done('2026-10-27', '2026-10-28', '2026-10-29'), '2026-10-29'), 3);
});

test('Serie bleibt bestehen, solange heute noch offen ist', () => {
  assert.equal(currentStreak(done('2026-10-27', '2026-10-28'), '2026-10-29'), 2);
});

test('Serie reißt nach einem verpassten Tag', () => {
  assert.equal(currentStreak(done('2026-10-26', '2026-10-27'), '2026-10-29'), 0);
});

test('angefangene, nicht erledigte Tage zählen nicht', () => {
  const e = { ...done('2026-10-28'), '2026-10-29': { date: '2026-10-29', done: false } };
  assert.equal(currentStreak(e, '2026-10-29'), 1);
});

test('längste Serie und Kennzahlen', () => {
  const e = done('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11');
  e['2026-10-11'].bereich = 'beruflich';
  e['2026-10-11'].typ = 'schriftlich';
  assert.equal(longestStreak(e), 3);
  assert.deepEqual(stats(e), { total: 5, beruflich: 1, privat: 4, schriftlich: 1, alltag: 4 });
});
