// Oberfläche: Hash-Routing, Rendern als Template-Strings, Ereignisse per Delegation.
import { todayKey, addDays, formatDe, isDateKey } from './dates.js';
import { pickForDay, alternativeForDay } from './daily.js';
import { GRADES, GRADE_LABELS, cardKey, newCard, gradeCard, nextInterval, dueCards } from './srs.js';
import { createStore, exportState, importState } from './store.js';
import { currentStreak, longestStreak, stats } from './progress.js';
import { provider as feedbackProvider, claudePrompt, claudeUrl } from './feedback.js';
import { analyze } from './selfcheck.js';
import { WEEKS, defaultPlan, planPosition, weekDates, trainedDays, phaseOf, fillerRate, checkSeries, compareChecks, impulse, extendPlan, backupDue } from './plan.js';
import { recordingSupported, startRecording, saveRecording, loadRecording, deleteRecording, clearRecordings } from './recorder.js';

const store = createStore(localStorage);
let S = store.load();
let C = null; // Inhalte aus content/
const ui = { revealed: false, session: 0, techQuery: '', tipCat: '', impulseSkip: {} };
let installPrompt = null; // vom Browser angebotene Installation (Chrome, Edge, Android)

// ---------- Hilfsfunktionen ----------
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
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
    ${backupNotice()}
    <section class="stack">
      <span class="label">${esc(formatDe(d))}</span>
      <ul class="rows">
        ${planRow(d)}
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

