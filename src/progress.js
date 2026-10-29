// Serie und Kennzahlen aus den Tageseinträgen.
import { addDays, diffDays } from './dates.js';

export const doneDates = entries => Object.values(entries).filter(e => e.done).map(e => e.date).sort();

// Serie zählt bis heute; ist heute noch offen, zählt sie bis gestern weiter.
export function currentStreak(entries, today) {
  const done = new Set(doneDates(entries));
  let day = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export function longestStreak(entries) {
  const dates = doneDates(entries);
  let best = 0, run = 0;
  dates.forEach((d, i) => {
    run = i > 0 && diffDays(dates[i - 1], d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export function stats(entries) {
  const done = Object.values(entries).filter(e => e.done);
  return {
    total: done.length,
    beruflich: done.filter(e => e.bereich === 'beruflich').length,
    privat: done.filter(e => e.bereich === 'privat').length,
    schriftlich: done.filter(e => e.typ === 'schriftlich').length,
    alltag: done.filter(e => e.typ === 'alltag').length,
  };
}
