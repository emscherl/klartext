import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, gradeCard, dueCards, isDue, nextInterval, cardKey } from '../src/srs.js';
import { addDays, diffDays } from '../src/dates.js';

const T0 = '2026-10-29';

test('neue Karte ist am nächsten Tag fällig, nicht heute', () => {
  const c = newCard(cardKey('technik', 'batna'), T0);
  assert.equal(c.due, '2026-10-30');
  assert.equal(isDue(c, T0), false);
  assert.equal(isDue(c, '2026-10-30'), true);
});

test('Karte taucht genau zum fälligen Termin auf und bleibt danach fällig', () => {
  const c = { ...newCard('tipp:t01', T0), due: '2026-11-05' };
  assert.deepEqual(dueCards([c], '2026-11-04'), []);
  assert.deepEqual(dueCards([c], '2026-11-05').map(x => x.key), ['tipp:t01']);
  assert.deepEqual(dueCards([c], '2026-11-20').map(x => x.key), ['tipp:t01']);
});

test('mit „Gut“ wachsen die Abstände stetig', () => {
  let c = newCard('technik:x', T0), day = c.due;
  const gaps = [];
  for (let i = 0; i < 6; i++) {
    c = gradeCard(c, 'gut', day);
    gaps.push(diffDays(day, c.due));
    day = c.due;
  }
  assert.deepEqual(gaps.slice(0, 2), [3, 7]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `Abstand ${i}: ${gaps}`);
});

test('Reihenfolge der Abstände: Nochmal < Schwer < Gut < Leicht', () => {
  let c = newCard('technik:x', T0);
  c = gradeCard(c, 'gut', '2026-10-30');
  c = gradeCard(c, 'gut', c.due);
  const iv = ['nochmal', 'schwer', 'gut', 'leicht'].map(g => nextInterval(c, g));
  for (let i = 1; i < iv.length; i++) assert.ok(iv[i] > iv[i - 1], iv.join());
});

test('„Nochmal“ setzt zurück: morgen wieder fällig, Leichtigkeit sinkt', () => {
  let c = newCard('technik:x', T0);
  c = gradeCard(c, 'gut', '2026-10-30');
  c = gradeCard(c, 'gut', c.due);
  const before = c.ease;
  c = gradeCard(c, 'nochmal', '2026-11-20');
  assert.equal(c.due, '2026-11-21');
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.ok(c.ease < before);
  // Danach beginnt der Aufbau neu
  c = gradeCard(c, 'gut', c.due);
  assert.equal(diffDays('2026-11-21', c.due), 3);
});

test('Leichtigkeit fällt nie unter 1,3', () => {
  let c = newCard('technik:x', T0);
  for (let i = 0; i < 20; i++) c = gradeCard(c, 'nochmal', addDays(T0, i));
  assert.equal(c.ease, 1.3);
});

test('Abstand ist auf ein Jahr begrenzt', () => {
  let c = newCard('technik:x', T0), day = c.due;
  for (let i = 0; i < 30; i++) { c = gradeCard(c, 'leicht', day); day = c.due; }
  assert.equal(c.interval, 365);
});

test('fällige Karten sortiert: älteste zuerst', () => {
  const a = { ...newCard('technik:a', T0), due: '2026-11-03' };
  const b = { ...newCard('technik:b', T0), due: '2026-11-01' };
  const c = { ...newCard('technik:c', T0), due: '2026-11-09' };
  assert.deepEqual(dueCards([a, b, c], '2026-11-05').map(x => x.key), ['technik:b', 'technik:a']);
});

test('Bewertung verändert die Ursprungskarte nicht', () => {
  const c = newCard('technik:x', T0);
  const copy = { ...c };
  gradeCard(c, 'gut', '2026-10-30');
  assert.deepEqual(c, copy);
});

test('unbekannte Bewertung wirft einen Fehler', () => {
  assert.throws(() => gradeCard(newCard('technik:x', T0), 'super', T0));
});

test('„Schwer“ wächst mindestens um einen Tag und bleibt unter der Obergrenze', () => {
  const base = { ...newCard('technik:x', T0), reps: 3, ease: 2.5 };
  assert.equal(nextInterval({ ...base, interval: 1 }, 'schwer'), 2);
  assert.equal(nextInterval({ ...base, interval: 2 }, 'schwer'), 3);
  assert.equal(nextInterval({ ...base, interval: 340 }, 'schwer'), 365);
  assert.ok(nextInterval({ ...base, interval: 340 }, 'schwer') <= nextInterval({ ...base, interval: 340 }, 'gut'));
});
