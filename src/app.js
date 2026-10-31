// Oberfläche: Hash-Routing, Rendern als Template-Strings, Ereignisse per Delegation.
import { todayKey, addDays, formatDe, isDateKey } from './dates.js';
import { pickForDay, alternativeForDay } from './daily.js';
import { GRADES, GRADE_LABELS, cardKey, newCard, gradeCard, nextInterval, dueCards } from './srs.js';
import { createStore, exportState, importState } from './store.js';
import { currentStreak, longestStreak, stats } from './progress.js';
import { provider as feedbackProvider } from './feedback.js';
import { WEEKS, defaultPlan, planPosition, weekDates, trainedDays, phaseOf, fillerRate, checkSeries, compareChecks, impulse, extendPlan } from './plan.js';
import { recordingSupported, startRecording, saveRecording, loadRecording, deleteRecording } from './recorder.js';

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
  return `<li><a class="row-btn" href="#/plan/woche/${pos.week}"><span class="name">Training: ${esc(w.titel)}<span class="sub">Woche ${pos.week} von ${WEEKS} · Tag ${pos.day} · ${trainedDays(S.plan.days, pos.week)}/7 geübt</span></span><span class="meta mono ${doneToday ? 'dim' : 'open'}">${doneToday ? 'erledigt' : 'offen'}</span></a></li>`;
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

// ---------- 12-Wochen-Plan ----------
const isWeekArg = a => /^\d{1,2}$/.test(a || '') && Number(a) >= 1 && Number(a) <= WEEKS;
const IMPULS_LABEL = { begriffe: 'Begriff des Tages', themen: 'Thema des Tages', fragen: 'Frage des Tages' };
const messThema = () => S.plan.thema || C.plan.messung.standardthema;
const fmtNum = n => (n === null || n === undefined ? '–' : String(n).replace('.', ','));
const fmtSec = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

function viewPlan() {
  const d = today();
  const P = C.plan;
  const pos = planPosition(S.plan.start, d);
  topBar(P.titel, '#/');
  if (!S.plan.start) {
    app.innerHTML = `
      <section class="stack" style="padding-top:12px">
        <span class="label">${esc(P.aufwand)}</span>
        <h2 class="headline">${esc(P.ziel)}</h2>
        <p class="prose">${esc(P.grundidee)}</p>
      </section>
      ${roadmap(pos)}
      <form id="plan-start" class="stack" autocomplete="off">
        <label class="lab"><span class="label">Thema deiner wöchentlichen Messaufnahme</span>
          <input class="field" name="thema" maxlength="200" value="${esc(S.plan.thema)}" placeholder="${esc(P.messung.standardthema)}"></label>
        <p class="source">Jede Woche sprichst du eine Minute zu diesem Thema. Bleib dabei, nur so werden die Aufnahmen vergleichbar.</p>
        <button class="btn primary wide" type="submit">Plan heute starten</button>
      </form>`;
    return;
  }
  const head = !pos.started
    ? `<section class="stack" style="padding-top:12px"><span class="label">Startet bald</span><h2 class="headline">Woche 1 beginnt am ${esc(formatDe(S.plan.start, false))}.</h2></section>`
    : pos.finished ? finishedSummary()
    : currentWeekBlock(pos, d);
  app.innerHTML = `
    ${head}
    ${roadmap(pos)}
    ${measureTable()}
    <section class="stack"><span class="label">Täglicher Ablauf · 10 bis 15 Minuten</span>
      <ol class="steps">${P.ablauf.map(a => `<li><span><b>${esc(a.titel)}</b> <span class="dim mono">${esc(a.minuten)} Min.</span><br>${esc(a.text)}</span></li>`).join('')}</ol></section>
    ${railsBlock()}
    <section class="section">
      <span class="label">Einstellungen</span>
      <label class="lab"><span class="label">Thema der Messaufnahme</span>
        <input class="field" id="plan-thema" maxlength="200" value="${esc(S.plan.thema)}" placeholder="${esc(P.messung.standardthema)}"></label>
      <p>Gestartet am ${esc(formatDe(S.plan.start, false))}. Kam etwas dazwischen, verlängere die aktuelle Woche: Der Plan rückt dann um sieben Tage nach hinten, Geübtes bleibt erhalten.</p>
      <div class="row">
        ${pos.started && !pos.finished ? '<button class="btn grow" data-act="plan-extend">Woche verlängern</button>' : ''}
        <button class="btn grow danger" data-act="plan-reset">Plan neu starten</button>
      </div>
    </section>`;
}

