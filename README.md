# Klartext

Persönliches tägliches Kommunikationstraining als Web-App (PWA). Läuft am Rechner und am Handy, nach dem ersten Aufruf auch offline. Kein Login, keine Cloud: Alle Daten bleiben im Browser des jeweiligen Geräts.

## Was die App kann

- **Challenge des Tages:** jeden Tag eine neue Aufgabe, gemischt aus beruflichen und privaten Situationen. Entweder schriftlich (Antwort formulieren, danach eine mögliche Musterformulierung ansehen) oder im Alltag (erledigen, abschließen, kurz reflektieren). Passt sie nicht, gibt es per Klick eine Alternative.
- **Techniken:** Bibliothek mit 20 etablierten Kommunikationstechniken, jeweils mit Erklärung, Schritten, Beispiel, Übung, Merksatz und Quelle. Challenges verlinken die passenden Techniken.
- **Tipps & Kniffe:** 33 kurze, sofort anwendbare Tricks, einer davon täglich als Tipp des Tages.
- **Wiederholung:** Techniken aus abgeschlossenen Challenges kommen automatisch in den Wiederholungsplan, Techniken und Tipps lassen sich auch von Hand aufnehmen. Bewertung mit Nochmal, Schwer, Gut, Leicht; die Abstände wachsen (1 Tag, 3, 7, dann ca. das 2,5-Fache).
- **Fortschritt:** Serie, längste Serie, erledigte Challenges, Kalender der letzten vier Wochen, alle Antworten und Reflexionen zum Nachlesen und Weiterbearbeiten.
- **Sicherung:** Export als JSON-Datei, Import ersetzt den Stand auf dem Gerät.

Bedienung am Rechner in der Wiederholung: Leertaste deckt auf, 1 bis 4 bewertet.

## Starten

Voraussetzung: Node.js ab Version 20 (keine weiteren Pakete nötig).

```bash
npm start
```

Dann http://localhost:8080 öffnen. Anderer Port: `PORT=3000 npm start`.

Ohne Node geht auch jeder andere statische Server im Projektordner, z. B.:

```bash
python3 -m http.server 8080
```

Wichtig: Die App nicht per Doppelklick auf `index.html` öffnen, dann können die Inhalte nicht geladen werden.

## Als App installieren

- **Rechner (Chrome, Edge):** http://localhost:8080 öffnen, in der Adressleiste auf das Installieren-Symbol klicken.
- **Handy:** Browser lassen Service Worker nur über HTTPS (oder localhost) zu. Die App muss dafür auf einen HTTPS-Host, vorbereitet ist GitHub Pages (siehe unten). Veröffentlicht werden nur App und Inhalte, deine Antworten bleiben auf dem Gerät. Dann im Browser öffnen: iPhone in Safari über Teilen → Zum Home-Bildschirm, Android in Chrome über Menü → App installieren oder den Knopf unter Fortschritt → App.

Geprüft mit Chrome (DevTools-Protokoll, `Page.getInstallabilityErrors`): keine Installationshindernisse am Desktop und in der Android-Emulation; ohne Netz startet die App vollständig aus dem Offline-Speicher.

### Veröffentlichen über GitHub Pages

Der Workflow `.github/workflows/pages.yml` führt bei jedem Push auf `main` die Tests aus und veröffentlicht die App nur, wenn sie grün sind.

1. Auf GitHub ein neues Repository anlegen (privat geht nur mit einem kostenpflichtigen Plan; bei einem öffentlichen Repo sind Code und Inhalte sichtbar, deine Daten nicht).
2. Im Projektordner:

   ```bash
   git remote add origin https://github.com/<dein-name>/klartext.git
   git push -u origin main
   ```

3. Auf GitHub unter Settings → Pages bei „Source“ **GitHub Actions** wählen.
4. Nach ein bis zwei Minuten läuft die App unter `https://<dein-name>.github.io/klartext/`. Diese Adresse am Handy öffnen und installieren.

Inhalte ergänzen: Datei ändern, committen, pushen. Die installierte App holt sich die neue Fassung im Hintergrund.

Rechner und Handy haben getrennte Datenstände. Übertragen geht über Fortschritt → Sicherung exportieren bzw. importieren (der Import ersetzt den Stand auf dem Zielgerät).

## Tests

```bash
npm test
```

Abgedeckt: Tagesauswahl (gleicher Tag gleiche Challenge, keine Wiederholung an aufeinanderfolgenden Tagen über drei Jahre, jede Challenge kommt pro Runde genau einmal, Alternativen), Wiederholungslogik (Fälligkeit am Termin, wachsende Abstände, Zurücksetzen, Grenzen), Serie und Kennzahlen, Speichern/Neuladen, Export/Import samt Fehlerfällen sowie die Inhalte (Mindestumfang, Pflichtfelder, Quellen, gültige Verweise).

## Inhalte erweitern

Alle Inhalte liegen getrennt vom Code in `content/` als JSON. Neue Einträge einfach ans Ende der jeweiligen Liste hängen, danach `npm test` laufen lassen: Der Test meldet fehlende Felder und falsche Verweise.

Regeln für alle Dateien:

