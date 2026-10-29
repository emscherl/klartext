// Erweiterungspunkt für späteres Feedback auf Antworten (z. B. durch eine KI). In Version 1 inaktiv.
//
// Ein Anbieter ist ein Objekt { name, async review({ challenge, entry, techniques }) }, das
// { text } oder null liefert. Die App hängt das Ergebnis als { source, text, createdAt }
// an entry.feedback an und zeigt es unter der Antwort. Solange provider null ist,
// erscheint nirgends ein Feedback-Knopf.
export const provider = null;