function planRow(d) {
  const pos = planPosition(S.plan.start, d);
  if (!pos.started) {
    const sub = S.plan.start ? `Beginnt am ${formatDe(S.plan.start, false)}` : 'Klar, strukturiert und ruhig sprechen';
    return `<li><a class="row-btn" href="#/plan"><span class="name">12-Wochen-Plan<span class="sub">${esc(sub)}</span></span><span class="meta mono open">${S.plan.start ? 'bald' : 'starten'}</span></a></li>`;
  }
  if (pos.finished) return `<li><a class="row-btn" href="#/plan"><span class="name">12-Wochen-Plan<span class="sub">Abgeschlossen, Ergebnis ansehen</span></span><span class="meta mono dim">fertig</span></a></li>`;
  const w = C.plan.wochen[pos.week - 1];
  const doneToday = planDoneOn(d, pos.week);
  return `<li><a class="row-btn" href="${doneToday ? '#/plan' : '#/plan/training/1'}"><span class="name">Training: ${esc(w.titel)}<span class="sub">Woche ${pos.week} von ${WEEKS} · Tag ${pos.day} · ${trainedDays(S.plan.days, pos.week)}/7 geübt</span></span><span class="meta mono ${doneToday ? 'dim' : 'open'}">${doneToday ? 'erledigt' : 'offen'}</span></a></li>`;
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
    ${e.done ? feedbackBlock(c, e, date) : ''}
    ${e.done && feedbackProvider ? `<button class="btn wide" data-act="feedback" data-date="${date}">Feedback holen</button>` : ''}`;
}

// Nach dem Abschließen: automatische Hinweise, Checkliste, Musterformulierung, Claude fragen, gespeichertes Feedback
function feedbackBlock(c, e, date) {
  const written = c.typ === 'schriftlich';
  const hints = written ? analyze(e.answer, c.aufgabe) : [];
  const ticked = new Set(e.selbstcheck || []);
  const crit = c.kriterien || [];
  return `
    ${hints.length ? `<section class="stack"><span class="label">Automatische Hinweise</span>
      <ul class="hints">${hints.map(h => {
        const t = h.tipp && tip(h.tipp);
        return `<li class="${h.ok ? 'ok' : 'warn'}"><i aria-hidden="true">${h.ok ? '✓' : '!'}</i><span>${esc(h.text)}${t ? `<span class="sub">Kniff: ${esc(t.titel)}. ${esc(t.text)}</span>` : ''}</span></li>`;
      }).join('')}</ul>
      <p class="source">Textregeln, kein inhaltliches Urteil.</p></section>` : ''}
    ${crit.length ? `<section class="stack"><div class="list-head"><span class="label">Selbstcheck: Hast du das umgesetzt?</span><span class="mono dim" style="font-size:12px">${ticked.size}/${crit.length}</span></div>
      <ul class="checklist">${crit.map((k, i) => `<li><label class="check"><input type="checkbox" data-act="selfcheck" data-date="${date}" data-i="${i}" ${ticked.has(i) ? 'checked' : ''}><span>${esc(k)}</span></label></li>`).join('')}</ul></section>` : ''}
    ${c.musterantwort ? `<section class="stack"><span class="label">Zum Vergleich: eine mögliche Formulierung</span><p class="quote">${esc(c.musterantwort)}</p><p class="source">Nur ein Beispiel. Deine Worte dürfen anders klingen.</p></section>` : ''}
    <section class="stack"><span class="label">Feedback von Claude</span>
      <p class="prose dim">Claude öffnet sich mit einer fertigen Anfrage: Situation, Aufgabe, Techniken, Kriterien und ${written ? 'deine Antwort' : 'deine Notiz'}. Erst beim Tippen verlässt etwas das Gerät.</p>
      <a class="btn primary wide" href="https://claude.ai/new" target="_blank" rel="noopener" data-act="claude" data-date="${date}">Feedback von Claude holen</a>
      ${e.feedback?.length ? e.feedback.map((f, i) => `<div class="stack fb"><p class="quote">${esc(f.text)}</p><button class="link" data-act="feedback-del" data-date="${date}" data-i="${i}">Entfernen</button></div>`).join('') : ''}
      <details class="more"><summary>Antwort von Claude hier speichern</summary><div>
        <textarea class="field" id="feedback-paste" rows="5" placeholder="Feedback aus Claude hier einfügen"></textarea>
        <button class="btn wide" data-act="feedback-save" data-date="${date}">Speichern</button></div></details>
    </section>`;
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
      <div><b>${planPosition(S.plan.start, d).week || '–'}</b><span>Plan-Woche</span></div>
      <div><b>${Object.values(S.plan.days).filter(x => x.done).length}</b><span>Trainingstage</span></div>
      <div><b>${Object.keys(S.plan.checks).length}</b><span>Messungen</span></div>
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
      <p>Alles liegt nur in diesem Browser auf diesem Gerät. Sichere einmal pro Woche, am Handy am besten über Teilen nach iCloud Drive oder Google Drive. Sprachaufnahmen sind nicht enthalten.</p>
      <p class="mono">${S.lastBackup ? `Letzte Sicherung: ${esc(formatDe(S.lastBackup, false))}` : 'Noch nie gesichert'}</p>
      <div class="row"><button class="btn grow" data-act="export">Jetzt sichern</button>
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

// Am Handy über das Teilen-Menü (iCloud Drive, Dateien, Google Drive, Mail), sonst als Download.
async function exportData() {
  const name = `klartext-sicherung-${today()}.json`;
  const json = exportState({ ...S, lastBackup: today() });
  const file = new File([json], name, { type: 'application/json' });
  if (coarse() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Klartext-Sicherung' });
    } catch (err) {
      if (err?.name === 'AbortError') return; // abgebrochen: nicht als gesichert zählen
      toast(`Teilen fehlgeschlagen: ${err.message}`);
      return;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  S.lastBackup = today();
  save();
  render();
  toast('Sicherung gespeichert.');
}

const hasData = () => Object.keys(S.entries).length > 0 || Object.keys(S.plan.days).length > 0 || Object.keys(S.plan.checks).length > 0;

function backupNotice() {
  const due = backupDue(S.lastBackup, today(), hasData());
  if (!due) return '';
  return `<section class="notice backup">
      <p><b>Sicherung fällig.</b> ${due.days === null ? 'Du hast noch nie gesichert.' : `Letzte Sicherung vor ${due.days} Tagen.`} Deine Daten liegen nur auf diesem Gerät.</p>
      <button class="btn" data-act="export">Jetzt sichern</button>
    </section>`;
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

// ---------- 12-Wochen-Plan ----------
// Aufbau: kurze Übersicht (#/plan), geführtes Tagestraining Schritt für Schritt (#/plan/training/<n>),
// Nachschlagen in eigenen Unterseiten (Woche, Messung, Messwerte, Redeschienen, Einstellungen).
const isWeekArg = a => /^\d{1,2}$/.test(a || '') && Number(a) >= 1 && Number(a) <= WEEKS;
const IMPULS_LABEL = { begriffe: 'Begriff des Tages', themen: 'Thema des Tages', fragen: 'Frage des Tages' };
const messThema = () => S.plan.thema || C.plan.messung.standardthema;
const fmtNum = n => (n === null || n === undefined ? '–' : String(n).replace('.', ','));
const fmtSec = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);
const rail = name => C.plan.schienen.find(r => r.name === name);

// Ein Tag zählt nur für die Woche, in der er abgehakt wurde (wichtig nach „Woche verlängern“)
const planDoneOn = (date, week) => !!S.plan.days[date]?.done && S.plan.days[date].week === week;
const activeWeek = () => { const p = planPosition(S.plan.start, today()); return p.started && !p.finished ? p.week : 0; };

function stepNav(back, next) {
  return `<nav class="stepnav">${back ? `<a class="btn" href="${back}" aria-label="Zurück">←</a>` : '<span></span>'}${next}</nav>`;
}

// ----- Einstieg vor dem Start: drei Bildschirme statt einer langen Seite
function viewOnboarding(i) {
  const P = C.plan;
  topBar(P.titel, i > 1 ? `#/plan/start/${i - 1}` : '#/', `<span class="count">${i}/3</span>`);
  const body = i === 1 ? `
      <span class="label">Dein Ziel</span>
      <h2 class="headline">${esc(P.ziel)}</h2>
      <p class="prose">${esc(P.grundidee)}</p>
      <p class="prose dim">${esc(P.aufwand)}</p>`
    : i === 2 ? `
      <span class="label">So läuft es</span>
      <h2 class="headline">Drei Phasen, jeden Tag ein kurzes Training.</h2>
      <ol class="steps">${P.phasen.map(ph => `<li><span><b>${esc(ph.titel)}</b> <span class="dim mono">Woche ${ph.wochen[0]}–${ph.wochen[ph.wochen.length - 1]}</span><br><span class="dim">${esc(ph.untertitel)}</span></span></li>`).join('')}</ol>
      <p class="prose dim">Die App führt dich jeden Tag durch Aufwärmen, Wochenübung und Auswertung. Einmal pro Woche nimmst du eine Minute zum gleichen Thema auf, so siehst du, was sich verändert.</p>`
    : `
      <span class="label">Deine Messaufnahme</span>
      <h2 class="headline">Worüber sprichst du jede Woche eine Minute?</h2>
      <form id="plan-start" class="stack" autocomplete="off">
        <input class="field" name="thema" maxlength="200" value="${esc(S.plan.thema)}" placeholder="${esc(P.messung.standardthema)}" aria-label="Thema der Messaufnahme">
        <p class="source">Ohne Eingabe gilt der Vorschlag. Bleib dabei, nur so werden die Aufnahmen vergleichbar.</p>
      </form>`;
  app.innerHTML = `<div class="bar"><i style="width:${(i / 3) * 100}%"></i></div>
    <section class="stack step">${body}</section>
    ${stepNav(i > 1 ? `#/plan/start/${i - 1}` : '', i < 3
      ? `<a class="btn primary grow" href="#/plan/start/${i + 1}">Weiter</a>`
      : '<button class="btn primary grow" type="submit" form="plan-start">Plan heute starten</button>')}`;
}

// ----- Übersicht
function viewPlan() {
  if (!S.plan.start) return viewOnboarding(1);
  const d = today();
  const pos = planPosition(S.plan.start, d);
  topBar(C.plan.titel, '#/');
  let head;
  if (!pos.started) head = `<section class="stack" style="padding-top:12px"><span class="label">Startet bald</span><h2 class="headline">Woche 1 beginnt am ${esc(formatDe(S.plan.start, false))}.</h2></section>`;
  else if (pos.finished) head = finishedSummary();
  else {
    const ph = phaseOf(C.plan.phasen, pos.week);
    const w = C.plan.wochen[pos.week - 1];
    const done = planDoneOn(d, pos.week);
    const elapsed = (pos.week - 1) * 7 + pos.day;
    head = `
    <section class="hero">
      <div class="big">${pos.week}</div>
      <div class="hero-meta"><strong>Woche von ${WEEKS}</strong><span class="mono dim">Phase ${ph.nr} · ${esc(ph.titel)} · Tag ${pos.day}</span></div>
    </section>
    <div class="bar" title="${elapsed} von ${WEEKS * 7} Tagen"><i style="width:${(elapsed / (WEEKS * 7)) * 100}%"></i></div>
    <section class="stack">
      <a class="today-card" href="#/plan/woche/${pos.week}"><span class="label">Diese Woche</span><b>${esc(w.titel)}</b><span class="dim">${esc(w.ziel)}</span></a>
      ${weekDots(pos.week)}
      <p class="source">${trainedDays(S.plan.days, pos.week)} von 7 Tagen geübt · ${S.plan.checks[pos.week]?.date ? 'Messung erledigt' : `<a class="inline" href="#/plan/messung/${pos.week}">Messung offen</a>`}</p>
      ${done
        ? '<p class="status"><i></i>Heute geübt.</p><a class="btn wide" href="#/plan/training/1">Nochmal üben</a>'
        : `<a class="btn primary wide" href="#/plan/training/1">Heute trainieren <span class="mono">${trainingSteps(pos.week, d).length} Schritte</span></a>`}
    </section>`;
  }
  app.innerHTML = `
    ${head}
    ${roadmap(pos)}
    <section class="stack"><span class="label">Mehr</span><ul class="rows">
      <li><a class="row-btn" href="#/plan/messwerte"><span class="name">Messwerte</span><span class="meta mono dim">${checkSeries(S.plan.checks).length}</span></a></li>
      <li><a class="row-btn" href="#/plan/schienen"><span class="name">Redeschienen<span class="sub">BBB, Fünfsatz und Co. zum Nachschlagen</span></span></a></li>
      <li><a class="row-btn" href="#/plan/einstellungen"><span class="name">Einstellungen<span class="sub">Messthema, Woche verlängern, neu starten</span></span></a></li>
    </ul></section>`;
}

function weekDots(week) {
  if (!S.plan.start) return '';
  const d = today();
  return `<div class="days week">${weekDates(S.plan.start, week).map(k => `<i class="${planDoneOn(k, week) ? 'on' : ''} ${k === d ? 'today' : ''}" title="${esc(formatDe(k))}"></i>`).join('')}</div>`;
}

// Phasen zum Aufklappen, die laufende ist offen
function roadmap(pos) {
  return `<section class="stack"><span class="label">Roadmap</span><div class="phases">${C.plan.phasen.map(ph => {
    const last = ph.wochen[ph.wochen.length - 1];
    const status = !pos.started ? '' : pos.finished || pos.week > last ? 'erledigt' : pos.week >= ph.wochen[0] ? 'läuft' : '';
    return `<details class="phase" ${status === 'läuft' || (!pos.started && ph.nr === 1) ? 'open' : ''}>
      <summary><span class="name"><span class="mono dim">${ph.nr}</span> ${esc(ph.titel)}<span class="sub">${esc(ph.untertitel)} · Woche ${ph.wochen[0]}–${last}</span></span><span class="meta mono ${status === 'läuft' ? 'open' : 'dim'}">${status}</span></summary>
      <p class="source">Ziel: ${esc(ph.ziel)}</p>
      <ul class="rows">${ph.wochen.map(n => {
        const cur = pos.started && !pos.finished && pos.week === n;
        const t = trainedDays(S.plan.days, n);
        return `<li><a class="row-btn compact" href="#/plan/woche/${n}"><span class="name"><span class="mono dim wk">${String(n).padStart(2, '0')}</span>${esc(C.plan.wochen[n - 1].titel)}</span><span class="meta mono ${cur ? 'open' : 'dim'}">${cur ? 'jetzt' : t ? `${t}/7` : ''}</span></a></li>`;
      }).join('')}
        <li><a class="row-btn compact" href="#/plan/messung/${last}"><span class="name check-row">Check: ${esc(ph.check)}</span><span class="meta mono dim">${S.plan.checks[last]?.date ? '✓' : ''}</span></a></li>
      </ul></details>`;
  }).join('')}</div></section>`;
}

function finishedSummary() {
  const cmp = compareChecks(S.plan.checks, 1, WEEKS);
  return `<section class="done">
      <span class="label">Plan abgeschlossen</span>
      <h2>Zwölf Wochen geschafft.</h2>
      <p>${Object.values(S.plan.days).filter(x => x.done).length} Trainingstage, ${checkSeries(S.plan.checks).length} Messungen.${cmp?.rate ? ` Füllwörter pro Minute: ${fmtNum(cmp.rate.from)} in Woche 1, ${fmtNum(cmp.rate.to)} in Woche 12.` : ''}</p>
      <p>Wähle eine Woche, die du wiederholen willst, oder starte unter Einstellungen eine neue Runde.</p>
    </section>`;
}

// ----- Geführtes Tagestraining
// Die Schrittfolge bleibt über den Tag stabil, damit Zurück, Neuladen und Links auf einen Schritt funktionieren.
function trainingSteps(week, d) {
  const w = C.plan.wochen[week - 1];
  const otherDays = Object.entries(S.plan.days).filter(([k, x]) => k !== d && x.done && x.week === week).length;
  const steps = [];
  if (!otherDays) steps.push({ kind: 'intro' });
  const c = S.plan.checks[week];
  if (!c?.date || c.date === d) steps.push({ kind: 'messung' });
  steps.push({ kind: 'warmup', s: C.plan.aufwaermen });
  w.schritte.forEach((s, i) => steps.push({ kind: 'step', s, i, n: w.schritte.length }));
  steps.push({ kind: 'abschluss' });
  return steps;
}

function viewTraining(i) {
  const d = today();
  const week = activeWeek();
  if (!week) return viewPlan();
  const steps = trainingSteps(week, d);
  i = Math.min(Math.max(1, i), steps.length);
  const st = steps[i - 1];
  const w = C.plan.wochen[week - 1];
  const ph = phaseOf(C.plan.phasen, week);
  topBar(`Training · Woche ${week}`, '#/plan', `<span class="count">${i}/${steps.length}</span>`);
  const last = i === steps.length;
  let body = '';
  if (st.kind === 'intro') {
    body = `
      <span class="label">Neue Woche · Phase ${ph.nr}: ${esc(ph.titel)}</span>
      <h2 class="headline">${esc(w.titel)}</h2>
      <p class="prose task"><b>Wochenziel:</b> ${esc(w.ziel)}</p>
      <p class="prose dim">${esc(w.warum)}</p>
      ${ph.wochen[0] === week ? `<p class="source">Ziel der Phase: ${esc(ph.ziel)}</p>` : ''}
      <div class="chips">${w.techniken.map(id => `<a class="chip" href="#/technik/${esc(id)}">${esc(tech(id)?.name || id)}</a>`).join('')}</div>`;
  } else if (st.kind === 'messung') {
    body = `
      <span class="label">Messaufnahme der Woche · 1 Minute</span>
      <h2 class="headline">${esc(messThema())}</h2>
      <p class="prose dim">Ohne Vorbereitung eine Minute zu deinem Thema. Danach anhören und die Werte eintragen. Keine Zeit gerade? Mit Weiter überspringen, die Messung bleibt in der Übersicht offen.</p>
      ${checkRecorder(week)}
      ${checkForm(week)}`;
  } else if (st.kind === 'warmup') {
    body = `
      <span class="label">Aufwärmen · 2 Minuten</span>
      <p class="step-text">${esc(st.s.text)}</p>
      ${toolBlocks(st.s, d)}`;
  } else if (st.kind === 'step') {
    body = `
      <span class="label">Übung · Schritt ${st.i + 1} von ${st.n}</span>
      <p class="step-text">${esc(st.s.text)}</p>
      ${toolBlocks(st.s, d)}`;
  } else {
    const day = S.plan.days[d]?.week === week ? S.plan.days[d] : null;
    const tipId = w.tipps.length ? w.tipps[(trainedDays(S.plan.days, week)) % w.tipps.length] : null;
    const t = tipId && tip(tipId);
    body = `
      <span class="label">Auswerten</span>
      <h2 class="headline">Was machst du morgen besser?</h2>
      <form id="plan-day" class="stack" autocomplete="off">
        <textarea class="field" name="note" rows="3" placeholder="Eine Sache reicht.">${esc(day?.note)}</textarea>
      </form>
      ${planPosition(S.plan.start, d).day >= 5 ? gespraechField(week) : ''}
      <div class="stack"><span class="label">Heute im Alltag</span><p class="prose">${esc(w.transfer)}</p></div>
      ${t ? `<div class="tip" style="padding:0"><span class="label">Kniff</span><h3>${esc(t.titel)}</h3><p>${esc(t.text)}</p></div>` : ''}`;
  }
  app.innerHTML = `<div class="bar"><i style="width:${(i / steps.length) * 100}%"></i></div>
    <section class="stack step">${body}</section>
    ${stepNav(i > 1 ? `#/plan/training/${i - 1}` : '', last
      ? `<button class="btn primary grow" type="submit" form="plan-day">${planDoneOn(d, week) ? 'Fertig' : 'Training abschließen'}</button>`
      : `<a class="btn primary grow" href="#/plan/training/${i + 1}">Weiter</a>`)}`;
  if (st.kind === 'messung') hydrateAudio(week);
}

// Werkzeuge eines Schritts: Redeschiene, Impuls, Anhören, Timer, Aufnahme
function toolBlocks(s, d) {
  const r = s.schiene && rail(s.schiene);
  return [
    r ? `<div class="rail"><span class="label">${esc(r.name)}</span><ol>${r.folge.map(f => `<li>${esc(f)}</li>`).join('')}</ol></div>` : '',
    s.impuls ? impulseBlock(s.impuls, d) : '',
    s.anhoeren ? (rec.practiceUrl ? `<div class="stack"><span class="label">Deine letzte Aufnahme</span><audio controls src="${rec.practiceUrl}"></audio></div>` : '<p class="source">Keine Übungsaufnahme vorhanden. Nimm im nächsten Durchgang auf oder hör die Aufnahme im Handy an.</p>') : '',
    s.timer ? timerBlock(s.timer) : '',
    s.aufnahme ? practiceRecorder() : '',
  ].join('');
}

function timerBlock(sec) {
  const running = !!timer.id;
  return `<div class="timer"><span id="timer" class="mono">${fmtSec(running ? timerLeft() : sec)}</span>
    ${running ? '<button class="btn" data-act="timer-stop">Stopp</button>' : `<button class="btn" data-act="timer" data-sec="${sec}">Timer starten</button>`}</div>`;
}

function impulseBlock(kind, d) {
  const n = ui.impulseSkip[kind] || 0;
  return `<div class="impulse-box"><span class="label">${IMPULS_LABEL[kind]}</span>
    <p class="quote impulse">${esc(impulse(C.plan.impulse[kind], d, kind, n))}</p>
    <button class="link" data-act="impulse" data-kind="${kind}">Anderes ziehen</button></div>`;
}

function practiceRecorder() {
  if (!recordingSupported()) return '<p class="source">Nimm dich mit der Sprachmemo-App deines Handys auf.</p>';
  const live = rec.session && rec.target === 'uebung';
  return `<div class="row recorder">${live
      ? `<button class="btn primary danger" data-act="rec-stop">${I.stop}Stopp <span id="rec-time" class="mono">0 s</span></button>`
      : `<button class="btn" data-act="rec-start" data-target="uebung">${I.mic}${rec.practiceUrl ? 'Neu aufnehmen' : 'Aufnehmen'}</button>`}
    ${rec.practiceUrl && !live ? `<audio controls src="${rec.practiceUrl}"></audio>` : ''}</div>`;
}

function viewTrainingDone() {
  const week = activeWeek();
  topBar('Training', '#/plan');
  if (!week || !planDoneOn(today(), week)) return viewPlan();
  const n = trainedDays(S.plan.days, week);
  app.innerHTML = `
    <section class="done">
      <span class="label">Woche ${week} · ${esc(C.plan.wochen[week - 1].titel)}</span>
      <h2>Geschafft.</h2>
      <p>${n} von 7 Tagen in dieser Woche geübt.${n >= 5 ? ' Das Wochenziel an Trainingstagen ist erreicht.' : ''}</p>
    </section>
    ${weekDots(week)}
    ${S.plan.checks[week]?.date ? '' : `<a class="btn wide" href="#/plan/messung/${week}">Messaufnahme nachholen</a>`}
    <a class="btn primary wide" href="#/">Zur Startseite</a>`;
}

// ----- Woche zum Nachschlagen
function viewWeek(n) {
  const d = today();
  const w = C.plan.wochen[n - 1];
  const ph = phaseOf(C.plan.phasen, n);
  const isNow = activeWeek() === n;
  topBar(`Woche ${n}`, '#/plan', `<span class="count">${n}/${WEEKS}</span>`);
  const tags = s => [s.impuls && IMPULS_LABEL[s.impuls].replace(' des Tages', ''), s.schiene, s.timer && `Timer ${fmtSec(s.timer)}`, s.aufnahme && 'Aufnahme'].filter(Boolean);
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">Phase ${ph.nr}: ${esc(ph.titel)}</span>
      <h2 class="headline">${esc(w.titel)}</h2>
      <p class="prose task"><b>Wochenziel:</b> ${esc(w.ziel)}</p>
      ${isNow ? weekDots(n) : ''}
      ${isNow ? `<a class="btn ${planDoneOn(d, n) ? '' : 'primary'} wide" href="#/plan/training/1">${planDoneOn(d, n) ? 'Nochmal üben' : 'Heute trainieren'}</a>` : ''}
    </section>
    <section class="stack"><span class="label">Tägliche Übung</span><ol class="steps">${w.schritte.map(s => `<li><span>${esc(s.text)}${tags(s).length ? `<br><span class="mono dim tags">${tags(s).map(esc).join(' · ')}</span>` : ''}</span></li>`).join('')}</ol></section>
    <details class="more"><summary>Warum diese Woche</summary><div><p class="prose">${esc(w.warum)}</p><p class="prose"><b>Im Alltag:</b> ${esc(w.transfer)}</p></div></details>
    <details class="more"><summary>Techniken und Kniffe</summary><div>
      <div class="chips">${w.techniken.map(id => `<a class="chip" href="#/technik/${esc(id)}">${esc(tech(id)?.name || id)}</a>`).join('')}</div>
      ${w.tipps.map(tip).filter(Boolean).map(t => `<div class="tip" style="padding:6px 0"><h3>${esc(t.titel)}</h3><p>${esc(t.text)}</p></div>`).join('')}
    </div></details>
    <a class="btn wide" href="#/plan/messung/${n}">${S.plan.checks[n]?.date ? 'Messaufnahme ansehen' : 'Messaufnahme dieser Woche'}</a>
    <div class="row">${n > 1 ? `<a class="link" href="#/plan/woche/${n - 1}">← Woche ${n - 1}</a>` : ''}<span class="grow"></span>${n < WEEKS ? `<a class="link" href="#/plan/woche/${n + 1}">Woche ${n + 1} →</a>` : ''}</div>`;
}