// Ein Tag zählt nur für die Woche, in der er abgehakt wurde (wichtig nach „Woche verlängern“)
const planDoneOn = (date, week) => !!S.plan.days[date]?.done && S.plan.days[date].week === week;

function currentWeekBlock(pos, d) {
  const w = C.plan.wochen[pos.week - 1];
  const doneToday = planDoneOn(d, pos.week);
  const ph = phaseOf(C.plan.phasen, pos.week);
  const done = trainedDays(S.plan.days, pos.week);
  const elapsed = (pos.week - 1) * 7 + pos.day;
  return `
    <section class="hero">
      <div class="big">${pos.week}</div>
      <div class="hero-meta"><strong>Woche von ${WEEKS}</strong><span class="mono dim">Phase ${ph.nr}: ${esc(ph.titel)} · Tag ${pos.day}</span></div>
    </section>
    <div class="bar" title="${elapsed} von ${WEEKS * 7} Tagen"><i style="width:${(elapsed / (WEEKS * 7)) * 100}%"></i></div>
    <section class="stack">
      <span class="label">Diese Woche</span>
      <ul class="rows"><li><a class="row-btn" href="#/plan/woche/${pos.week}"><span class="name">${esc(w.titel)}<span class="sub">${esc(w.ziel)}</span></span><span class="meta mono ${doneToday ? 'dim' : 'open'}">${doneToday ? 'heute erledigt' : 'heute offen'}</span></a></li></ul>
      ${weekDots(pos.week)}
      <p class="source">${done} von 7 Tagen geübt${S.plan.checks[pos.week] ? ' · Messaufnahme erledigt' : ' · Messaufnahme offen'}</p>
      <a class="btn ${doneToday ? '' : 'primary'} wide" href="#/plan/woche/${pos.week}">${doneToday ? 'Woche ansehen' : 'Heute trainieren'}</a>
    </section>`;
}

function weekDots(week) {
  if (!S.plan.start) return '';
  const d = today();
  return `<div class="days week">${weekDates(S.plan.start, week).map(k => `<i class="${planDoneOn(k, week) ? 'on' : ''} ${k === d ? 'today' : ''}" title="${esc(formatDe(k))}"></i>`).join('')}</div>`;
}

function roadmap(pos) {
  return `<section class="stack" style="gap:28px"><span class="label">Roadmap</span>${C.plan.phasen.map(ph => {
    const last = ph.wochen[ph.wochen.length - 1];
    const status = !pos.started ? 'kommt' : pos.finished || pos.week > last ? 'erledigt' : pos.week >= ph.wochen[0] ? 'läuft' : 'kommt';
    return `<div class="phase ${status === 'läuft' ? 'now' : ''}">
      <div class="phase-head"><span class="label">Phase ${ph.nr} · Woche ${ph.wochen[0]}–${last} · ${status}</span>
        <h3>${esc(ph.titel)}: ${esc(ph.untertitel)}</h3><p class="prose dim">Ziel: ${esc(ph.ziel)}</p></div>
      <ul class="rows">${ph.wochen.map(n => {
        const w = C.plan.wochen[n - 1];
        const cur = pos.started && !pos.finished && pos.week === n;
        const past = pos.started && (pos.finished || pos.week > n);
        const meta = cur ? 'aktuell' : past || trainedDays(S.plan.days, n) ? `${trainedDays(S.plan.days, n)}/7` : '';
        return `<li><a class="row-btn" href="#/plan/woche/${n}"><span class="name"><span class="mono dim wk">${String(n).padStart(2, '0')}</span> ${esc(w.titel)}</span><span class="meta mono ${cur ? 'open' : 'dim'}">${meta}${S.plan.checks[n] ? ' · ◉' : ''}</span></a></li>`;
      }).join('')}
        <li><a class="row-btn" href="#/plan/messung/${last}"><span class="name check-row">Check: ${esc(ph.check)}</span><span class="meta mono ${S.plan.checks[last] ? 'dim' : ''}">${S.plan.checks[last] ? 'gemessen' : ''}</span></a></li>
      </ul></div>`;
  }).join('')}<p class="source">◉ = Messaufnahme eingetragen</p></section>`;
}

