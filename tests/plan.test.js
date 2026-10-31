import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPosition, weekDates, trainedDays, phaseOf, fillerRate, checkSeries, compareChecks, impulse, extendPlan, defaultPlan, backupDue } from '../src/plan.js';

test('ohne Start oder vor dem Start: Woche 0', () => {
  assert.deepEqual(planPosition(null, '2026-11-02'), { week: 0, day: 0, started: false, finished: false });
  assert.equal(planPosition('2026-11-05', '2026-11-02').started, false);
});

test('Wochen und Tage zählen ab dem Starttag', () => {
  assert.deepEqual(planPosition('2026-11-02', '2026-11-02'), { week: 1, day: 1, started: true, finished: false });
  assert.deepEqual(planPosition('2026-11-02', '2026-11-08'), { week: 1, day: 7, started: true, finished: false });
  assert.deepEqual(planPosition('2026-11-02', '2026-11-09'), { week: 2, day: 1, started: true, finished: false });
  assert.equal(planPosition('2026-11-02', '2027-01-24').week, 12);
  assert.equal(planPosition('2026-11-02', '2027-01-24').finished, false);
});

test('nach 84 Tagen ist der Plan abgeschlossen und bleibt bei Woche 12', () => {
  const p = planPosition('2026-11-02', '2027-01-25');
  assert.equal(p.finished, true);
  assert.equal(p.week, 12);
  assert.equal(planPosition('2026-11-02', '2028-01-01').week, 12);
});

test('Zeitumstellung verschiebt keine Woche', () => {
  // 29.03.2026 Sommerzeit, 25.10.2026 Winterzeit
  assert.equal(planPosition('2026-03-23', '2026-03-30').week, 2);
  assert.equal(planPosition('2026-10-19', '2026-10-26').week, 2);
});

test('weekDates liefert sieben aufeinanderfolgende Tage', () => {
  assert.deepEqual(weekDates('2026-11-02', 2), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
});

test('trainedDays zählt nur erledigte Tage der Woche', () => {
  const days = {
    '2026-11-02': { week: 1, done: true, note: '' },
    '2026-11-03': { week: 1, done: false, note: 'x' },
    '2026-11-09': { week: 2, done: true, note: '' },
  };
  assert.equal(trainedDays(days, 1), 1);
  assert.equal(trainedDays(days, 2), 1);
  assert.equal(trainedDays(days, 3), 0);
});

test('Verlängern schiebt den Start um eine Woche, Geübtes bleibt seiner Woche zugeordnet', () => {
  const plan = { ...defaultPlan(), start: '2026-11-02', days: { '2026-11-10': { week: 2, done: true, note: '' } } };
  const next = extendPlan(plan);
  assert.equal(next.start, '2026-11-09');
  assert.equal(planPosition(next.start, '2026-11-12').week, 1);
  assert.equal(trainedDays(next.days, 2), 1);
});

test('phaseOf findet die Phase zur Woche', () => {
  const phasen = [{ nr: 1, wochen: [1, 2] }, { nr: 2, wochen: [3, 4] }];
  assert.equal(phaseOf(phasen, 3).nr, 2);
  assert.equal(phaseOf(phasen, 9), null);
});

test('Füllwörter pro Minute', () => {
  assert.equal(fillerRate({ fuellwoerter: 12, sekunden: 60 }), 12);
  assert.equal(fillerRate({ fuellwoerter: 7, sekunden: 90 }), 4.7);
  assert.equal(fillerRate({ fuellwoerter: null, sekunden: 60 }), null);
  assert.equal(fillerRate({ fuellwoerter: 3, sekunden: 0 }), null);
  assert.equal(fillerRate(undefined), null);
});

test('Messreihe sortiert nach Woche, leere Messungen fallen raus, Vergleich rechnet Differenz', () => {
  const checks = {
    4: { fuellwoerter: 6, sekunden: 60, kernsatz: true, klarheit: 6, ruhe: 7 },
    1: { fuellwoerter: 12, sekunden: 60, kernsatz: false, klarheit: 4, ruhe: 3 },
    2: { fuellwoerter: null, sekunden: 60, kernsatz: null, klarheit: null, ruhe: null, gespraech: 'nur Notiz' },
  };
  assert.deepEqual(checkSeries(checks).map(r => r.week), [1, 4]);
  assert.deepEqual(compareChecks(checks, 1, 4), { rate: { from: 12, to: 6, diff: -6 }, klarheit: { from: 4, to: 6, diff: 2 }, ruhe: { from: 3, to: 7, diff: 4 } });
  assert.equal(checkSeries(checks)[1].ruhe, 7);
  assert.equal(compareChecks(checks, 1, 7), null);
});

test('Impuls ist pro Tag fest, Alternativen unterscheiden sich vom Tagesimpuls', () => {
  const list = ['A', 'B', 'C', 'D', 'E'];
  assert.equal(impulse(list, '2026-11-02', 'themen'), impulse(list, '2026-11-02', 'themen'));
  const main = impulse(list, '2026-11-02', 'themen');
  for (let n = 1; n <= 4; n++) assert.notEqual(impulse(list, '2026-11-02', 'themen', n), main);
  assert.equal(impulse([], '2026-11-02', 'themen'), null);
});

test('Sicherung ist nach 7 Tagen oder bei nie gesicherten Daten fällig', () => {
  assert.equal(backupDue(null, '2026-11-10', false), null);
  assert.deepEqual(backupDue(null, '2026-11-10', true), { days: null });
  assert.equal(backupDue('2026-11-04', '2026-11-10', true), null);
  assert.deepEqual(backupDue('2026-11-03', '2026-11-10', true), { days: 7 });
});
