import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sentences, words, sentenceLimit, analyze } from '../src/selfcheck.js';
import { claudePrompt, claudeUrl } from '../src/feedback.js';

const tipps = new Set(JSON.parse(readFileSync(new URL('../content/tipps.json', import.meta.url))).map(t => t.id));
const challenges = JSON.parse(readFileSync(new URL('../content/challenges.json', import.meta.url)));

test('Sätze und Wörter zählen, auch mit Abkürzungen und Anführungszeichen', () => {
  assert.equal(sentences('Ich würde die Zahl nach vorn ziehen. Der Kundenfall ist stark! Was meinst du?').length, 3);
  assert.equal(sentences('Wir treffen uns z. B. am Montag. „Passt das?“ Gut.').length, 3);
  assert.equal(sentences('').length, 0);
  assert.equal(words('Das ist ein Kundenbeispiel-Test, oder?'), 5);
});

test('Satzvorgaben aus dem Aufgabentext', () => {
  assert.deepEqual(sentenceLimit('Schreib die Absage in höchstens fünf Sätzen: …'), { min: null, max: 5 });
  assert.deepEqual(sentenceLimit('Formuliere deine Antwort in maximal drei Sätze.'), { min: null, max: 3 });
  assert.deepEqual(sentenceLimit('Schreib deine nächsten zwei bis drei Sätze.'), { min: 2, max: 3 });
  assert.equal(sentenceLimit('Formuliere, was du sagst.'), null);
});

test('Hinweise: zu viele Sätze, „aber“ nach Entschuldigung, Verallgemeinerung, „man“, „du bist“', () => {
  const h = analyze('Es tut mir leid, aber du bist immer zu spät. Man kann so nicht arbeiten. Das ist eigentlich vielleicht ein Problem. Ok.', 'Schreib zwei bis drei Sätze.');
  const text = h.map(x => x.text).join(' | ');
  assert.match(text, /4 Sätze, die Aufgabe verlangt 2 bis 3/);
  assert.match(text, /Entschuldigung folgt ein „aber“/);
  assert.match(text, /„immer“/);
  assert.match(text, /„man“/);
  assert.match(text, /Du bist/);
  assert.match(text, /Weichmacher/);
  for (const x of h) if (x.tipp) assert.ok(tipps.has(x.tipp), x.tipp);
});

test('saubere Antwort bekommt keine Warnung', () => {
  const h = analyze('Ich würde die wichtigste Zahl auf die erste Folie ziehen. Der Kundenfall auf Folie 6 ist stark, den würde ich behalten.', 'Gib zwei bis drei konkrete Vorschläge.');
  assert.ok(h.every(x => x.ok), JSON.stringify(h));
});

test('alle Satzvorgaben der Challenges werden erkannt', () => {
  for (const c of challenges.filter(c => /\bSätzen?\b/.test(c.aufgabe) && /(höchstens|maximal|bis)/.test(c.aufgabe))) {
    assert.ok(sentenceLimit(c.aufgabe), c.id);
  }
});

test('Claude-Anfrage enthält Aufgabe, Kriterien und Antwort und passt in eine URL', () => {
  const c = challenges.find(x => x.id === 'b09-feedforward-geben');
  const p = claudePrompt({ challenge: c, entry: { answer: 'Meine Antwort „mit Umlauten“ äöü', reflection: '' }, techniques: [{ name: 'Feedforward', kurz: 'Vorschläge für die Zukunft.', merksatz: 'Nach vorn.' }] });
  assert.match(p, /Aufgabe: Gib ihr zwei bis drei/);
  assert.match(p, /Kriterien:\n- Zwei bis drei Vorschläge/);
  assert.match(p, /"""\nMeine Antwort „mit Umlauten“ äöü\n"""/);
  assert.ok(claudeUrl(p).startsWith('https://claude.ai/new?q='));
  assert.ok(claudeUrl(p).length < 8000);
  const a = claudePrompt({ challenge: { ...c, typ: 'alltag', kriterien: undefined }, entry: { answer: '', reflection: 'Lief gut' }, techniques: [] });
  assert.match(a, /So lief es bei mir:\n"""\nLief gut/);
});
