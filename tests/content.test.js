// Prüft die Inhalte in content/: Umfang, Pflichtfelder, Quellen, Verweise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = n => JSON.parse(readFileSync(new URL(`../content/${n}.json`, import.meta.url), 'utf8'));
const techniken = load('techniken'), challenges = load('challenges'), tipps = load('tipps'), plan = load('plan');
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

test('12-Wochen-Plan: drei Phasen decken die Wochen 1 bis 12 genau einmal ab', () => {
  assert.equal(plan.wochen.length, 12);
  assert.deepEqual(plan.wochen.map(w => w.nr), Array.from({ length: 12 }, (_, i) => i + 1));
  const covered = plan.phasen.flatMap(p => p.wochen).sort((a, b) => a - b);
  assert.deepEqual(covered, Array.from({ length: 12 }, (_, i) => i + 1));
  for (const p of plan.phasen) for (const f of ['titel', 'untertitel', 'ziel', 'check']) assert.ok(filled(p[f]), `Phase ${p.nr}.${f}`);
});

test('12-Wochen-Plan: jede Woche hat Ziel, Begründung, geführte Schritte und gültige Verweise', () => {
  const tech = new Set(techniken.map(t => t.id)), tip = new Set(tipps.map(t => t.id));
  const rails = new Set(plan.schienen.map(r => r.name));
  for (const w of plan.wochen) {
    for (const f of ['titel', 'ziel', 'warum', 'transfer']) assert.ok(filled(w[f]), `Woche ${w.nr}.${f}`);
    assert.ok(w.schritte.length >= 2 && w.schritte.length <= 5, `Woche ${w.nr}: 2 bis 5 Schritte`);
    assert.ok(w.techniken.length >= 1, `Woche ${w.nr} ohne Technik`);
    for (const t of w.techniken) assert.ok(tech.has(t), `Woche ${w.nr} → Technik ${t}`);
    for (const t of w.tipps) assert.ok(tip.has(t), `Woche ${w.nr} → Tipp ${t}`);
    for (const s of [...w.schritte, plan.aufwaermen]) checkStep(s, rails, `Woche ${w.nr}`);
  }
});

function checkStep(s, rails, where) {
  const allowed = ['text', 'timer', 'impuls', 'aufnahme', 'anhoeren', 'schiene'];
  assert.ok(filled(s.text), `${where}: Schritt ohne Text`);
  for (const k of Object.keys(s)) assert.ok(allowed.includes(k), `${where}: unbekanntes Feld ${k}`);
  if (s.timer !== undefined) assert.ok(Number.isInteger(s.timer) && s.timer > 0 && s.timer <= 600, `${where}: timer`);
  if (s.impuls !== undefined) assert.ok(plan.impulse[s.impuls]?.length >= 20, `${where}: Impulse ${s.impuls}`);
  if (s.schiene !== undefined) assert.ok(rails.has(s.schiene), `${where}: Schiene ${s.schiene}`);
  for (const k of ['aufnahme', 'anhoeren']) if (s[k] !== undefined) assert.equal(s[k], true, `${where}: ${k}`);
}

test('12-Wochen-Plan: Ablauf, Messung und Redeschienen vollständig', () => {
  const tech = new Set(techniken.map(t => t.id));
  assert.ok(plan.ablauf.length >= 3 && plan.ablauf.every(a => filled(a.titel) && filled(a.text)));
  assert.ok(filled(plan.messung.standardthema) && filled(plan.messung.text) && plan.messung.kriterien.length >= 3);
  for (const r of plan.schienen) {
    assert.ok(filled(r.name) && filled(r.wann) && r.folge.length >= 2, r.name);
    assert.ok(tech.has(r.technik), `${r.name} → ${r.technik}`);
  }
  for (const list of Object.values(plan.impulse)) assert.equal(new Set(list).size, list.length, 'doppelte Impulse');
});
