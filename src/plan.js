// 12-Wochen-Plan: Wochen aus dem Startdatum, Fortschritt je Woche, Messwerte.
// Reine Funktionen ohne DOM, damit sie testbar bleiben.
import { addDays, diffDays } from './dates.js';
import { pickForDay, alternativeForDay } from './daily.js';

export const WEEKS = 12;
export const DAYS_PER_WEEK = 7;

export const defaultPlan = () => ({ start: null, thema: '', days: {}, checks: {} });

// Woche 1 beginnt am Starttag. Vor dem Start 0, nach Woche 12 bleibt es bei 12 mit finished = true.
export function planPosition(start, today) {
  if (!start) return { week: 0, day: 0, started: false, finished: false };
  const diff = diffDays(start, today);
  if (diff < 0) return { week: 0, day: 0, started: false, finished: false };
  const raw = Math.floor(diff / DAYS_PER_WEEK) + 1;
  return {
    week: Math.min(raw, WEEKS),
    day: raw > WEEKS ? DAYS_PER_WEEK : (diff % DAYS_PER_WEEK) + 1,
    started: true,
    finished: raw > WEEKS,
  };
}

// Kalendertage einer Planwoche (für die Anzeige der sieben Tage)
export function weekDates(start, week) {
  const first = addDays(start, (week - 1) * DAYS_PER_WEEK);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(first, i));
}

// Geübte Tage einer Woche. Zählt nach der Woche, die beim Abhaken gespeichert wurde,
// damit ein Verschieben des Plans die Vergangenheit nicht umsortiert.
export function trainedDays(days, week) {
  return Object.values(days).filter(d => d.done && d.week === week).length;
}

export const phaseOf = (phasen, week) => phasen.find(p => p.wochen.includes(week)) || null;

// Füllwörter pro Minute, auf eine Nachkommastelle. null, wenn Werte fehlen.
export function fillerRate(check) {
  if (!check || !Number.isFinite(check.fuellwoerter) || !Number.isFinite(check.sekunden) || check.sekunden <= 0) return null;
  return Math.round((check.fuellwoerter / check.sekunden) * 600) / 10;
}

// Messwerte aufsteigend nach Woche, nur Wochen mit mindestens einem Wert
export function checkSeries(checks) {
  return Object.entries(checks)
    .map(([w, c]) => ({ week: Number(w), rate: fillerRate(c), klarheit: Number.isFinite(c.klarheit) ? c.klarheit : null, kernsatz: typeof c.kernsatz === 'boolean' ? c.kernsatz : null }))
    .filter(r => r.rate !== null || r.klarheit !== null || r.kernsatz !== null)
    .sort((a, b) => a.week - b.week);
}

// Vergleich zweier Wochen; Werte fehlen → null
export function compareChecks(checks, fromWeek, toWeek) {
  const a = checks[fromWeek], b = checks[toWeek];
  if (!a || !b) return null;
  const ra = fillerRate(a), rb = fillerRate(b);
  return {
    rate: ra !== null && rb !== null ? { from: ra, to: rb, diff: Math.round((rb - ra) * 10) / 10 } : null,
    klarheit: Number.isFinite(a.klarheit) && Number.isFinite(b.klarheit) ? { from: a.klarheit, to: b.klarheit, diff: b.klarheit - a.klarheit } : null,
  };
}

// Impuls des Tages (Begriff, Thema, Frage) aus Textlisten; n = 0 ist der Tagesimpuls, n > 0 Alternativen.
export function impulse(list, date, kind, n = 0) {
  if (!list?.length) return null;
  const items = list.map((text, i) => ({ id: `${kind}-${String(i).padStart(3, '0')}`, text }));
  return (n > 0 ? alternativeForDay(items, date, n, `impuls:${kind}`) : pickForDay(items, date, `impuls:${kind}`)).text;
}

// Plan um eine Woche verlängern: Start eine Woche später, die aktuelle Woche läuft noch einmal.
export const extendPlan = plan => ({ ...plan, start: addDays(plan.start, DAYS_PER_WEEK) });
