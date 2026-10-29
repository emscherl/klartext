// Tagesauswahl: deterministisch aus dem Datum, ohne Zufall zur Laufzeit.
// Alle Einträge laufen in Runden durch. Jede Runde ist eine eigene gemischte Reihenfolge,
// innerhalb einer Runde kommt nichts doppelt, und an der Rundengrenze nie zweimal dasselbe.
import { dayNumber } from './dates.js';

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, seed) {
  const out = [...items];
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function roundOrder(sorted, round, salt) {
  const order = shuffle(sorted, `${salt}:${round}`);
  if (sorted.length > 2) {
    const prev = shuffle(sorted, `${salt}:${round - 1}`);
    if (order[0].id === prev[prev.length - 1].id) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

// Eintrag für einen Tag. salt trennt unabhängige Reihen (Challenge, Tipp).
export function pickForDay(items, dateKey, salt = 'klartext') {
  if (!items.length) return null;
  const sorted = [...items].sort(byId);
  const n = sorted.length;
  const day = dayNumber(dateKey);
  const round = Math.floor(day / n);
  return roundOrder(sorted, round, salt)[day - round * n];
}

// Ersatz, wenn die Tages-Challenge nicht passt. skip = 1, 2, … liefert weitere Alternativen,
// nie die ursprüngliche Tages-Challenge, am selben Tag immer dieselbe Folge.
export function alternativeForDay(items, dateKey, skip, salt = 'klartext') {
  const main = pickForDay(items, dateKey, salt);
  if (!main || skip <= 0) return main;
  const rest = shuffle([...items].sort(byId).filter(i => i.id !== main.id), `${salt}:alt:${dateKey}`);
  return rest.length ? rest[(skip - 1) % rest.length] : main;
}