// ----- Messung
function checkRecorder(n) {
  if (!recordingSupported()) return '<p class="source">Nimm dich mit der Sprachmemo-App deines Handys auf und trag die Werte hier ein.</p>';
  const live = rec.session && rec.target === `messung-${n}`;
  return `<div class="stack">
    <div class="row recorder">${live
      ? `<button class="btn primary danger" data-act="rec-stop">${I.stop}Stopp <span id="rec-time" class="mono">0 s</span></button>`
      : `<button class="btn" data-act="rec-start" data-target="messung-${n}">${I.mic}${rec.saved[n] ? 'Neu aufnehmen' : 'Aufnehmen'}</button>`}
      <audio controls data-week="${n}" hidden></audio></div>
    ${n > 1 ? `<div class="stack" data-compare hidden><span class="label">Woche 1 zum Vergleich</span><audio controls data-week="1"></audio></div>` : ''}
    ${rec.saved[n] ? `<button class="link" style="align-self:flex-start" data-act="rec-delete" data-week="${n}">Aufnahme löschen</button>` : ''}
  </div>`;
}

function checkForm(n) {
  const c = S.plan.checks[n] || {};
  return `<form id="plan-check" class="stack" autocomplete="off" data-week="${n}">
      <div class="row">
        <label class="lab grow"><span class="label">Füllwörter</span><input class="field mono" name="fuellwoerter" type="number" inputmode="numeric" min="0" max="999" value="${c.fuellwoerter ?? ''}" placeholder="Anzahl"></label>
        <label class="lab grow"><span class="label">Dauer (Sek.)</span><input class="field mono" name="sekunden" type="number" inputmode="numeric" min="1" max="3600" value="${c.sekunden ?? 60}"></label>
      </div>
      <p class="source">Füllwörter pro Minute: <b class="mono" id="rate">${fmtNum(fillerRate({ fuellwoerter: c.fuellwoerter, sekunden: c.sekunden ?? 60 }))}</b></p>
      <div class="stack"><span class="label">Kernsatz im ersten Satz?</span>
        <div class="chips">${[['ja', true], ['nein', false]].map(([l, v]) => `<button type="button" class="chip ${c.kernsatz === v ? 'on' : ''}" data-act="check-set" data-field="kernsatz" data-value="${v}">${l}</button>`).join('')}</div></div>
      <div class="stack"><span class="label">Roter Faden (1 bis 10)</span>
        <div class="chips">${scaleChips(c, 'klarheit')}</div></div>
      <div class="stack"><span class="label">Wie ruhig warst du? (1 bis 10)</span>
        <div class="chips">${scaleChips(c, 'ruhe')}</div></div>
    </form>`;
}

