// Oberfläche: Hash-Routing, Rendern als Template-Strings, Ereignisse per Delegation.
import { todayKey, addDays, formatDe, isDateKey } from './dates.js';
import { pickForDay, alternativeForDay } from './daily.js';
import { GRADES, GRADE_LABELS, cardKey, newCard, gradeCard, nextInterval, dueCards } from './srs.js';
import { createStore, exportState, importState } from './store.js';
import { currentStreak, longestStreak, stats } from './progress.js';
import { provider as feedbackProvider } from './feedback.js';

const store = createStore(localStorage);
let S = store.load();
let C = null; // Inhalte aus content/
const ui = { revealed: false, session: 0, techQuery: '', tipCat: '' };
let installPrompt = null; // vom Browser angebotene Installation (Chrome, Edge, Android)

// ---------- Hilfsfunktionen ----------
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const today = () => todayKey();
const save = () => { if (!store.save(S)) toast('Speichern fehlgeschlagen. Ist der Browser im privaten Modus oder der Speicher voll?'); };
const coarse = () => matchMedia('(pointer: coarse)').matches;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

const tech = id => C.techniken.find(t => t.id === id);
const tip = id => C.tipps.find(t => t.id === id);
const challenge = id => C.challenges.find(c => c.id === id);
const BEREICH = { beruflich: 'Beruflich', privat: 'Privat' };
const TYP = { schriftlich: 'Schriftlich', alltag: 'Im Alltag' };

function cardContent(key) {
  const [type, id] = key.split(':');
  const item = type === 'technik' ? tech(id) : tip(id);
  return item ? { type, item } : null;
}

// ---------- Tagesdaten ----------
function challengeFor(date) {
  const e = S.entries[date];
  if (e) return challenge(e.challengeId) || null;
  return pickForDay(C.challenges, date, 'challenge');
}

function ensureEntry(date) {
  if (!S.entries[date]) {
    const c = challengeFor(date);
    S.entries[date] = { date, challengeId: c.id, bereich: c.bereich, typ: c.typ, skips: 0, answer: '', reflection: '', done: false, completedAt: null, feedback: [] };
  }
  return S.entries[date];
}

function addCard(type, id) {
  const key = cardKey(type, id);
  if (S.cards[key]) return false;
  S.cards[key] = newCard(key, today());
  return true;
}

const liveCards = () => Object.values(S.cards).filter(c => cardContent(c.key));
const dueList = () => dueCards(liveCards(), today());

// ---------- Kopfzeile ----------
function topBar(title, back, right = '') {
  $('#top').innerHTML = `<a class="icon-btn" href="${back}" aria-label="Zurück">${I.back}</a><h1>${esc(title)}</h1>${right || '<span class="spacer"></span>'}`;
}

