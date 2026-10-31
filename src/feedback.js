// Feedback auf Antworten.
//
// 1. Claude fragen: Die App baut eine Anfrage mit Situation, Aufgabe, Techniken, Kriterien und
//    der eigenen Antwort. Sie wird in die Zwischenablage kopiert und Claude damit geöffnet.
//    Daten verlassen das Gerät nur, wenn man darauf tippt. Die Antwort kann man zurück in die App kopieren.
//
// 2. Erweiterungspunkt für Feedback direkt in der App (z. B. per API). Ein Anbieter ist ein Objekt
//    { name, async review({ challenge, entry, techniques }) }, das { text } oder null liefert.
//    Solange provider null ist, erscheint dafür kein Knopf.
export const provider = null;

export function claudePrompt({ challenge: c, entry: e, techniques }) {
  const written = c.typ === 'schriftlich';
  const lines = [
    'Ich trainiere meine Kommunikation mit kurzen Übungen. Gib mir bitte ehrliches, konkretes Feedback.',
    '',
    `Übung: ${c.titel}`,
    `Situation: ${c.situation}`,
    `Aufgabe: ${c.aufgabe}`,
  ];
  if (techniques.length) {
    lines.push('', 'Techniken, um die es geht:');
    for (const t of techniques) lines.push(`- ${t.name}: ${t.kurz} Merksatz: ${t.merksatz}`);
  }
  if (c.kriterien?.length) {
    lines.push('', 'Kriterien:');
    for (const k of c.kriterien) lines.push(`- ${k}`);
  }
  if (written) {
    lines.push('', 'Meine Antwort:', '"""', e.answer.trim(), '"""');
    if (e.reflection?.trim()) lines.push('', `Meine Reflexion dazu: ${e.reflection.trim()}`);
    lines.push('', 'Bitte antworte so:',
      '1. Was gelungen ist, konkret und mit kurzen Zitaten aus meiner Antwort.',
      '2. Was ich verbessern sollte, höchstens drei Punkte, jeweils begründet mit der Aufgabe oder der Technik.',
      '3. Eine überarbeitete Fassung, die nah an meinen Worten bleibt.',
      '4. Ein Satz: worauf ich beim nächsten Mal zuerst achte.');
  } else {
    lines.push('', 'So lief es bei mir:', '"""', e.reflection.trim(), '"""',
      '', 'Bitte antworte so:',
      '1. Was gut gelaufen ist und warum.',
      '2. Was ich beim nächsten Mal anders machen könnte, höchstens drei Punkte.',
      '3. Eine konkrete Formulierung, die ich in so einer Situation sagen könnte.',
      '4. Ein Satz: worauf ich beim nächsten Mal zuerst achte.');
  }
  lines.push('', 'Duze mich, antworte auf Deutsch, kurz und direkt.');
  return lines.join('\n');
}

// Öffnet einen neuen Chat mit vorausgefüllter Anfrage. Falls Claude das Feld nicht übernimmt,
// liegt die Anfrage in der Zwischenablage.
export const claudeUrl = prompt => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
