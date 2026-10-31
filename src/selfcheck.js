// Automatische Hinweise zu einer schriftlichen Antwort. Reine Textregeln, nichts verlässt das Gerät.
// Ersetzt kein inhaltliches Urteil: Die Hinweise zeigen typische Stolperstellen, die Checkliste und
// die Musterformulierung ergänzen sie.

const NUM = { ein: 1, eine: 1, einem: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8 };
const num = w => (/^\d+$/.test(w) ? Number(w) : NUM[w.toLowerCase()] ?? null);

export function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=["„“(]?[A-ZÄÖÜ0-9])/)
    .map(s => s.trim())
    .filter(s => /[\p{L}\d]/u.test(s));
}

export const words = s => (String(s).match(/[\p{L}\d]+(?:[-'’][\p{L}\d]+)*/gu) || []).length;

// Satzvorgabe aus dem Aufgabentext: „höchstens fünf Sätze“, „maximal drei Sätzen“, „zwei bis drei Sätze“
export function sentenceLimit(aufgabe) {
  const t = String(aufgabe || '');
  let m = t.match(/(\S+)\s+bis\s+(\S+)\s+Sätzen?\b/i);
  if (m && num(m[1]) && num(m[2])) return { min: num(m[1]), max: num(m[2]) };
  m = t.match(/(?:höchstens|maximal)\s+(\S+)\s+Sätzen?\b/i);
  if (m && num(m[1])) return { min: null, max: num(m[1]) };
  return null;
}

const count = (text, re) => (String(text).match(re) || []).length;
const SOFT = ['eigentlich', 'vielleicht', 'irgendwie', 'halt', 'sozusagen', 'quasi', 'eventuell', 'ein bisschen', 'ein wenig'];

// Liefert [{ ok, text, tipp? }]: ok = true für Erfülltes, false für einen Hinweis. tipp = ID aus content/tipps.json
export function analyze(text, aufgabe) {
  const out = [];
  const ss = sentences(text);
  if (!ss.length) return out;

  const lim = sentenceLimit(aufgabe);
  if (lim) {
    const range = lim.min ? `${lim.min} bis ${lim.max}` : `höchstens ${lim.max}`;
    const fits = ss.length <= lim.max && (!lim.min || ss.length >= lim.min);
    out.push(fits
      ? { ok: true, text: `${ss.length} ${ss.length === 1 ? 'Satz' : 'Sätze'}, passt zur Vorgabe (${range}).` }
      : { ok: false, text: `${ss.length} ${ss.length === 1 ? 'Satz' : 'Sätze'}, die Aufgabe verlangt ${range}.` });
  }

  const first = words(ss[0]);
  if (first > 20) out.push({ ok: false, text: `Dein erster Satz hat ${first} Wörter. Kürzer kommt die Kernaussage schneller an.`, tipp: 't01-kernaussage-zuerst' });
  else out.push({ ok: true, text: `Erster Satz knapp (${first} Wörter).` });

  const long = ss.slice(1).filter(s => words(s) > 25).length;
  if (long) out.push({ ok: false, text: `${long} ${long === 1 ? 'Satz hat' : 'Sätze haben'} mehr als 25 Wörter. Teilen macht es leichter lesbar.`, tipp: 't39-ein-gedanke-pro-satz' });

  const sorryBut = /(entschuldig|tut mir leid|sorry)[^.!?]*\baber\b/i.test(text);
  const aber = count(text, /\baber\b/gi);
  if (sorryBut) out.push({ ok: false, text: 'Nach der Entschuldigung folgt ein „aber“. Das nimmt sie zurück.', tipp: 't23-entschuldigung-ohne-aber' });
  else if (aber) out.push({ ok: false, text: `„aber“ kommt ${aber}-mal vor. Es entwertet leicht, was davor steht. Prüfe, ob „und“ passt.`, tipp: 't20-und-statt-aber' });

  const absolute = String(text).match(/\b(immer|nie|ständig|jedes Mal|niemals)\b/gi);
  if (absolute) out.push({ ok: false, text: `Verallgemeinerung: ${[...new Set(absolute.map(w => `„${w.toLowerCase()}“`))].join(', ')}. Das lädt zum Widerspruch ein.`, tipp: 't16-immer-nie' });

  if (/\bman\b/i.test(text)) out.push({ ok: false, text: '„man“ statt „ich“: Sprich für dich, das wirkt klarer.', tipp: 't22-ich-statt-man' });

  if (/\bdu bist\b/i.test(text)) out.push({ ok: false, text: '„Du bist …“ klingt schnell nach Urteil über die Person. Beschreib lieber das Verhalten.', tipp: 't17-vorwurf-in-wunsch' });

  const soft = SOFT.filter(w => new RegExp(`(^|[^\\p{L}])${w}(?![\\p{L}])`, 'iu').test(text));
  if (soft.length >= 2) out.push({ ok: false, text: `Weichmacher: ${soft.map(w => `„${w}“`).join(', ')}. Ohne sie klingt deine Aussage sicherer.` });

  if (out.every(h => h.ok)) out.push({ ok: true, text: 'Keine typischen Stolperstellen gefunden.' });
  return out;
}