- `id` ist eindeutig, nur Kleinbuchstaben, Ziffern und Bindestriche, und wird **nie geändert**. Wiederholungsplan und Verlauf hängen an der ID.
- Deutsche Anführungszeichen („…“) brauchen in JSON keine Maskierung, gerade Anführungszeichen schon (`\"`).

### Technik (`content/techniken.json`)

```json
{
  "id": "kurzer-name",
  "name": "Anzeigename",
  "kategorie": "Zuhören | Verstehen | Feedback | Konflikt | Verhandlung | Klarheit | Selbstbehauptung | Selbstklärung",
  "urheber": "Wer hat sie entwickelt",
  "quelle": "Buch oder Artikel mit Jahr und Verlag",
  "kurz": "Zwei, drei Sätze Erklärung",
  "schritte": ["Schritt 1", "Schritt 2"],
  "beispiel": "Ein konkretes Beispiel",
  "uebung": "Eine Übung für den Alltag",
  "merksatz": "Ein Satz, der in der Wiederholung als Kern erscheint"
}
```

Nur Techniken mit belegbarer Quelle aufnehmen. Neue Kategorien erscheinen automatisch als eigene Gruppe.

### Challenge (`content/challenges.json`)

```json
{
  "id": "b17-kurzer-name",
  "titel": "Kurzer Titel",
  "bereich": "beruflich | privat",
  "typ": "schriftlich | alltag",
  "situation": "Ausgangslage",
  "aufgabe": "Was genau zu tun ist",
  "techniken": ["id-einer-technik"],
  "reflexion": ["Leitfrage 1", "Leitfrage 2"],
  "musterantwort": "Optional, nur bei schriftlich: eine mögliche Formulierung"
}
```

`techniken` muss mindestens eine vorhandene Technik-ID enthalten. Präfix `b` für beruflich, `p` für privat ist nur eine Konvention.

### Tipp (`content/tipps.json`)

```json
{ "id": "t34-kurzer-name", "titel": "Kurzer Titel", "kategorie": "Schreiben", "text": "Der Tipp in zwei, drei Sätzen", "technik": "optional: id-einer-technik" }
```

### Was beim Erweitern passiert

- Die Tagesauswahl mischt alle Challenges zu Runden; jede kommt pro Runde einmal dran. Ändert sich die Anzahl der Challenges, wird die Reihenfolge sofort neu gemischt. Betroffen ist auch die heutige Challenge, solange du sie noch nicht angefangen hast, und der Tipp des Tages. Bereits begonnene oder erledigte Tage behalten ihre Challenge. Direkt nach einer Erweiterung kann deshalb eine kürzlich erledigte Challenge früher wiederkommen als sonst.
- Neue Inhalte kommen über den Offline-Speicher spätestens beim übernächsten Start an (die App lädt im Hintergrund nach).

## Daten

Gespeichert wird im `localStorage` des Browsers unter dem Schlüssel `klartext:v1`. Die App lädt nichts von Dritten: Auch die Schriften (Geist und Geist Mono von Vercel, SIL Open Font License, siehe `fonts/OFL.txt`) liegen im Projekt. Browserdaten löschen löscht auch den Trainingsstand, deshalb regelmäßig exportieren. Sollte der gespeicherte Stand einmal unlesbar sein, startet die App leer und legt den Rohinhalt unter `klartext:v1:defekt` ab, statt ihn zu überschreiben.

## Spätere Erweiterung: Feedback auf Antworten

Vorbereitet, aber nicht eingebaut. Jeder Tageseintrag hat ein Feld `feedback` (Liste), das Export und Import schon mitführen. Für KI-Feedback reicht es, in `src/feedback.js` einen Anbieter einzutragen:

```js
export const provider = {
  name: 'mein-dienst',
  async review({ challenge, entry, techniques }) {
    // Antwort an einen Dienst schicken, Ergebnis zurückgeben
    return { text: '…' };
  },
};
```

Sobald `provider` gesetzt ist, zeigt die App nach dem Abschluss einen Knopf „Feedback holen“ und darunter die Rückmeldungen. Am Datenformat ändert sich nichts. Achtung: Damit verlassen Antworten das Gerät.

## Aufbau

```
index.html, style.css     Gerüst und Gestaltung (Design wie die Recall-App)
fonts/                    Geist und Geist Mono (lokal, SIL Open Font License)
.github/workflows/        Tests und Veröffentlichung über GitHub Pages
manifest.webmanifest, sw.js, icons/   PWA: Installation und Offline-Betrieb
src/app.js                Oberfläche und Navigation
src/daily.js              Tagesauswahl (deterministisch aus dem Datum)
src/srs.js                Wiederholungsplan
src/progress.js           Serie und Kennzahlen
src/store.js              Speichern, Export, Import, Prüfung importierter Daten
src/dates.js              Datumsrechnung in lokalen Kalendertagen
src/feedback.js           Erweiterungspunkt für Feedback
content/                  Techniken, Challenges, Tipps
tests/                    automatische Tests (node --test)
server.mjs                lokaler Server ohne Abhängigkeiten
scripts/make-icons.mjs    erzeugt die PNG-Icons neu
```
