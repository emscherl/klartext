// Kalendertage als Text "YYYY-MM-DD" in lokaler Zeit. Rechnen über UTC, damit Sommerzeit nicht stört.
const DAY = 86400000;

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dayNumber(key) {
  const [y, m, d] = parse(key);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function fromDayNumber(n) {
  const d = new Date(n * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (key, n) => fromDayNumber(dayNumber(key) + n);
export const diffDays = (from, to) => dayNumber(to) - dayNumber(from);

export function isDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return fromDayNumber(dayNumber(key)) === key;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function formatDe(key, withWeekday = true) {
  const [y, m, d] = parse(key);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${withWeekday ? wd + ', ' : ''}${d}. ${MONTHS[m - 1]} ${y}`;
}

function parse(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Ungültiges Datum: ${key}`);
  return key.split('-').map(Number);
}

const pad = n => String(n).padStart(2, '0');