const scaleChips = (c, field) => Array.from({ length: 10 }, (_, i) => i + 1)
  .map(v => `<button type="button" class="chip num ${c[field] === v ? 'on' : ''}" data-act="check-set" data-field="${field}" data-value="${v}">${v}</button>`).join('');

function gespraechField(week) {
  return `<label class="lab"><span class="label">Gespräch der Woche, das besser lief als früher</span>
    <textarea class="field" id="week-gespraech" data-week="${week}" rows="2" placeholder="Mit wem, worum ging es, was war anders?">${esc(S.plan.checks[week]?.gespraech)}</textarea></label>`;
}

function viewCheck(n) {
  const c = S.plan.checks[n] || {};
  const ph = C.plan.phasen.find(p => p.wochen[p.wochen.length - 1] === n);
  const cmp = n > 1 ? compareChecks(S.plan.checks, 1, n) : null;
  topBar(`Messung Woche ${n}`, `#/plan/woche/${n}`);
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">Messaufnahme · 1 Minute</span>
      <h2 class="headline">${esc(messThema())}</h2>
      ${ph ? `<p class="prose task"><b>Check Phase ${ph.nr}:</b> ${esc(ph.check)}</p>` : ''}
    </section>
    ${checkRecorder(n)}
    ${checkForm(n)}
    <label class="lab"><span class="label">Notiz</span><textarea class="field" id="check-notiz" data-week="${n}" rows="3" placeholder="Was fällt dir auf, verglichen mit früher?">${esc(c.notiz)}</textarea></label>
    ${gespraechField(n)}
    ${cmp && (cmp.rate || cmp.klarheit) ? `<section class="stack"><span class="label">Seit Woche 1</span><p class="prose">${cmp.rate ? `Füllwörter pro Minute: ${fmtNum(cmp.rate.from)} → ${fmtNum(cmp.rate.to)}. ` : ''}${cmp.klarheit ? `Roter Faden: ${cmp.klarheit.from} → ${cmp.klarheit.to}.` : ''}</p></section>` : ''}
    <details class="more"><summary>So misst du</summary><div><p class="prose dim">${esc(C.plan.messung.text)}</p><ul class="prompts">${C.plan.messung.kriterien.map(k => `<li>${esc(k)}</li>`).join('')}</ul><p class="source">Aufnahmen bleiben nur auf diesem Gerät und sind nicht in der Sicherung enthalten.</p></div></details>`;
  hydrateAudio(n);
}

function setCheck(week, field, value) {
  const c = S.plan.checks[week] || (S.plan.checks[week] = { date: null, fuellwoerter: null, sekunden: 60, kernsatz: null, klarheit: null, ruhe: null, notiz: '', gespraech: '' });
  c[field] = value;
  if (field !== 'gespraech') c.date = today();
  save();
}

// ----- Unterseiten
function viewMeasures() {
  topBar('Messwerte', '#/plan');
  const rows = checkSeries(S.plan.checks);
  const talks = Object.entries(S.plan.checks).filter(([, c]) => c.gespraech?.trim()).sort((x, y) => x[0] - y[0]);
  if (!rows.length && !talks.length) { app.innerHTML = `<div class="empty"><p>Noch keine Messung. Die erste machst du im Training von Woche 1, sie ist dein Ausgangswert.</p></div>`; return; }
  const cmp = rows.length > 1 ? compareChecks(S.plan.checks, rows[0].week, rows[rows.length - 1].week) : null;
  const pts = key => rows.filter(r => r[key] !== null).map(r => ({ week: r.week, value: r[key] }));
  const rate = pts('rate');
  app.innerHTML = `
    <section class="stack" style="padding-top:12px"><span class="label">${esc(messThema())}</span>
      ${cmp?.rate ? `<h2 class="headline">${fmtNum(cmp.rate.from)} → ${fmtNum(cmp.rate.to)} Füllwörter pro Minute</h2><p class="source">Woche ${rows[0].week} bis Woche ${rows[rows.length - 1].week}.</p>` : '<p class="source">Ab der zweiten Messung siehst du hier deinen Verlauf.</p>'}
    </section>
    ${rate.length ? lineChart('rate', 'Füllwörter pro Minute', 'weniger ist besser', rate, 0, niceMax(Math.max(...rate.map(p => p.value)))) : ''}
    ${pts('klarheit').length ? lineChart('klarheit', 'Roter Faden', 'Selbsteinschätzung 1 bis 10', pts('klarheit'), 0, 10) : ''}
    ${pts('ruhe').length ? lineChart('ruhe', 'Ruhe', 'Selbsteinschätzung 1 bis 10', pts('ruhe'), 0, 10) : ''}
    ${rows.length ? `<details class="more"><summary>Alle Werte als Tabelle</summary><div>
      <table class="measure"><thead><tr><th>Woche</th><th>Füllw./Min.</th><th>Kernsatz</th><th>Faden</th><th>Ruhe</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mono"><a href="#/plan/messung/${r.week}">${r.week}</a></td><td class="mono">${fmtNum(r.rate)}</td>
        <td class="mono">${r.kernsatz === null ? '–' : r.kernsatz ? 'ja' : 'nein'}</td><td class="mono">${r.klarheit ?? '–'}</td><td class="mono">${r.ruhe ?? '–'}</td></tr>`).join('')}
      </tbody></table></div></details>` : ''}
    ${talks.length ? `<section class="stack"><span class="label">Gespräche, die besser liefen</span><ul class="rows">${talks.map(([w, c]) => `<li class="talk"><span class="mono dim">W${w}</span><p>${esc(c.gespraech)}</p></li>`).join('')}</ul></section>` : ''}`;
}

