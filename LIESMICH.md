# Notenreader

Eigene Web-App zum Lesen von Noten-PDFs auf iPad, iPhone und Mac.

## Was sie kann (Version 1.10)
- **Lineal und Retusche:** Im Anmerke-Modus das Lineal-Symbol. „Linie“ zieht gerade Linien (rasten waagerecht/senkrecht ein), „Notensystem“ zieht 5 Notenlinien auf einmal auf (schräg nach unten ziehen bestimmt den Linienabstand, wird gemerkt). Retusche: „Weißer Pinsel“ malt frei weiß über, „Abdecken“ legt ein weißes Rechteck, „Lasso“ deckt eine umfahrene Fläche weiß ab. Alles lässt sich mit demselben Werkzeug antippen, verschieben, am orangen Griff anpassen und löschen; Strichstärke über die drei Stärke-Knöpfe.
- **Abgleich zwischen Geräten:** Einstellungen → „Abgleich exportieren“ schreibt Tags, Anmerkungen, Setlists, Löschungen und die seit dem letzten Abgleich neuen PDFs in eine Datei „Notenreader-Abgleich …json“ (auf dem iPad über das Teilen-Menü „In Dateien sichern“ → iCloud Drive). Auf dem anderen Gerät „Abgleich einlesen“. Stücke werden über Dateiname und Größe erkannt, die jeweils neuere Änderung gewinnt. Die Daten jedes Geräts liegen sonst getrennt im Browser-Speicher.
- **Noten abfotografieren:** Im Eingang „Fotografieren“ oder unter Importieren „Noten fotografieren“ / „Fotos von Noten“. Die vier Eckpunkte auf die Blattecken ziehen (mit Lupe), „Übernehmen“ zieht die Seite gerade. Die Scan-Optik entfernt Schatten und macht das Papier weiß. Beliebig viele Seiten nacheinander aufnehmen, Reihenfolge ändern, dann „Als Stück sichern“: daraus wird ein PDF, das im Eingang zum Taggen landet.
- **Bildschirm anlassen:** Unter Einstellungen „Beim Lesen“ (Standard), „Immer“ oder „Aus“. Nutzt die Wake-Lock-Funktion des Browsers, auf iPad/iPhone zusätzlich ein stummes Mini-Video (vendor/wach.mp4), weil ältere iOS-Versionen die Funktion in Home-Bildschirm-Apps ignorieren.
- **Vollbild beim Lesen:** Auf dem iPad werden beim Öffnen von Noten Uhrzeit und Statusleiste ausgeblendet (Einstellungen, abschaltbar; auf dem iPhone von Apple nicht erlaubt). Der Leseansicht-Hintergrund ist weiß und ohne Ränder, damit nichts ablenkt.
- **Übersicht für große Sammlungen:** Umschalter Liste/Kacheln neben der Sortierung. Die Liste zeigt kompakte Zeilen mit ID, Titel, Komponist, Instrument, Genre und Tags. Je nach Sortierung gruppiert (Anfangsbuchstabe, Komponist, Genre, ID) mit mitlaufenden Überschriften. Am rechten Rand eine A–Z-Leiste zum Springen (tippen oder mit dem Finger entlangfahren). Filter zeigen die Anzahl je Wert, darüber steht, wie viele Stücke gerade angezeigt werden.