function measureTable() {
  const rows = checkSeries(S.plan.checks);
  if (!rows.length) return `<section class="stack"><span class="label">Messwerte</span><p class="source">Noch keine Messaufnahme. Die erste gehört in Woche 1, sie ist dein Ausgangswert.</p></section>`;
  const cmp = rows.length > 1 ? compareChecks(S.plan.checks, rows[0].week, rows[rows.length - 1].week) : null;
  const maxRate = Math.max(1, ...rows.map(r => r.rate || 0));
  return `<section class="stack"><span class="label">Messwerte · ${esc(messThema())}</span>
    <table class="measure"><thead><tr><th>Woche</th><th>Füllwörter/Min.</th><th>Kernsatz</th><th>Roter Faden</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="mono"><a href="#/plan/messung/${r.week}">${r.week}</a></td>
      <td><span class="mbar"><i style="width:${r.rate === null ? 0 : (r.rate / maxRate) * 100}%"></i></span><span class="mono">${fmtNum(r.rate)}</span></td>
      <td class="mono">${r.kernsatz === null ? '–' : r.kernsatz ? 'ja' : 'nein'}</td><td class="mono">${r.klarheit ?? '–'}${r.klarheit ? '/10' : ''}</td></tr>`).join('')}
    </tbody></table>
    ${cmp ? `<p class="source">Woche ${rows[0].week} → ${rows[rows.length - 1].week}: ${cmp.rate ? `Füllwörter pro Minute ${fmtNum(cmp.rate.from)} → ${fmtNum(cmp.rate.to)}` : ''}${cmp.rate && cmp.klarheit ? ', ' : ''}${cmp.klarheit ? `roter Faden ${cmp.klarheit.from} → ${cmp.klarheit.to}` : ''}.</p>` : ''}
  </section>`;
}

function finishedSummary() {
  const cmp = compareChecks(S.plan.checks, 1, WEEKS);
  return `<section class="done">
      <span class="label">Plan abgeschlossen</span>
      <h2>Zwölf Wochen geschafft.</h2>
      <p>${Object.values(S.plan.days).filter(x => x.done).length} Trainingstage, ${Object.keys(S.plan.checks).length} Messaufnahmen.${cmp?.rate ? ` Füllwörter pro Minute: ${fmtNum(cmp.rate.from)} in Woche 1, ${fmtNum(cmp.rate.to)} in Woche 12.` : ''}</p>
      <p>Wähle eine Woche, die du wiederholen willst, oder starte eine neue Runde.</p>
    </section>`;
}

function railsBlock() {
  return `<section class="stack"><span class="label">Redeschienen zum Nachschlagen</span><ul class="rows">${C.plan.schienen.map(r => `
    <li><a class="row-btn" href="#/technik/${esc(r.technik)}"><span class="name">${esc(r.name)}<span class="sub">${r.folge.map(esc).join(' → ')}</span><span class="sub">${esc(r.wann)}</span></span></a></li>`).join('')}</ul></section>`;
}

function viewWeek(n) {
  const d = today();
  const w = C.plan.wochen[n - 1];
  const ph = phaseOf(C.plan.phasen, n);
  const pos = planPosition(S.plan.start, d);
  const isNow = pos.started && !pos.finished && pos.week === n;
  const day = S.plan.days[d]?.week === n ? S.plan.days[d] : null;
  topBar(`Woche ${n}`, '#/plan', `<span class="count">${n}/${WEEKS}</span>`);
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">Phase ${ph.nr}: ${esc(ph.titel)}${isNow ? ` · Tag ${pos.day}` : ''}</span>
      <h2 class="headline">${esc(w.titel)}</h2>
      <p class="prose task"><b>Wochenziel:</b> ${esc(w.ziel)}</p>
      <p class="prose dim">${esc(w.warum)}</p>
      ${S.plan.start && pos.started ? weekDots(n) : ''}
    </section>
    <section class="stack"><span class="label">Übung</span><ol class="steps">${w.uebung.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
    ${w.impulse.map(kind => impulseBlock(kind, d)).join('')}
    ${w.timer.length ? `<section class="stack"><span class="label">Timer</span>
      <div class="timer"><span id="timer" class="mono">${timer.id ? fmtSec(timerLeft()) : fmtSec(w.timer[0])}</span>
      <div class="row">${w.timer.map(t => `<button class="btn" data-act="timer" data-sec="${t}">${fmtSec(t)}</button>`).join('')}${timer.id ? '<button class="btn danger" data-act="timer-stop">Stopp</button>' : ''}</div></div></section>` : ''}
    ${practiceRecorder()}
    <section class="stack"><span class="label">Im Alltag</span><p class="prose">${esc(w.transfer)}</p></section>
    <section class="stack"><span class="label">Techniken dieser Woche</span>
      <div class="chips">${w.techniken.map(id => `<a class="chip" href="#/technik/${esc(id)}">${esc(tech(id)?.name || id)}</a>`).join('')}</div></section>
    ${w.tipps.length ? `<section class="stack"><span class="label">Kniffe</span><ul class="rows">${w.tipps.map(tip).filter(Boolean).map(t => `<li class="tip"><h3>${esc(t.titel)}</h3><p>${esc(t.text)}</p></li>`).join('')}</ul></section>` : ''}
    ${isNow ? `<form id="plan-day" class="stack" autocomplete="off">
      <label class="lab"><span class="label">Heute notiert: Was machst du morgen besser?</span>
        <textarea class="field" name="note" rows="3" placeholder="Eine Sache reicht.">${esc(day?.note)}</textarea></label>
      ${day?.done ? '<p class="status"><i></i>Heute geübt. Notizen werden automatisch gespeichert.</p><button type="button" class="link center" data-act="plan-undo">Doch nicht geübt</button>'
        : '<button class="btn primary wide" type="submit">Heute geübt</button>'}
    </form>` : !pos.started ? `<p class="source">${S.plan.start ? 'Der Plan startet bald.' : 'Vorschau. Starte den Plan, um Trainingstage abzuhaken.'}</p>`
      : `<p class="source">${pos.finished || pos.week > n ? 'Diese Woche liegt hinter dir. Du kannst die Übungen jederzeit wiederholen.' : 'Diese Woche kommt noch.'}</p>`}
    <a class="btn wide" href="#/plan/messung/${n}">${S.plan.checks[n] ? 'Messaufnahme ansehen' : 'Messaufnahme dieser Woche'}</a>
    <div class="row">${n > 1 ? `<a class="link" href="#/plan/woche/${n - 1}">← Woche ${n - 1}</a>` : ''}<span class="grow"></span>${n < WEEKS ? `<a class="link" href="#/plan/woche/${n + 1}">Woche ${n + 1} →</a>` : ''}</div>`;
}