// ---------- Start ----------
function viewHome() {
  const d = today();
  $('#top').innerHTML = `<span class="mark">klartext<i></i></span><a class="icon-btn" href="#/verlauf" aria-label="Fortschritt">${I.chart}</a>`;
  const c = challengeFor(d) || { titel: 'Challenge nicht mehr im Inhalt', bereich: 'beruflich', typ: 'schriftlich' };
  const e = S.entries[d];
  const streak = currentStreak(S.entries, d);
  const due = dueList().length;
  const t = pickForDay(C.tipps, d, 'tipp');
  const tipSaved = !!S.cards[cardKey('tipp', t.id)];
  const done = Object.values(S.entries).filter(x => x.done).length;
  app.innerHTML = `
    <section class="hero">
      <div class="big">${streak}</div>
      <div class="hero-meta"><strong>${streak === 1 ? 'Tag' : 'Tage'} in Folge</strong><span class="mono dim">${plural(done, 'Challenge', 'Challenges')} · ${due} fällig</span></div>
    </section>
    <section class="stack">
      <span class="label">${esc(formatDe(d))}</span>
      <ul class="rows">
        <li><a class="row-btn" href="#/challenge"><span class="name">${esc(c.titel)}<span class="sub">${BEREICH[c.bereich]} · ${TYP[c.typ]}</span></span><span class="meta mono ${e?.done ? 'dim' : 'open'}">${e?.done ? 'erledigt' : 'offen'}</span></a></li>
        <li><a class="row-btn" href="#/wiederholen"><span class="name">Wiederholung<span class="sub">${plural(liveCards().length, 'Karte', 'Karten')} im Plan</span></span><span class="meta mono ${due ? 'open' : 'dim'}">${due ? `${due} fällig` : liveCards().length ? 'erledigt' : 'leer'}</span></a></li>
      </ul>
      <a class="btn ${e?.done ? '' : 'primary'} wide" href="${e?.done && due ? '#/wiederholen' : '#/challenge'}">${e?.done ? (due ? 'Wiederholen' : 'Heutige Challenge ansehen') : 'Challenge starten'}</a>
    </section>
    <section class="stack tip-day">
      <span class="label">Tipp des Tages</span>
      <div class="tip" style="padding:0">
        <h3>${esc(t.titel)}</h3>
        <p>${esc(t.text)}</p>
        <div class="row">${t.technik ? `<a class="link" href="#/technik/${esc(t.technik)}">${esc(tech(t.technik)?.name)}</a>` : ''}
          <button class="link ${tipSaved ? 'on' : ''}" data-act="save-tip" data-id="${esc(t.id)}">${tipSaved ? 'In Wiederholung' : '+ Merken'}</button></div>
      </div>
    </section>
    <section class="stack">
      <span class="label">Bibliothek</span>
      <ul class="rows">
        <li><a class="row-btn" href="#/techniken"><span class="name">Techniken</span><span class="meta mono dim">${C.techniken.length}</span></a></li>
        <li><a class="row-btn" href="#/tipps"><span class="name">Tipps &amp; Kniffe</span><span class="meta mono dim">${C.tipps.length}</span></a></li>
        <li><a class="row-btn" href="#/verlauf"><span class="name">Fortschritt &amp; Verlauf</span><span class="meta mono dim">${done}</span></a></li>
      </ul>
    </section>`;
}