const niceMax = v => { const steps = [2, 4, 5, 10, 15, 20, 30, 40, 50, 100]; return steps.find(s => s >= v * 1.1) || Math.ceil(v / 50) * 50; };

// Liniendiagramm über die 12 Planwochen: eine Reihe, Punkte zum Antippen, erster und letzter Wert direkt beschriftet.
function lineChart(id, title, sub, pts, yMin, yMax) {
  const W = 340, H = 168, L = 30, R = 14, T = 16, Bm = 26;
  const x = w => L + ((w - 1) / (WEEKS - 1)) * (W - L - R);
  const y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - Bm);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const first = pts[0], last = pts[pts.length - 1];
  const lab = (p, anchor) => `<text class="vlab" x="${x(p.week) + (anchor === 'end' ? -8 : 8)}" y="${y(p.value) - 9}" text-anchor="${anchor}">${fmtNum(p.value)}</text>`;
  return `<section class="stack chart" data-chart="${id}">
    <div class="chart-head"><b>${esc(title)}</b><span class="dim">${esc(sub)}</span></div>
    <span class="chart-read mono" aria-live="polite">Punkt antippen für den Wert</span>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} nach Planwoche: ${pts.map(p => `Woche ${p.week} ${fmtNum(p.value)}`).join(', ')}">
      ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmtNum(t)}</text>`).join('')}
      ${[1, 4, 8, 12].map(w => `<text class="tick" x="${x(w)}" y="${H - 6}" text-anchor="middle">W${w}</text>`).join('')}
      ${pts.length > 1 ? `<path class="series" d="${path}"/>` : ''}
      ${pts.map(p => `<circle class="dot" cx="${x(p.week)}" cy="${y(p.value)}" r="4.5"/>`).join('')}
      ${lab(first, pts.length > 1 && x(last.week) - x(first.week) < 60 ? 'end' : 'start')}
      ${pts.length > 1 ? lab(last, last.week > 10 ? 'end' : 'start') : ''}
      ${pts.map(p => `<circle class="hit" cx="${x(p.week)}" cy="${y(p.value)}" r="16" data-act="chart-pt" data-label="Woche ${p.week}: ${fmtNum(p.value)}"><title>Woche ${p.week}: ${fmtNum(p.value)}</title></circle>`).join('')}
    </svg></section>`;
}

function viewRails() {
  topBar('Redeschienen', '#/plan');
  app.innerHTML = `<p class="prose dim" style="padding-top:12px">Feste Abfolgen, an denen du dich beim Sprechen entlanghangelst. Antippen für die Technik dahinter.</p>
    <ul class="rows">${C.plan.schienen.map(r => `
    <li><a class="row-btn" href="#/technik/${esc(r.technik)}"><span class="name">${esc(r.name)}<span class="sub">${r.folge.map(esc).join(' → ')}</span><span class="sub">${esc(r.wann)}</span></span></a></li>`).join('')}</ul>`;
}

function viewPlanSettings() {
  const pos = planPosition(S.plan.start, today());
  topBar('Einstellungen', '#/plan');
  app.innerHTML = `
    <section class="section" style="padding-top:12px">
      <label class="lab"><span class="label">Thema der Messaufnahme</span>
        <input class="field" id="plan-thema" maxlength="200" value="${esc(S.plan.thema)}" placeholder="${esc(C.plan.messung.standardthema)}"></label>
    </section>
    ${S.plan.start ? `<section class="section">
      <span class="label">Plan</span>
      <p>Gestartet am ${esc(formatDe(S.plan.start, false))}. Kam etwas dazwischen, verlängere die aktuelle Woche: Der Plan rückt um sieben Tage nach hinten, Geübtes bleibt erhalten.</p>
      <div class="row">
        ${pos.started && !pos.finished ? '<button class="btn grow" data-act="plan-extend">Woche verlängern</button>' : ''}
        <button class="btn grow danger" data-act="plan-reset">Plan neu starten</button>
      </div></section>` : ''}
    <section class="section"><span class="label">Täglicher Ablauf</span>
      <ol class="steps">${C.plan.ablauf.map(a => `<li><span><b>${esc(a.titel)}</b> <span class="dim mono">${esc(a.minuten)} Min.</span><br>${esc(a.text)}</span></li>`).join('')}</ol></section>`;
}

// ---------- Timer ----------
const timer = { id: 0, end: 0 };
const timerLeft = () => Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
function startTimer(sec) {
  stopTimer();
  timer.end = Date.now() + sec * 1000;
  timer.id = setInterval(tick, 250);
  render();
}
function stopTimer() { clearInterval(timer.id); timer.id = 0; }
function tick() {
  const el = $('#timer');
  if (timer.id && el) el.textContent = fmtSec(timerLeft());
  if (timer.id && timerLeft() === 0) {
    stopTimer(); navigator.vibrate?.(200); toast('Zeit um.');
    if (location.hash.startsWith('#/plan/training')) render();
  }
  const r = $('#rec-time');
  if (r && rec.session) r.textContent = fmtSec(Math.round((Date.now() - rec.session.startedAt) / 1000));
}
setInterval(() => { if (rec.session && !timer.id) tick(); }, 500);

// ---------- Aufnahmen ----------
const rec = { session: null, target: '', practiceUrl: '', saved: {}, urls: {} };

async function recStart(target) {
  if (rec.session) return;
  try {
    rec.session = await startRecording();
    rec.target = target;
    render();
  } catch (err) {
    toast(err?.name === 'NotAllowedError' ? 'Kein Zugriff aufs Mikrofon. Bitte im Browser erlauben.' : `Aufnahme nicht möglich: ${err.message}`);
  }
}

async function recStop() {
  if (!rec.session) return;
  const { target } = rec;
  const result = await rec.session.stop();
  rec.session = null; rec.target = '';
  if (target === 'uebung') {
    if (rec.practiceUrl) URL.revokeObjectURL(rec.practiceUrl);
    rec.practiceUrl = URL.createObjectURL(result.blob);
  } else {
    const week = Number(target.replace('messung-', ''));
    try {
      await saveRecording(week, { blob: result.blob, type: result.type, seconds: result.seconds, date: today() });
      dropUrl(week);
      rec.saved[week] = true;
      if (!S.plan.checks[week]?.date) setCheck(week, 'sekunden', Math.max(1, Math.min(3600, result.seconds)));
      toast('Aufnahme gespeichert. Jetzt anhören und Werte eintragen.');
    } catch (err) { toast(`Speichern fehlgeschlagen: ${err.message}`); }
  }
  render();
}

function cancelRecording() { if (rec.session) { rec.session.cancel(); rec.session = null; rec.target = ''; } }
function dropUrl(week) { if (rec.urls[week]) { URL.revokeObjectURL(rec.urls[week]); delete rec.urls[week]; } }

// Gespeicherte Aufnahmen nachladen, sobald die Messansicht steht. current = Woche der angezeigten Messung
async function hydrateAudio(current) {
  for (const el of document.querySelectorAll('audio[data-week]')) {
    const week = Number(el.dataset.week);
    try {
      if (!rec.urls[week]) {
        const r = await loadRecording(week);
        if (!r?.blob) { if (rec.saved[week]) { delete rec.saved[week]; render(); } continue; }
        rec.urls[week] = URL.createObjectURL(r.blob);
      }
      if (!rec.saved[week]) { rec.saved[week] = true; if (week === current) { render(); return; } }
      el.src = rec.urls[week];
      el.hidden = false;
      el.closest('[data-compare]')?.removeAttribute('hidden');
    } catch { /* ohne IndexedDB keine Wiedergabe */ }
  }
}

// ---------- Routing ----------
function render() {
  if (!C) return;
  const [, route = '', arg, arg2] = location.hash.split('/');
  if (route !== 'wiederholen') { ui.session = 0; ui.revealed = false; }
  if (location.hash !== shownRoute) {
    stopTimer(); cancelRecording();
    // Impulse bleiben innerhalb eines Trainings gleich, auch wenn man zwischen den Schritten wechselt
    const key = h => h.replace(/\/training\/\d+$/, '/training');
    if (key(location.hash) !== key(shownRoute)) ui.impulseSkip = {};
    shownRoute = location.hash;
  }
  switch (route) {
    // Nur heute oder Tage mit vorhandenem Eintrag, damit sich über die URL keine Tage abschließen lassen
    case 'challenge': return arg && !(isDateKey(arg) && (arg === today() || S.entries[arg])) ? viewHome() : viewChallenge(arg || today());
    case 'techniken': return viewTechniques();
    case 'technik': return viewTechnique(arg);
    case 'tipps': return viewTips();
    case 'wiederholen': return viewReview();
    case 'verlauf': return viewProgress();
    case 'plan':
      if (arg === 'woche' && isWeekArg(arg2)) return viewWeek(Number(arg2));
      if (arg === 'messung' && isWeekArg(arg2)) return viewCheck(Number(arg2));
      if (arg === 'training') return /^\d+$/.test(arg2 || '') ? viewTraining(Number(arg2)) : viewTraining(1);
      if (arg === 'geschafft') return viewTrainingDone();
      if (arg === 'start' && !S.plan.start) return viewOnboarding(Math.min(3, Math.max(1, Number(arg2) || 1)));
      if (arg === 'messwerte') return viewMeasures();
      if (arg === 'schienen') return viewRails();
      if (arg === 'einstellungen') return viewPlanSettings();
      return viewPlan();
    default: return viewHome();
  }
}

let shownRoute = location.hash;
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
  else if (act === 'claude') {
    const entry = S.entries[el.dataset.date];
    const c = challenge(entry.challengeId);
    const prompt = claudePrompt({ challenge: c, entry, techniques: c.techniken.map(tech).filter(Boolean) });
    el.href = claudeUrl(prompt); // vor der Navigation setzen, damit der aktuelle Text drin ist
    navigator.clipboard?.writeText(prompt).then(() => toast('Anfrage auch kopiert. Falls das Feld in Claude leer ist: einfügen.')).catch(() => {});
  } else if (act === 'feedback-save') {
    const text = $('#feedback-paste').value.trim();
    if (!text) return toast('Füg zuerst das Feedback ein.');
    S.entries[el.dataset.date].feedback.push({ source: 'Claude', text, createdAt: new Date().toISOString() });
    save(); render(); toast('Feedback gespeichert.');
  } else if (act === 'feedback-del') {
    if (!confirm('Dieses Feedback entfernen?')) return;
    S.entries[el.dataset.date].feedback.splice(Number(el.dataset.i), 1);
    save(); render();
  } else if (act === 'selfcheck') {
    const entry = S.entries[el.dataset.date];
    const i = Number(el.dataset.i);
    const set = new Set(entry.selbstcheck || []);
    if (el.checked) set.add(i); else set.delete(i);
    entry.selbstcheck = [...set].sort((a, b) => a - b);
    save();
    const head = el.closest('section').querySelector('.list-head .mono');
    if (head) head.textContent = `${set.size}/${head.textContent.split('/')[1]}`;
  } else if (act === 'chart-pt') {
    const box = el.closest('.chart');
    const read = box.querySelector('.chart-read');
    read.textContent = el.dataset.label;
    read.classList.add('on');
    box.querySelectorAll('.hit.on').forEach(h => h.classList.remove('on'));
    el.classList.add('on');
  } else if (act === 'impulse') { ui.impulseSkip[el.dataset.kind] = (ui.impulseSkip[el.dataset.kind] || 0) + 1; render(); }
  else if (act === 'timer') startTimer(Number(el.dataset.sec));
  else if (act === 'timer-stop') { stopTimer(); render(); }
  else if (act === 'rec-start') recStart(el.dataset.target);
  else if (act === 'rec-stop') recStop();
  else if (act === 'rec-delete') {
    if (!confirm('Diese Aufnahme löschen?')) return;
    const week = Number(el.dataset.week);
    deleteRecording(week).then(() => { dropUrl(week); delete rec.saved[week]; render(); toast('Aufnahme gelöscht.'); }).catch(err => toast(err.message));
  } else if (act === 'check-set') {
    const v = el.dataset.field === 'kernsatz' ? el.dataset.value === 'true' : Number(el.dataset.value);
    setCheck(Number(el.closest('form').dataset.week), el.dataset.field, v); render();
  } else if (act === 'plan-extend') {
    if (!confirm('Aktuelle Woche verlängern? Der Plan rückt um sieben Tage nach hinten.')) return;
    S.plan = extendPlan(S.plan); save(); render(); toast('Woche verlängert.');
  } else if (act === 'plan-reset') {
    if (!confirm('Plan neu starten? Trainingstage, Messwerte und alle Sprachaufnahmen des Plans werden gelöscht. Dein Messthema bleibt.')) return;
    S.plan = { ...defaultPlan(), thema: S.plan.thema }; save();
    Object.keys(rec.urls).forEach(w => dropUrl(Number(w)));
    rec.saved = {};
    if (rec.practiceUrl) { URL.revokeObjectURL(rec.practiceUrl); rec.practiceUrl = ''; }
    (recordingSupported() ? clearRecordings() : Promise.resolve())
      .then(() => toast('Plan und Aufnahmen gelöscht.'))
      .catch(() => toast('Plan zurückgesetzt. Aufnahmen konnten nicht gelöscht werden.'))
      .finally(render);
  }
});

function planDay(date) {
  const pos = planPosition(S.plan.start, date);
  if (!pos.started || pos.finished) return null;
  const d = S.plan.days[date];
  if (d && d.week === pos.week) return d;
  return (S.plan.days[date] = { week: pos.week, done: false, note: d?.note || '' });
}

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
  else if (e.target.id === 'check-notiz') setCheck(Number(e.target.dataset.week), 'notiz', e.target.value);
  else if (e.target.id === 'week-gespraech') setCheck(Number(e.target.dataset.week), 'gespraech', e.target.value);
  else if (e.target.id === 'plan-thema') { S.plan.thema = e.target.value.slice(0, 200); save(); }
  else if (e.target.form?.id === 'plan-day') { const d = planDay(today()); if (d) { d.note = e.target.value; save(); } }
  else if (e.target.form?.id === 'plan-check') {
    const f = e.target.form, week = Number(f.dataset.week), { name, value } = e.target;
    const n = value === '' ? null : Math.round(Number(value));
    const ok = n === null || (Number.isInteger(n) && n >= (name === 'sekunden' ? 1 : 0) && n <= (name === 'sekunden' ? 3600 : 999));
    if (!ok) return;
    setCheck(week, name, n);
    $('#rate').textContent = fmtNum(fillerRate(S.plan.checks[week]));
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'import' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'ch') { e.preventDefault(); completeChallenge(e.target); }
  else if (e.target.id === 'plan-start') {
    e.preventDefault();
    S.plan = { ...defaultPlan(), thema: e.target.thema.value.trim().slice(0, 200), start: today() };
    save(); location.hash = '#/plan/training/1';
  } else if (e.target.id === 'plan-day') {
    e.preventDefault();
    const d = planDay(today());
    if (!d) return;
    d.done = true; d.note = e.target.note.value; save();
    location.hash = '#/plan/geschafft';
  }
});

document.addEventListener('keydown', e => {
  if (location.hash !== '#/wiederholen' || e.target.matches('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ' && !ui.revealed && dueList().length) { e.preventDefault(); ui.revealed = true; render(); }
  else if (ui.revealed && ['1', '2', '3', '4'].includes(e.key)) grade(GRADES[Number(e.key) - 1]);
});

// ---------- Start ----------
async function loadContent() {
  const get = name => fetch(`content/${name}.json`).then(r => { if (!r.ok) throw new Error(`content/${name}.json: ${r.status}`); return r.json(); });
  const [techniken, challenges, tipps, plan] = await Promise.all(['techniken', 'challenges', 'tipps', 'plan'].map(get));
  return { techniken, challenges, tipps, plan };
}

loadContent().then(c => { C = c; render(); }).catch(err => {
  $('#top').innerHTML = '<span class="mark">klartext<i></i></span>';
  app.innerHTML = `<div class="empty"><p>Die Inhalte konnten nicht geladen werden (${esc(err.message)}). Starte die App über einen lokalen Server, nicht per Doppelklick auf die Datei.</p></div>`;
});

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; render(); });
addEventListener('appinstalled', () => { installPrompt = null; render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
