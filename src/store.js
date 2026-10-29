// Lokale Datenhaltung (localStorage) sowie Export und Import als JSON-Sicherung.
//
// Zustand:
//   entries[YYYY-MM-DD] { date, challengeId, bereich, typ, skips, answer, reflection, done, completedAt, feedback: [] }
//   cards[key]          { key: "technik:<id>" | "tipp:<id>", addedAt, due, interval, ease, reps, lapses, lastReview }
//   reviewLog[YYYY-MM-DD] Anzahl Wiederholungen
// feedback bleibt in Version 1 leer. Ein späterer Feedback-Dienst hängt seine Rückmeldungen
// dort an ({ source, text, createdAt }), ohne dass sich das Format ändert.
import { isDateKey } from './dates.js';

export const STORAGE_KEY = 'klartext:v1';
export const SCHEMA_VERSION = 1;
export const APP_ID = 'klartext';

export const defaultState = () => ({ version: SCHEMA_VERSION, entries: {}, cards: {}, reviewLog: {} });

export function createStore(storage) {
  return {
    load() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? validate(JSON.parse(raw)) : defaultState();
      } catch (e) {
        // Rohinhalt aufheben, damit der nächste Speichervorgang nichts unwiderruflich überschreibt
        try { storage.setItem(`${STORAGE_KEY}:defekt`, storage.getItem(STORAGE_KEY)); } catch {}
        console.error('Gespeicherte Daten unlesbar, starte leer. Rohdaten liegen unter', `${STORAGE_KEY}:defekt`, e);
        return defaultState();
      }
    },
    // Gibt false zurück, wenn der Browser das Speichern verweigert (voll, privater Modus)
    save(state) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (e) { console.error(e); return false; }
    },
  };
}

export function exportState(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, exportedAt: now.toISOString(), ...state }, null, 2);
}

export function importState(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!data || typeof data !== 'object' || data.app !== APP_ID) throw new Error('Die Datei ist keine Klartext-Sicherung.');
  return validate(data);
}

// Prüft Form und Inhalte, verwirft kaputte Einträge statt alles abzulehnen.
export function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Ungültige Daten.');
  if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  }
  const state = defaultState();
  for (const [date, e] of Object.entries(obj(data.entries))) {
    if (!isDateKey(date) || !e || typeof e.challengeId !== 'string') continue;
    state.entries[date] = {
      date,
      challengeId: e.challengeId,
      bereich: str(e.bereich),
      typ: str(e.typ),
      skips: Number.isInteger(e.skips) && e.skips >= 0 ? e.skips : 0,
      answer: str(e.answer),
      reflection: str(e.reflection),
      done: e.done === true,
      completedAt: typeof e.completedAt === 'string' && !Number.isNaN(Date.parse(e.completedAt)) ? e.completedAt : null,
      feedback: Array.isArray(e.feedback) ? e.feedback.filter(f => f && typeof f.text === 'string') : [],
    };
  }
  for (const [key, c] of Object.entries(obj(data.cards))) {
    if (!/^(technik|tipp):[\w-]+$/.test(key) || !c || !isDateKey(c.due)) continue;
    state.cards[key] = {
      key,
      addedAt: isDateKey(c.addedAt) ? c.addedAt : c.due,
      due: c.due,
      interval: num(c.interval, 0),
      ease: Math.max(1.3, num(c.ease, 2.5)),
      reps: num(c.reps, 0),
      lapses: num(c.lapses, 0),
      lastReview: isDateKey(c.lastReview) ? c.lastReview : null,
    };
  }
  for (const [date, n] of Object.entries(obj(data.reviewLog))) {
    if (isDateKey(date) && Number.isFinite(n) && n >= 0) state.reviewLog[date] = n;
  }
  return state;
}

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = v => (typeof v === 'string' ? v : '');
const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