// ---------- Challenge ----------
function viewChallenge(date) {
  const isToday = date === today();
  const c = challengeFor(date);
  if (!c) { topBar('Challenge', '#/'); app.innerHTML = '<div class="empty"><p>Diese Challenge gibt es nicht mehr im Inhalt.</p></div>'; return; }
  const e = S.entries[date] || { answer: '', reflection: '', done: false, feedback: [] };
  const written = c.typ === 'schriftlich';
  topBar(isToday ? 'Heute' : formatDe(date, false), isToday ? '#/' : '#/verlauf');
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">${BEREICH[c.bereich]} · ${TYP[c.typ]}</span>
      <h2 class="headline">${esc(c.titel)}</h2>
      <p class="prose">${esc(c.situation)}</p>
      <p class="prose task">${esc(c.aufgabe)}</p>
      <div class="chips">${c.techniken.map(id => `<a class="chip" href="#/technik/${esc(id)}">${esc(tech(id)?.name || id)}</a>`).join('')}</div>
    </section>
    <form id="ch" class="stack" autocomplete="off" data-date="${date}">
      ${written ? `<label class="lab"><span class="label">Deine Antwort</span>
        <textarea class="field" name="answer" rows="6" placeholder="Formuliere hier, was du sagen oder schreiben würdest …">${esc(e.answer)}</textarea></label>` : ''}
      <label class="lab"><span class="label">${written ? 'Reflexion (optional)' : 'Wie lief es?'}</span>
        <textarea class="field" name="reflection" rows="${written ? 3 : 5}" placeholder="${written ? 'Was fiel dir schwer, was nimmst du mit?' : 'Was hast du getan, wie hat dein Gegenüber reagiert?'}">${esc(e.reflection)}</textarea></label>
      ${c.reflexion?.length ? `<ul class="prompts">${c.reflexion.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
      ${e.done
        ? `<p class="status"><i></i>Erledigt${e.completedAt ? ` am ${esc(formatDe(todayKey(new Date(e.completedAt)), false))}` : ''}. Änderungen werden automatisch gespeichert.</p>`
        : `<button class="btn primary wide" type="submit">${written ? 'Abschließen' : 'Gemacht, abschließen'}</button>`}
      ${!e.done && isToday ? '<button type="button" class="link center" data-act="skip">Passt heute nicht? Andere Challenge</button>' : ''}
    </form>
    ${e.done && c.musterantwort ? `<details class="more"><summary>Eine mögliche Formulierung</summary><div><p class="quote">${esc(c.musterantwort)}</p><p class="source">Nur ein Beispiel. Deine Worte dürfen anders klingen.</p></div></details>` : ''}
    ${e.feedback?.length ? `<section class="stack"><span class="label">Feedback</span>${e.feedback.map(f => `<p class="quote">${esc(f.text)}</p>`).join('')}</section>` : ''}
    ${e.done && feedbackProvider ? `<button class="btn wide" data-act="feedback" data-date="${date}">Feedback holen</button>` : ''}`;
}

function onChallengeInput(form, field, value) {
  const e = ensureEntry(form.dataset.date);
  e[field] = value;
  save();
}

function completeChallenge(form) {
  const date = form.dataset.date;
  const c = challengeFor(date);
  const answer = form.answer?.value.trim() ?? '';
  const reflection = form.reflection.value.trim();
  if (c.typ === 'schriftlich' && !answer) { toast('Schreib zuerst deine Antwort.'); form.answer.focus(); return; }
  if (c.typ === 'alltag' && !reflection) { toast('Notier kurz, wie es lief.'); form.reflection.focus(); return; }
  const e = ensureEntry(date);
  Object.assign(e, { answer, reflection, done: true, completedAt: new Date().toISOString() });
  const added = c.techniken.filter(id => tech(id) && addCard('technik', id)).length;
  save();
  render();
  scrollTo(0, 0);
  toast(added ? `Erledigt. ${plural(added, 'Technik', 'Techniken')} neu in der Wiederholung.` : 'Erledigt.');
}

function skipChallenge() {
  const d = today();
  const e = ensureEntry(d);
  if ((e.answer || e.reflection) && !confirm('Deine Notizen zu dieser Challenge gehen verloren. Trotzdem wechseln?')) return;
  e.skips += 1;
  const c = alternativeForDay(C.challenges, d, e.skips, 'challenge');
  Object.assign(e, { challengeId: c.id, bereich: c.bereich, typ: c.typ, answer: '', reflection: '' });
  save();
  render();
}

// ---------- Techniken ----------
function viewTechniques() {
  topBar('Techniken', '#/');
  const q = ui.techQuery.toLowerCase();
  const list = C.techniken.filter(t => !q || `${t.name} ${t.urheber} ${t.kategorie} ${t.kurz}`.toLowerCase().includes(q));
  const cats = [...new Set(list.map(t => t.kategorie))];
  app.innerHTML = `
    <input class="field" id="tech-q" type="search" placeholder="Suchen …" value="${esc(ui.techQuery)}" aria-label="Techniken durchsuchen">
    <div id="tech-list" class="stack" style="gap:36px">${cats.length ? cats.map(cat => `
      <section class="stack"><span class="label">${esc(cat)}</span><ul class="rows">${list.filter(t => t.kategorie === cat).map(t => `
        <li><a class="row-btn" href="#/technik/${esc(t.id)}"><span class="name">${esc(t.name)}<span class="sub">${esc(t.urheber)}</span></span><span class="meta mono ${S.cards[cardKey('technik', t.id)] ? 'open' : 'dim'}">${S.cards[cardKey('technik', t.id)] ? 'im Plan' : ''}</span></a></li>`).join('')}
      </ul></section>`).join('') : '<div class="empty"><p>Nichts gefunden.</p></div>'}</div>`;
}

function viewTechnique(id) {
  const t = tech(id);
  topBar('Technik', '#/techniken');
  if (!t) { app.innerHTML = '<div class="empty"><p>Diese Technik gibt es nicht.</p></div>'; return; }
  const card = S.cards[cardKey('technik', id)];
  const used = C.challenges.filter(c => c.techniken.includes(id));
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">${esc(t.kategorie)}</span>
      <h2 class="headline">${esc(t.name)}</h2>
      <p class="prose">${esc(t.kurz)}</p>
    </section>
    <section class="stack"><span class="label">So geht's</span><ol class="steps">${t.schritte.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
    <section class="stack"><span class="label">Beispiel</span><p class="quote">${esc(t.beispiel)}</p></section>
    <section class="stack"><span class="label">Übung</span><p class="prose task">${esc(t.uebung)}</p></section>
    <section class="stack"><span class="label">Merksatz</span><p class="prose">${esc(t.merksatz)}</p></section>
    <section class="stack">
      ${card ? `<p class="dim mono" style="margin:0">Im Wiederholungsplan · nächste Abfrage ${esc(formatDe(card.due, false))}</p>
        <button class="btn wide danger" data-act="drop-card" data-key="${card.key}">Aus der Wiederholung nehmen</button>`
      : `<button class="btn primary wide" data-act="add-tech" data-id="${esc(t.id)}">In die Wiederholung aufnehmen</button>`}
    </section>
    <section class="stack"><span class="label">Quelle</span><p class="source"><strong>${esc(t.urheber)}</strong><br>${esc(t.quelle)}</p></section>
    ${used.length ? `<section class="stack"><span class="label">Kommt vor in</span><p class="source">${used.map(c => esc(c.titel)).join(' · ')}</p></section>` : ''}`;
}

// ---------- Tipps ----------
function viewTips() {
  topBar('Tipps & Kniffe', '#/');
  const cats = [...new Set(C.tipps.map(t => t.kategorie))];
  const list = C.tipps.filter(t => !ui.tipCat || t.kategorie === ui.tipCat);
  app.innerHTML = `
    <div class="chips"><button class="chip ${ui.tipCat ? '' : 'on'}" data-act="tip-cat" data-cat="">Alle</button>${cats.map(c => `<button class="chip ${ui.tipCat === c ? 'on' : ''}" data-act="tip-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <ul class="rows">${list.map(t => {
      const saved = !!S.cards[cardKey('tipp', t.id)];
      return `<li class="tip"><span class="label">${esc(t.kategorie)}</span><h3>${esc(t.titel)}</h3><p>${esc(t.text)}</p>
        <div class="row">${t.technik ? `<a class="link" href="#/technik/${esc(t.technik)}">${esc(tech(t.technik)?.name)}</a>` : ''}
        <button class="link ${saved ? 'on' : ''}" data-act="save-tip" data-id="${esc(t.id)}">${saved ? 'In Wiederholung' : '+ Merken'}</button></div></li>`;
    }).join('')}</ul>`;
}

// ---------- Wiederholung ----------
function viewReview() {
  const due = dueList();
  const total = due.length + ui.session;
  topBar('Wiederholung', '#/', `<span class="count">${due.length ? `${ui.session + 1}/${total}` : ''}</span>`);
  if (!due.length) {
    const cards = Object.values(S.cards).filter(c => cardContent(c.key)).sort((a, b) => (a.due < b.due ? -1 : 1));
    app.innerHTML = `
      <section class="done">
        <span class="label">${ui.session ? 'Runde beendet' : 'Nichts fällig'}</span>
        <h2>${ui.session ? `${plural(ui.session, 'Karte', 'Karten')} wiederholt.` : 'Alles auf Stand.'}</h2>
        <p>${cards.length ? `Nächste Abfrage: ${esc(formatDe(cards[0].due))}.` : 'Noch keine Karten im Plan. Schließ eine Challenge ab oder nimm Techniken und Tipps auf, dann kommen sie hier in wachsenden Abständen wieder.'}</p>
      </section>
      ${cards.length ? `<section class="stack"><span class="label">Im Plan</span><ul class="rows">${cards.map(c => {
        const { type, item } = cardContent(c.key);
        return `<li><a class="row-btn" href="${type === 'technik' ? `#/technik/${esc(item.id)}` : '#/tipps'}"><span class="name">${esc(item.name || item.titel)}<span class="sub">${type === 'technik' ? 'Technik' : 'Tipp'}</span></span><span class="meta mono dim">${esc(c.due.slice(8, 10) + '.' + c.due.slice(5, 7) + '.')}</span></a></li>`;
      }).join('')}</ul></section>` : ''}`;
    return;
  }
  const card = due[0];
  const { type, item } = cardContent(card.key);
  const back = type === 'technik'
    ? `<p class="term">${esc(item.kurz)}</p><ul>${item.schritte.map(s => `<li>${esc(s)}</li>`).join('')}</ul><p class="merksatz">${esc(item.merksatz)}</p>`
    : `<p class="term">${esc(item.text)}</p>`;
  app.innerHTML = `
    <div class="bar"><i style="width:${(ui.session / total) * 100}%"></i></div>
    <section class="stage knowledge">
      <div class="side"><span class="label">${type === 'technik' ? 'Technik' : 'Tipp'}</span><p class="term">${esc(item.name || item.titel)}</p>
        ${ui.revealed ? '' : `<p class="note">${type === 'technik' ? 'Worum geht es, und wie gehst du vor? Erst selbst erinnern, dann aufdecken.' : 'Was steckt hinter dem Tipp, und wann nutzt du ihn?'}</p>`}</div>
      ${ui.revealed ? `<span class="rule"></span><div class="side ans">${back}</div>` : ''}
    </section>
    ${ui.revealed
      ? `<div class="grades">${GRADES.map((g, i) => `<button class="grade g${i}" data-act="grade" data-grade="${g}"><span class="dot"></span><b>${GRADE_LABELS[g]}</b><small>${fmtInterval(nextInterval(card, g))}</small></button>`).join('')}</div>`
      : '<button class="btn primary wide" data-act="reveal">Aufdecken</button>'}
    <p class="keys">Leertaste deckt auf · 1–4 bewertet</p>`;
}

const fmtInterval = d => (d === 1 ? '1 Tag' : d < 30 ? `${d} Tage` : d < 365 ? `${Math.round(d / 30)} Mon.` : '1 Jahr');

function grade(g) {
  const card = dueList()[0];
  if (!card) return;
  const d = today();
  S.cards[card.key] = gradeCard(card, g, d);
  S.reviewLog[d] = (S.reviewLog[d] || 0) + 1;
  save();
  ui.session += 1;
  ui.revealed = false;
  render();
}

// ---------- Fortschritt ----------
function viewProgress() {
  topBar('Fortschritt', '#/');
  const d = today();
  const st = stats(S.entries);
  const reviews = Object.values(S.reviewLog).reduce((a, b) => a + b, 0);
  const entries = Object.values(S.entries).filter(e => e.done || e.answer || e.reflection).sort((a, b) => (a.date < b.date ? 1 : -1));
  const days = Array.from({ length: 28 }, (_, i) => addDays(d, i - 27));
  app.innerHTML = `
    <section class="kpis">
      <div><b>${currentStreak(S.entries, d)}</b><span>Serie</span></div>
      <div><b>${longestStreak(S.entries)}</b><span>Längste Serie</span></div>
      <div><b>${st.total}</b><span>Challenges</span></div>
      <div><b>${st.beruflich}<span class="dim" style="font-size:18px"> / ${st.privat}</span></b><span>Beruflich / Privat</span></div>
      <div><b>${liveCards().length}</b><span>Karten im Plan</span></div>
      <div><b>${reviews}</b><span>Wiederholungen</span></div>
    </section>
    <section class="stack"><span class="label">Letzte 4 Wochen</span>
      <div class="days">${days.map(k => `<i class="${S.entries[k]?.done ? 'on' : ''} ${k === d ? 'today' : ''}" title="${esc(formatDe(k))}"></i>`).join('')}</div></section>
    <section class="stack"><span class="label">Deine Antworten und Reflexionen</span>
      ${entries.length ? `<ul class="rows">${entries.map(e => {
        const c = challenge(e.challengeId);
        return `<li><a class="row-btn" href="#/challenge/${e.date}"><span class="name">${esc(c?.titel || e.challengeId)}<span class="sub">${esc(firstLine(e.answer || e.reflection))}</span></span><span class="meta mono ${e.done ? 'dim' : 'open'}">${esc(e.date.slice(8, 10) + '.' + e.date.slice(5, 7) + '.')}${e.done ? '' : ' · offen'}</span></a></li>`;
      }).join('')}</ul>` : '<div class="empty"><p>Noch nichts erledigt. Die erste Challenge wartet auf der Startseite.</p></div>'}
    </section>
    <section class="section">
      <span class="label">Daten</span>
      <p>Alles liegt nur in diesem Browser auf diesem Gerät. Exportiere regelmäßig eine Sicherung, damit nichts verloren geht, und um den Stand auf ein anderes Gerät zu übertragen.</p>
      <div class="row"><button class="btn grow" data-act="export">Sicherung exportieren</button>
        <label class="btn grow filebtn">Sicherung importieren<input type="file" id="import" accept="application/json,.json"></label></div>
    </section>
    <section class="section" id="install">
      <span class="label">App</span>
      ${matchMedia('(display-mode: standalone)').matches
        ? '<p>Klartext läuft als installierte App.</p>'
        : installPrompt
          ? '<p>Als eigene App installieren: eigenes Symbol, eigenes Fenster, funktioniert offline.</p><button class="btn primary wide" data-act="install">App installieren</button>'
          : '<p>Installieren über das Browsermenü: am iPhone Teilen → Zum Home-Bildschirm, am Rechner das Installieren-Symbol in der Adressleiste.</p>'}
    </section>`;
}

const firstLine = s => { const t = (s || '').trim().split('\n')[0]; return t.length > 70 ? t.slice(0, 70) + ' …' : t; };

function exportData() {
  const blob = new Blob([exportState(S)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `klartext-sicherung-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Sicherung exportiert.');
}

async function importData(file) {
  try {
    const next = importState(await file.text());
    const n = Object.keys(next.entries).length;
    if (!confirm(`Sicherung mit ${plural(n, 'Tageseintrag', 'Tageseinträgen')} und ${plural(Object.keys(next.cards).length, 'Karte', 'Karten')} laden? Der aktuelle Stand auf diesem Gerät wird ersetzt. Tipp: Vorher den aktuellen Stand exportieren.`)) return;
    S = next;
    save();
    render();
    toast('Sicherung importiert.');
  } catch (err) {
    toast(err.message);
  }
}

// ---------- Routing ----------
function render() {
  if (!C) return;
  const [, route = '', arg] = location.hash.split('/');
  if (route !== 'wiederholen') { ui.session = 0; ui.revealed = false; }
  switch (route) {
    // Nur heute oder Tage mit vorhandenem Eintrag, damit sich über die URL keine Tage abschließen lassen
    case 'challenge': return arg && !(isDateKey(arg) && (arg === today() || S.entries[arg])) ? viewHome() : viewChallenge(arg || today());
    case 'techniken': return viewTechniques();
    case 'technik': return viewTechnique(arg);
    case 'tipps': return viewTips();
    case 'wiederholen': return viewReview();
    case 'verlauf': return viewProgress();
    default: return viewHome();
  }
}

addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

// Installierte App und Browser-Tab gleichzeitig offen: Änderungen des anderen Fensters übernehmen statt überschreiben
addEventListener('storage', e => {
  if (e.key !== 'klartext:v1') return;
  S = store.load();
  if (!document.activeElement?.matches('textarea')) render();
});

// Tageswechsel, während die App offen bleibt
let shownDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== shownDay) { shownDay = today(); render(); }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act } = el.dataset;
  if (act === 'save-tip') {
    const key = cardKey('tipp', el.dataset.id);
    if (S.cards[key]) delete S.cards[key]; else addCard('tipp', el.dataset.id);
    save(); render();
    toast(S.cards[key] ? 'Gemerkt, kommt morgen in der Wiederholung.' : 'Aus der Wiederholung genommen.');
  } else if (act === 'add-tech') {
    addCard('technik', el.dataset.id); save(); render(); toast('Aufgenommen, erste Abfrage morgen.');
  } else if (act === 'drop-card') {
    delete S.cards[el.dataset.key]; save(); render(); toast('Aus der Wiederholung genommen.');
  } else if (act === 'skip') skipChallenge();
  else if (act === 'reveal') { ui.revealed = true; render(); }
  else if (act === 'grade') grade(el.dataset.grade);
  else if (act === 'tip-cat') { ui.tipCat = el.dataset.cat; render(); }
  else if (act === 'export') exportData();
  else if (act === 'install' && installPrompt) installPrompt.prompt().then(() => installPrompt.userChoice).then(r => { if (r.outcome === 'accepted') { installPrompt = null; render(); } });
  else if (act === 'feedback') requestFeedback(el.dataset.date);
});

// Nur aktiv, wenn in feedback.js ein Anbieter eingetragen ist.
async function requestFeedback(date) {
  const entry = S.entries[date];
  const c = challenge(entry.challengeId);
  try {
    const res = await feedbackProvider.review({ challenge: c, entry, techniques: c.techniken.map(tech).filter(Boolean) });
    if (!res?.text) return toast('Kein Feedback erhalten.');
    entry.feedback.push({ source: feedbackProvider.name, text: res.text, createdAt: new Date().toISOString() });
    save(); render();
  } catch (err) { toast(`Feedback fehlgeschlagen: ${err.message}`); }
}

document.addEventListener('input', e => {
  if (e.target.id === 'tech-q') {
    ui.techQuery = e.target.value;
    const pos = e.target.selectionStart;
    viewTechniques();
    const q = $('#tech-q'); q.focus(); q.setSelectionRange(pos, pos);
  } else if (e.target.form?.id === 'ch') onChallengeInput(e.target.form, e.target.name, e.target.value);
});

document.addEventListener('change', e => {
  if (e.target.id === 'import' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'ch') { e.preventDefault(); completeChallenge(e.target); }
});

document.addEventListener('keydown', e => {
  if (location.hash !== '#/wiederholen' || e.target.matches('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ' && !ui.revealed && dueList().length) { e.preventDefault(); ui.revealed = true; render(); }
  else if (ui.revealed && ['1', '2', '3', '4'].includes(e.key)) grade(GRADES[Number(e.key) - 1]);
});

// ---------- Start ----------
async function loadContent() {
  const get = name => fetch(`content/${name}.json`).then(r => { if (!r.ok) throw new Error(`content/${name}.json: ${r.status}`); return r.json(); });
  const [techniken, challenges, tipps] = await Promise.all(['techniken', 'challenges', 'tipps'].map(get));
  return { techniken, challenges, tipps };
}

loadContent().then(c => { C = c; render(); }).catch(err => {
  $('#top').innerHTML = '<span class="mark">klartext<i></i></span>';
  app.innerHTML = `<div class="empty"><p>Die Inhalte konnten nicht geladen werden (${esc(err.message)}). Starte die App über einen lokalen Server, nicht per Doppelklick auf die Datei.</p></div>`;
});

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; render(); });
addEventListener('appinstalled', () => { installPrompt = null; render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
