// Wiederholung in wachsenden Abständen, angelehnt an SM-2 (Wozniak).
// Eine Karte ist ein Lerneintrag (Technik oder Tipp); die Inhalte selbst stehen in content/.
import { addDays } from './dates.js';

export const GRADES = ['nochmal', 'schwer', 'gut', 'leicht'];
export const GRADE_LABELS = { nochmal: 'Nochmal', schwer: 'Schwer', gut: 'Gut', leicht: 'Leicht' };
const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;

export const cardKey = (type, id) => `${type}:${id}`;

// Neu aufgenommen: erste Wiederholung am nächsten Tag.
export function newCard(key, today) {
  return { key, addedAt: today, due: addDays(today, 1), interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReview: null };
}

export function nextInterval(card, grade) {
  const { interval, ease, reps } = card;
  switch (grade) {
    case 'nochmal': return 1;
    case 'schwer': return interval === 0 ? 1 : cap(Math.max(interval + 1, Math.round(interval * 1.2)));
    case 'gut': return cap(reps === 0 ? 3 : reps === 1 ? 7 : Math.max(interval + 1, Math.round(interval * ease)));
    case 'leicht': return cap(reps === 0 ? 5 : reps === 1 ? 12 : Math.max(interval + 2, Math.round(interval * (ease + 0.15) * 1.3)));
    default: throw new Error(`Unbekannte Bewertung: ${grade}`);
  }
}

export function gradeCard(card, grade, today) {
  const interval = nextInterval(card, grade);
  let { ease, reps, lapses } = card;
  if (grade === 'nochmal') { reps = 0; lapses += 1; ease = Math.max(MIN_EASE, ease - 0.2); }
  else if (grade === 'schwer') { reps += 1; ease = Math.max(MIN_EASE, ease - 0.15); }
  else if (grade === 'gut') { reps += 1; }
  else { reps += 1; ease += 0.15; }
  return { ...card, interval, ease: Math.round(ease * 100) / 100, reps, lapses, lastReview: today, due: addDays(today, interval) };
}

export const isDue = (card, today) => card.due <= today;

export function dueCards(cards, today) {
  return cards.filter(c => isDue(c, today)).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.key < b.key ? -1 : 1));
}

const cap = n => Math.min(n, MAX_INTERVAL);