function impulseBlock(kind, d) {
  const n = ui.impulseSkip[kind] || 0;
  const text = impulse(C.plan.impulse[kind], d, kind, n);
  return `<section class="stack"><span class="label">${IMPULS_LABEL[kind]}</span>
    <p class="quote impulse">${esc(text)}</p>
    <button class="link" style="align-self:flex-start" data-act="impulse" data-kind="${kind}">Anderes ziehen</button></section>`;
}

function practiceRecorder() {
  if (!recordingSupported()) return `<section class="stack"><span class="label">Aufnahme</span><p class="source">Nimm dich mit der Sprachmemo-App deines Handys auf. Dieser Browser kann nicht selbst aufnehmen.</p></section>`;
  const live = rec.session && rec.target === 'uebung';
  return `<section class="stack"><span class="label">Übungsaufnahme</span>
    <div class="row recorder">${live
      ? `<button class="btn primary danger" data-act="rec-stop">${I.stop}Stopp <span id="rec-time" class="mono">0 s</span></button>`
      : `<button class="btn" data-act="rec-start" data-target="uebung">${I.mic}Aufnehmen</button>`}
      ${rec.practiceUrl && !live ? `<audio controls src="${rec.practiceUrl}"></audio>` : ''}</div>
    <p class="source">Zum direkten Anhören. Wird nicht gespeichert, die nächste Aufnahme ersetzt sie.</p></section>`;
}

