// Lokale Datenhaltung (localStorage) sowie Export und Import als JSON-Sicherung.
//
// Zustand:
//   entries[YYYY-MM-DD] { date, challengeId, bereich, typ, skips, answer, reflection, done, completedAt, feedback: [], selbstcheck?: [Index] }
//   cards[key]          { key: "technik:<id>" | "tipp:<id>", addedAt, due, interval, ease, reps, lapses, lastReview }
//   reviewLog[YYYY-MM-DD] Anzahl Wiederholungen
//   lastBackup          YYYY-MM-DD der letzten Sicherung oder null
//   plan                { start: YYYY-MM-DD | null, thema, days[YYYY-MM-DD] { week, done, note },
//                         checks[Woche] { date, fuellwoerter, sekunden, kernsatz, klarheit, ruhe, notiz, gespraech } }
//                         date = Tag der Messung; gespraech allein zählt nicht als Messung
// Version 2 ergänzt plan; Sicherungen aus Version 1 werden ohne Plan übernommen.
// feedback bleibt in Version 1 leer. Ein späterer Feedback-Dienst hängt seine Rückmeldungen
// dort an ({ source, text, createdAt }), ohne dass sich das Format ändert.
import { isDateKey } from './dates.js';
import { defaultPlan, WEEKS } from './plan.js';

export const STORAGE_KEY = 'klartext:v1';
export const SCHEMA_VERSION = 2;
export const APP_ID = 'klartext';

export const defaultState = () => ({ version: SCHEMA_VERSION, entries: {}, cards: {}, reviewLog: {}, plan: defaultPlan(), lastBackup: null });

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
      ...(Array.isArray(e.selbstcheck) ? { selbstcheck: [...new Set(e.selbstcheck.filter(i => Number.isInteger(i) && i >= 0 && i < 20))].sort((x, y) => x - y) } : {}),
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
  state.plan = validatePlan(obj(data.plan));
  state.lastBackup = isDateKey(data.lastBackup) ? data.lastBackup : null;
  return state;
}

function validatePlan(p) {
  const plan = defaultPlan();
  if (isDateKey(p.start)) plan.start = p.start;
  plan.thema = str(p.thema).slice(0, 200);
  for (const [date, d] of Object.entries(obj(p.days))) {
    if (!isDateKey(date) || !d || !isWeek(d.week)) continue;
    plan.days[date] = { week: d.week, done: d.done === true, note: str(d.note) };
  }
  for (const [w, c] of Object.entries(obj(p.checks))) {
    const week = Number(w);
    if (!isWeek(week) || String(week) !== w || !c) continue;
    plan.checks[week] = {
      date: isDateKey(c.date) ? c.date : null,
      fuellwoerter: int(c.fuellwoerter, 0, 999),
      sekunden: int(c.sekunden, 1, 3600),
      kernsatz: typeof c.kernsatz === 'boolean' ? c.kernsatz : null,
      klarheit: int(c.klarheit, 1, 10),
      ruhe: int(c.ruhe, 1, 10),
      notiz: str(c.notiz),
      gespraech: str(c.gespraech),
    };
  }
  return plan;
}

const isWeek = w => Number.isInteger(w) && w >= 1 && w <= WEEKS;
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = v => (typeof v === 'string' ? v : '');
const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
