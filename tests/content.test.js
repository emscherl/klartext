// Prüft die Inhalte in content/: Umfang, Pflichtfelder, Quellen, Verweise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = n => JSON.parse(readFileSync(new URL(`../content/${n}.json`, import.meta.url), 'utf8'));
const techniken = load('techniken'), challenges = load('challenges'), tipps = load('tipps');
const filled = v => typeof v === 'string' && v.trim().length > 0;
const unique = list => new Set(list.map(x => x.id)).size === list.length;
const ID = /^[a-z0-9-]+$/;

test('Mindestumfang: 15 Techniken, 30 Challenges, 30 Tipps', () => {
  assert.ok(techniken.length >= 15, `${techniken.length} Techniken`);
  assert.ok(challenges.length >= 30, `${challenges.length} Challenges`);
  assert.ok(tipps.length >= 30, `${tipps.length} Tipps`);
});

test('IDs sind eindeutig und gültig', () => {
  for (const list of [techniken, challenges, tipps]) {
    assert.ok(unique(list));
    for (const x of list) assert.match(x.id, ID);
  }
});

test('jede Technik hat Urheber, Quelle, Erklärung, Schritte, Beispiel, Übung, Merksatz', () => {
  for (const t of techniken) {
    for (const f of ['name', 'kategorie', 'urheber', 'quelle', 'kurz', 'beispiel', 'uebung', 'merksatz']) assert.ok(filled(t[f]), `${t.id}.${f}`);
    assert.ok(Array.isArray(t.schritte) && t.schritte.length >= 2 && t.schritte.every(filled), `${t.id}.schritte`);
  }
});

test('jede Challenge ist vollständig und verweist auf vorhandene Techniken', () => {
  const ids = new Set(techniken.map(t => t.id));
  for (const c of challenges) {
    for (const f of ['titel', 'situation', 'aufgabe']) assert.ok(filled(c[f]), `${c.id}.${f}`);
    assert.ok(['beruflich', 'privat'].includes(c.bereich), `${c.id}.bereich`);
    assert.ok(['schriftlich', 'alltag'].includes(c.typ), `${c.id}.typ`);
    assert.ok(c.techniken.length >= 1, `${c.id} ohne Technik`);
    for (const t of c.techniken) assert.ok(ids.has(t), `${c.id} verweist auf unbekannte Technik ${t}`);
    if (c.reflexion) assert.ok(c.reflexion.every(filled));
  }
});

test('Challenges mischen beruflich/privat und schriftlich/Alltag', () => {
  const count = (k, v) => challenges.filter(c => c[k] === v).length;
  for (const [k, v] of [['bereich', 'beruflich'], ['bereich', 'privat'], ['typ', 'schriftlich'], ['typ', 'alltag']]) {
    assert.ok(count(k, v) >= 10, `${v}: ${count(k, v)}`);
  }
});

test('jede Technik wird von mindestens einer Challenge genutzt', () => {
  const used = new Set(challenges.flatMap(c => c.techniken));
  for (const t of techniken) assert.ok(used.has(t.id), `${t.id} ungenutzt`);
});

test('Tipps sind vollständig, Technik-Verweise gültig', () => {
  const ids = new Set(techniken.map(t => t.id));
  for (const t of tipps) {
    for (const f of ['titel', 'text', 'kategorie']) assert.ok(filled(t[f]), `${t.id}.${f}`);
    if (t.technik) assert.ok(ids.has(t.technik), `${t.id} → ${t.technik}`);
  }
});