- **Bibliothek:** PDFs importieren (Knopf „Importieren“ oder auf dem Mac per Ziehen), mit Vorschaubild, Titel, Komponist und Stichwörtern. Suche und Sortierung nach Titel, Komponist, zuletzt gespielt oder neu hinzugefügt.
- **Eingang:** Eigene Seite für neue, noch nicht verschlagwortete Noten (z. B. Mail-Anhänge). Große Vorschau der ersten Seite, daneben Titel, ID, Komponist, Instrument, Genre, Tags. Vorhandene Werte antippen, neue eintippen, „Sichern & weiter“ (oder Enter) springt zum nächsten Stück. Der rote Zähler am Reiter zeigt, wie viele noch offen sind.
- **Verschlagwortung:** Jedes Stück hat Titel, Komponist, Instrument(e), Genre, Tags und eine ID. Die ID wird beim Import fortlaufend vergeben (0001, 0002 …) und ist frei änderbar; doppelte IDs werden gemeldet. Nach dem Import fragt die App gleich nach Instrument, Genre und Tags.
- **Filtern und Suchen:** Auswahllisten für Instrument, Genre und Tag. Die Suche findet Titel, Komponist, ID, Instrument, Genre und Tags. Sortieren auch nach ID oder Genre.
- **Mehrere auf einmal:** Mit „Auswählen“ mehrere Stücke markieren und gemeinsam verschlagworten oder in eine Setlist legen.
- **forScore-Sicherung (.4sb):** Importieren → „forScore-Sicherung“. Übernimmt alle PDFs mit Titel, Komponist, Labels (→ Instrument), Genre, Referenz (→ ID), Bibliotheken (→ Tags), Schlagwörtern (→ Suchbegriffe), Bewertung und Schwierigkeit, dazu die Setlists und die handschriftlichen Anmerkungen. Abbrechen und später fortsetzen geht, schon übernommene Stücke werden übersprungen. Textfeld-Anmerkungen aus forScore werden noch nicht übernommen.
- **Massenimport:** Ganzen Ordner (auch Unterordner) auf einmal einlesen, mit Fortschrittsanzeige. Schon vorhandene Dateien werden übersprungen.
- **Schlagwörter aus Tabelle:** Liegt eine CSV/TSV-Tabelle (z. B. Metadaten-Export aus forScore) dabei, ordnest du einmal die Spalten zu (Dateiname, Titel, ID, Komponist, Instrument, Genre, Tags) und alle Stücke bekommen ihre Schlagwörter. Geht auch nachträglich für schon importierte Stücke.
- **Lesen im Vollbild:** Tippen auf den rechten oder linken Rand blättert, Wischen auch. Tippen in die Mitte blendet die Leisten ein und aus. Der Bildschirm bleibt beim Lesen an.
- **Pedal und Tastatur:** Pfeiltasten, Bild auf/ab, Leertaste und Enter blättern. Damit funktionieren die üblichen Bluetooth-Blätterpedale (z. B. AirTurn, PageFlip) im Tastatur-Modus.
- **Ansichten:** „Ganze Seite“ (auf dem iPad quer zwei Seiten nebeneinander), „Immer eine Seite“, „Breite füllen“ (fürs iPhone quer: Umblättern scrollt erst nach unten).
- **Anmerkungen:** Stift in Schwarz, Rot, Blau, Textmarker, Radierer, drei Strichstärken, Rückgängig. Sobald der Apple Pencil benutzt wurde, zeichnen Finger nicht mehr mit (Handballen).
- **Musikzeichen und Korrekturen:** Im Anmerke-Modus über das Notensymbol eine Palette öffnen (Dynamik pp bis fff, sfz, fp, Crescendo- und Decrescendo-Gabel, Akzent, Staccato, Tenuto, Marcato, Fermate, Atemzeichen, Zäsur, Vorzeichen, Noten, Pausen, Segno, Coda, Wiederholungen, Schlüssel). Zeichen wählen, auf die Stelle tippen, danach mit dem Finger verschieben, am orangen Griff vergrößern, mit dem roten x löschen. Gabeln werden waagerecht gezogen. „Abdecken“ legt ein weißes Rechteck über falsche Noten, darauf kann man neu stempeln oder schreiben. „T“ fügt Text ein (z. B. „D.S. al Fine“). Das Original-PDF bleibt immer unverändert. Notenschrift: Bravura (SIL Open Font License, siehe vendor/BRAVURA-OFL.txt).
- **Setlists:** Stücke zusammenstellen, Reihenfolge ändern, durchspielen. Am Ende eines Stücks blättert das Pedal direkt ins nächste.
- **Sicherung:** Unter Einstellungen alle Noten, Anmerkungen und Setlists als eine Datei exportieren und wieder einlesen (z. B. aufs andere Gerät).
- **Offline:** Nach dem ersten Öffnen läuft die App ohne Internet.

Die Noten werden nur lokal auf dem jeweiligen Gerät gespeichert, nicht in der Cloud.

## Wie kommt die App aufs iPad/iPhone?

Eine Web-App muss einmal über eine **https-Adresse** ausgeliefert werden. Einfach die Datei `index.html` aus iCloud Drive öffnen reicht leider nicht, das blockiert iOS.

Danach in Safari: Teilen-Menü → **„Zum Home-Bildschirm“**. Dann startet der Notenreader wie eine normale App.

Einfachster Weg zu einer https-Adresse: **GitHub Pages** (kostenlos). Den Inhalt dieses Ordners in ein GitHub-Repository legen und unter Settings → Pages veröffentlichen.

## Zum Ausprobieren auf dem Mac

Im Terminal in diesem Ordner:

    python3 -m http.server 8000

Dann in Safari oder Chrome `http://localhost:8000` öffnen.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. PDF-Darstellung mit PDF.js 4.10 (Apache-2.0, Lizenz in `vendor/PDFJS-LICENSE`). Daten liegen in IndexedDB des Browsers.

Bei Änderungen an den Dateien in `sw.js` die Versionsnummer `CACHE` erhöhen, damit installierte Apps das Update laden.