function viewCheck(n) {
  const c = S.plan.checks[n] || {};
  const ph = C.plan.phasen.find(p => p.wochen[p.wochen.length - 1] === n);
  const live = rec.session && rec.target === `messung-${n}`;
  const cmp = n > 1 ? compareChecks(S.plan.checks, 1, n) : null;
  topBar(`Messung Woche ${n}`, `#/plan/woche/${n}`);
  app.innerHTML = `
    <section class="stack" style="padding-top:12px">
      <span class="label">Messaufnahme · 1 Minute</span>
      <h2 class="headline">${esc(messThema())}</h2>
      <p class="prose dim">${esc(C.plan.messung.text)}</p>
      ${ph ? `<p class="prose task"><b>Check Phase ${ph.nr}:</b> ${esc(ph.check)}</p>` : ''}
    </section>
    ${recordingSupported() ? `<section class="stack"><span class="label">Aufnahme</span>
      <div class="row recorder">${live
        ? `<button class="btn primary danger" data-act="rec-stop">${I.stop}Stopp <span id="rec-time" class="mono">0 s</span></button>`
        : `<button class="btn" data-act="rec-start" data-target="messung-${n}">${I.mic}${rec.saved[n] ? 'Neu aufnehmen' : 'Aufnehmen'}</button>`}
        <audio controls data-week="${n}" hidden></audio></div>
      ${n > 1 ? `<div class="stack" data-compare hidden><span class="label">Woche 1 zum Vergleich</span><audio controls data-week="1"></audio></div>` : ''}
      <p class="source">Aufnahmen bleiben nur auf diesem Gerät und sind nicht in der Sicherung enthalten.</p>
      ${rec.saved[n] ? `<button class="link" style="align-self:flex-start" data-act="rec-delete" data-week="${n}">Aufnahme löschen</button>` : ''}
    </section>` : '<p class="source">Nimm dich mit der Sprachmemo-App deines Handys auf und trag die Werte hier ein.</p>'}
    <form id="plan-check" class="stack" autocomplete="off" data-week="${n}">
      <div class="row">
        <label class="lab grow"><span class="label">Füllwörter (Anzahl)</span><input class="field mono" name="fuellwoerter" type="number" inputmode="numeric" min="0" max="999" value="${c.fuellwoerter ?? ''}"></label>
        <label class="lab grow"><span class="label">Dauer (Sekunden)</span><input class="field mono" name="sekunden" type="number" inputmode="numeric" min="1" max="3600" value="${c.sekunden ?? 60}"></label>
      </div>
      <p class="source">Füllwörter pro Minute: <b class="mono" id="rate">${fmtNum(fillerRate({ fuellwoerter: c.fuellwoerter, sekunden: c.sekunden ?? 60 }))}</b></p>
      <div class="stack"><span class="label">Kernsatz im ersten Satz?</span>
        <div class="chips">${[['ja', true], ['nein', false]].map(([l, v]) => `<button type="button" class="chip ${c.kernsatz === v ? 'on' : ''}" data-act="check-set" data-field="kernsatz" data-value="${v}">${l}</button>`).join('')}</div></div>
      <div class="stack"><span class="label">Roter Faden (1 bis 10)</span>
        <div class="chips">${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<button type="button" class="chip num ${c.klarheit === v ? 'on' : ''}" data-act="check-set" data-field="klarheit" data-value="${v}">${v}</button>`).join('')}</div></div>
      <label class="lab"><span class="label">Notiz</span><textarea class="field" name="notiz" rows="3" placeholder="Was fällt dir auf, verglichen mit früher?">${esc(c.notiz)}</textarea></label>
      ${c.date ? `<p class="status"><i></i>Gespeichert am ${esc(formatDe(c.date, false))}.</p>` : ''}
    </form>
    ${cmp && (cmp.rate || cmp.klarheit) ? `<section class="stack"><span class="label">Seit Woche 1</span><p class="prose">${cmp.rate ? `Füllwörter pro Minute: ${fmtNum(cmp.rate.from)} → ${fmtNum(cmp.rate.to)}. ` : ''}${cmp.klarheit ? `Roter Faden: ${cmp.klarheit.from} → ${cmp.klarheit.to}.` : ''}</p></section>` : ''}
    <ul class="prompts">${C.plan.messung.kriterien.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`;
  hydrateAudio();
}

function setCheck(week, field, value) {
  const c = S.plan.checks[week] || (S.plan.checks[week] = { date: null, fuellwoerter: null, sekunden: 60, kernsatz: null, klarheit: null, notiz: '' });
  c[field] = value;
  c.date = today();
  save();
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
    if (location.hash.startsWith('#/plan/woche')) render();
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

// Gespeicherte Aufnahmen nachladen, sobald die Messansicht steht
async function hydrateAudio() {
  for (const el of document.querySelectorAll('audio[data-week]')) {
    const week = Number(el.dataset.week);
    try {
      if (!rec.urls[week]) {
        const r = await loadRecording(week);
        if (!r?.blob) { if (rec.saved[week]) { delete rec.saved[week]; render(); } continue; }
        rec.urls[week] = URL.createObjectURL(r.blob);
      }
      if (!rec.saved[week]) { rec.saved[week] = true; if (week === Number(location.hash.split('/')[3])) { render(); return; } }
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
  if (location.hash !== shownRoute) { stopTimer(); cancelRecording(); ui.impulseSkip = {}; shownRoute = location.hash; }
  switch (route) {
    // Nur heute oder Tage mit vorhandenem Eintrag, damit sich über die URL keine Tage abschließen lassen
    case 'challenge': return arg && !(isDateKey(arg) && (arg === today() || S.entries[arg])) ? viewHome() : viewChallenge(arg || today());
    case 'techniken': return viewTechniques();
    case 'technik': return viewTechnique(arg);
    case 'tipps': return viewTips();
    case 'wiederholen': return viewReview();
    case 'verlauf': return viewProgress();
    case 'plan': return arg === 'woche' && isWeekArg(arg2) ? viewWeek(Number(arg2))
      : arg === 'messung' && isWeekArg(arg2) ? viewCheck(Number(arg2))
      : viewPlan();
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
  else if (act === 'impulse') { ui.impulseSkip[el.dataset.kind] = (ui.impulseSkip[el.dataset.kind] || 0) + 1; render(); }
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
  } else if (act === 'plan-undo') {
    const day = S.plan.days[today()];
    if (day) { day.done = false; save(); render(); }
  } else if (act === 'plan-extend') {
    if (!confirm('Aktuelle Woche verlängern? Der Plan rückt um sieben Tage nach hinten.')) return;
    S.plan = extendPlan(S.plan); save(); render(); toast('Woche verlängert.');
  } else if (act === 'plan-reset') {
    if (!confirm('Plan neu starten? Trainingstage und Messwerte werden gelöscht, Aufnahmen bleiben auf dem Gerät, bis du sie einzeln löschst.')) return;
    S.plan = { ...defaultPlan(), thema: S.plan.thema }; save(); render(); toast('Plan zurückgesetzt.');
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
  else if (e.target.id === 'plan-thema') { S.plan.thema = e.target.value.slice(0, 200); save(); }
  else if (e.target.form?.id === 'plan-day') { const d = planDay(today()); if (d) { d.note = e.target.value; save(); } }
  else if (e.target.form?.id === 'plan-check') {
    const f = e.target.form, week = Number(f.dataset.week), { name, value } = e.target;
    if (name === 'notiz') setCheck(week, 'notiz', value);
    else {
      const n = value === '' ? null : Math.round(Number(value));
      const ok = n === null || (Number.isInteger(n) && n >= (name === 'sekunden' ? 1 : 0) && n <= (name === 'sekunden' ? 3600 : 999));
      if (!ok) return;
      setCheck(week, name, n);
      const c = S.plan.checks[week];
      $('#rate').textContent = fmtNum(fillerRate(c));
    }
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
    save(); location.hash = '#/plan/woche/1'; toast('Los geht\'s. Mach heute als Erstes die Messaufnahme.');
  } else if (e.target.id === 'plan-day') {
    e.preventDefault();
    const d = planDay(today());
    if (!d) return;
    d.done = true; d.note = e.target.note.value; save(); render();
    toast(`Geübt. ${trainedDays(S.plan.days, d.week)} von 7 Tagen in dieser Woche.`);
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
