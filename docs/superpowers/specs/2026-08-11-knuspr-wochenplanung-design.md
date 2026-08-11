# Knuspr-Wochenplanung und Warenkorb – Design

## Ziel

Der Branch `feature/knuspr-only` entwickelt das Feierabend-Kochbuch von einem lokalen Drei-Händler-Angebotsvergleich zu einem lieferorientierten Knuspr-Wochenplaner weiter. Die Anwendung plant sieben unterschiedliche Abendessen für zwei Personen, ordnet den benötigten Zutaten konkrete verfügbare Knuspr-Produkte zu und überträgt einen vom Nutzer bestätigten Entwurf über den offiziellen Knuspr-MCP-Server in dessen bestehenden Warenkorb.

Der Ablauf endet immer beim vorbereiteten Warenkorb. Lieferfenster, Ersatzoptionen beim Checkout, Bezahlung und das verbindliche Absenden der Bestellung bleiben ausschließlich beim Nutzer.

## Leitlinien

- Nur Knuspr ist eine aktive Produkt-, Preis- und Warenkorbquelle.
- Die Planung optimiert auf gute Preis-Leistung, nicht blind auf den niedrigsten Artikelpreis.
- Jede Warenkorbänderung ist vorab sichtbar und benötigt eine ausdrückliche Bestätigung.
- Bereits vorhandene Warenkorbpositionen werden respektiert und nie ungefragt gelöscht.
- Rezepte und der letzte gespeicherte Plan bleiben auch ohne Knuspr-Verbindung lesbar.
- Die Hauptabläufe sind mobil zuerst, schnell, barrierearm und ab 320 Pixel Viewportbreite bedienbar.

## Nicht-Ziele

- Die Anwendung bestellt oder bezahlt nicht automatisch.
- Sie reserviert kein Lieferfenster.
- Sie speichert kein Knuspr-Passwort und implementiert keinen eigenen Login.
- Sie nutzt keine Browser-Automatisierung und keinen HTML-Import als Rückfalllösung.
- Sie ergänzt den Warenkorb nicht künstlich, nur um einen Mindestbestellwert zu erreichen.
- Sie vergleicht Knuspr nicht mit REWE, EDEKA, Kaufland oder anderen Händlern.

## Bestehender Funktionsumfang

Das Kochbuch, Rezeptsuche, Favoriten, Ausschlüsse, Mengen, Meal-Prep, Druckansicht und PWA-Grundfunktionen bleiben erhalten. Die bestehende Planung wird auf sieben Abendessen der Folgewoche konzentriert. Weiterhin gelten:

- zwei Portionen pro geplantem Abendessen,
- kein Fisch und keine Meeresfrüchte,
- keine vom Nutzer ausgeschlossenen Zutaten,
- sieben unterschiedliche Gerichte, sofern der verbleibende Rezeptpool dies erlaubt,
- mindestens die Hälfte vegetarische Gerichte, sofern der verbleibende Rezeptpool dies erlaubt.

## Architektur

### Knuspr-MCP-Adapter

Der Node-Server erhält einen klar abgegrenzten Adapter für `https://mcp.knuspr.de/mcp`. Er kapselt:

- OAuth-Verbindungsstatus und Wiederverbindung,
- MCP-Werkzeugerkennung,
- Produktsuche, Angebote und Verfügbarkeit,
- Lesen und Verändern des Warenkorbs,
- Normalisierung der Knuspr-Antworten in interne Produkt- und Warenkorbmodelle,
- Zeitüberschreitungen, begrenzte Wiederholungen und verständliche Fehlerklassen.

Planner und HTTP-Routen greifen ausschließlich auf die interne Adapter-Schnittstelle zu. Namen oder Antwortdetails einzelner MCP-Tools gelangen nicht in UI- oder Planungslogik. Damit kann sich die Werkzeugoberfläche des MCP-Servers ändern, ohne das gesamte Projekt zu koppeln.

### Authentifizierung

Die Verbindung verwendet den vom Knuspr-MCP-Server angebotenen OAuth-Ablauf. Der Browser erhält nur die Autorisierungs-URL und einen nicht sensiblen Verbindungsstatus. OAuth-Tokens werden ausschließlich serverseitig im nicht versionierten Laufzeitverzeichnis gespeichert und niemals an das Frontend ausgegeben oder protokolliert.

Der OAuth-Ablauf verwendet einen zufälligen `state`-Wert gegen Request-Forgery. Persistierte Authentifizierungsdaten erhalten restriktive Dateirechte. Abgelaufene oder widerrufene Sitzungen wechseln in den Zustand `reconnect-required`; die Anwendung fragt nie selbst nach dem Knuspr-Passwort.

### Planer

Der Planer arbeitet in zwei Stufen:

1. Harte Eignungsregeln filtern verbotene, ausgeschlossene oder nicht lieferbare Kombinationen.
2. Die verbleibenden Rezepte und Produkte werden nach Preis-Leistung bewertet.

Knuspr ist die einzige externe Quelle. Es gibt keine Marktentscheidung, geteilten Einkäufe, lokalen Normalpreis-Scraper oder Händler-HTML-Caches mehr.

### Speicherung

Das Laufzeitverzeichnis enthält getrennte Dateien für:

- aktuellen Knuspr-Plan und dessen Schema-Version,
- OAuth-Sitzung,
- kurzlebigen Produktabfrage-Cache,
- editierbare Zusatzliste,
- noch nicht übertragene Warenkorbvorschau.

Sensible Authentifizierungsdaten und persönliche Produktpräferenzen werden nicht in das Repository aufgenommen. Ein alter Drei-Händler-Plan wird anhand der Schema-Version erkannt und nicht als aktueller Knuspr-Plan angezeigt.

## Produktauswahl

### Harte Kriterien

Ein Produkt kommt nur infrage, wenn es:

- zur gesuchten Zutat und notwendigen Ausführung passt,
- aktuell als verfügbar gemeldet wird,
- keine Ausschlussregel verletzt,
- bei Fleisch den benötigten Zuschnitt ausreichend genau trifft,
- eine interpretierbare Packungsmenge oder Stückzahl besitzt.

Mehrdeutige Treffer werden nicht automatisch gewählt. Sie erscheinen als offene Position mit passenden Alternativen.

### Preis-Leistungs-Rangfolge

Nach den harten Kriterien gilt folgende Rangfolge:

1. fachliche Passgenauigkeit zur Zutat,
2. ausreichende Gesamtmenge,
3. möglichst wenig unverwendeter Packungsüberschuss,
4. festgepinnte oder bereits bewährte Produkte,
5. belastbare Qualitätsmerkmale aus den MCP-Daten,
6. Angebots- und Grundpreis sowie Gesamtpreis der benötigten Packungen.

Ein günstigeres, aber unpassendes Produkt darf dadurch keinen fachlich passenden Treffer verdrängen. Bio, Marke oder Premiumstufe werden nur bevorzugt, wenn der Nutzer dies festpinnt oder Knuspr dafür ein belastbares, nutzbares Signal liefert. Fehlen Qualitätsdaten, behauptet die Anwendung keine Qualitätswertung.

### Rezeptauswahl

Die Rezeptbewertung berücksichtigt neben den bestehenden Ernährungs- und Abwechslungsregeln:

- Verfügbarkeit der wesentlichen Zutaten,
- Gesamtkosten für die tatsächlich benötigten Packungen,
- aktuell gemeldete Angebote,
- Packungsüberschuss,
- Wiederverwendung geöffneter Packungen in mehreren Gerichten.

Die Planung darf ein etwas teureres Gericht bevorzugen, wenn dadurch deutlich weniger Überschuss entsteht oder Zutaten sinnvoll über mehrere Tage verwendet werden.

## Dauerhafte Zusatzliste

Getränke, Vorräte und Haushaltsbedarf werden in einer editierbaren Liste unabhängig von Rezepten verwaltet. Ein Eintrag enthält:

- stabile interne ID,
- sichtbare Bezeichnung,
- Knuspr-Suchbegriff,
- gewünschte Anzahl oder Menge,
- Kategorie `getraenke`, `vorrat` oder `haushalt`,
- Aktiv- beziehungsweise Pausenstatus,
- optional eine festgepinnte Knuspr-Produkt-ID.

Einträge können angelegt, bearbeitet, pausiert, wieder aktiviert und gelöscht werden. Aktive Einträge werden bei jedem neuen Entwurf vorgeschlagen, aber vor der Übertragung gemeinsam mit den Rezeptzutaten kontrolliert. Die Liste startet leer; der Nutzer kann seine vorhandene Liste direkt in der Oberfläche einpflegen.

## Nutzerablauf

### Einmalige Verbindung

1. Der Nutzer öffnet die Einstellungen und wählt `Mit Knuspr verbinden`.
2. Der Server startet OAuth und der Nutzer genehmigt den Zugriff bei Knuspr.
3. Nach dem Rücksprung zeigt die Anwendung den Status `Verbunden`.

### Wochenplanung

1. `Wochenplan erstellen` lädt aktuelle Verfügbarkeit und Angebote.
2. Der Planer erstellt sieben Abendessen und konkrete Produktkandidaten.
3. Die Ansicht zeigt Gerichte, voraussichtliche Kochkosten, Lieferabdeckung und Warenwert.
4. Fehlende oder mehrdeutige Positionen sind als zu prüfende Aufgaben sichtbar.

### Warenkorbvorschau

Die Vorschau gliedert Positionen zuerst nach `Rezepte`, `Getränke` und `Haushalt/Vorrat`, innerhalb der Bereiche nach Warenabteilung. Sie zeigt:

- Produktname und optionales Bild,
- benötigte und bestellte Menge,
- Packungsanzahl und erwarteten Überschuss,
- Einzel-, Grund- und Gesamtpreis,
- Angebotshinweis,
- Verfügbarkeit,
- Begründung für die Auswahl,
- Aktionen für Alternative, Menge und Entfernen.

Ein Warenwert unter dem aktuell bekannten Mindestbestellwert wird sachlich angezeigt. Es werden keine ungefragten Füllartikel hinzugefügt.

### Warenkorbübertragung

1. Der Nutzer löst `Zu Knuspr übertragen` aus.
2. Der Server lädt Preise, Verfügbarkeit und den bestehenden Warenkorb erneut.
3. Haben sich relevante Daten geändert, wird der Entwurf aktualisiert und erneut zur Bestätigung angezeigt.
4. Ansonsten berechnet der Server nur die noch fehlenden Mengen. Bereits vorhandene ausreichende Mengen bleiben unverändert.
5. Der Adapter fügt die bestätigten Differenzen hinzu oder passt ausschließlich Positionen an, die aus demselben Entwurf stammen.
6. Die Abschlussansicht weist jede Position als erfolgreich, übersprungen oder fehlgeschlagen aus und verlinkt zum Knuspr-Warenkorb.

Eine stabile Entwurfsrevision und die Differenzbildung machen Wiederholungen idempotent: Ein erneuter Klick darf keine zusätzlichen Duplikate erzeugen.

## Oberfläche

### Gestaltungsrichtung

Die freigegebene Richtung `Geführter Wochenfluss` verwendet eine ruhige grüne Grundgestaltung, warme helle Flächen, klare Hierarchie und jeweils eine dominante nächste Aktion. Die Startansicht beantwortet zuerst:

- Ist Knuspr verbunden?
- Ist der Wochenplan vollständig lieferbar?
- Wie hoch ist der erwartete Warenkorb?
- Was ist der nächste notwendige Schritt?

Der Marktvergleich und die drei Händler-Statuskarten entfallen. Aus `Sparplan` wird `Wochenplan`; aus dem bisherigen Einkaufsbereich wird eine konkrete, kontrollierbare Knuspr-Warenkorbvorschau.

### Mobile Bedienung

- Kernfunktionen funktionieren ab 320 Pixel Breite ohne horizontales Scrollen.
- Navigation verwendet auf kleinen Viewports eine kompakte untere Leiste.
- Primäre Touch-Ziele sind mindestens 44 mal 44 CSS-Pixel groß.
- Die Warenkorbübergabe bleibt in einer festen unteren Aktionsleiste erreichbar.
- Warengruppen sind aufklappbar; Warnungen und offene Entscheidungen stehen vor langen Produktlisten.
- Desktop-Layouts nutzen zusätzlichen Platz, verändern aber weder Reihenfolge noch Bedeutung der mobilen Hauptaktionen.

### Barrierefreiheit

- Semantische Überschriften, Formulare und Schaltflächen,
- vollständige Tastaturbedienung und sichtbarer Fokus,
- verständliche Beschriftungen statt nur Farbe oder Symbolen,
- Statusmeldungen über geeignete Live-Regionen,
- ausreichender Text- und Bedienelementkontrast,
- Unterstützung von `prefers-reduced-motion`,
- keine Fokusfalle außerhalb echter Dialoge.

## Performance

- Lokale App-Hülle, Rezepte und der zuletzt gespeicherte Plan rendern ohne Warten auf MCP.
- Produktsuchen werden dedupliziert, gebündelt und mit einer kleinen festen Parallelitätsgrenze ausgeführt.
- Ein kurzlebiger Cache vermeidet identische Suchen während eines Planungsdurchlaufs; vor Warenkorbänderungen ist dennoch eine frische Prüfung Pflicht.
- Suchfelder sind verzögert, damit nicht jeder Tastendruck eine Anfrage auslöst.
- Produktbilder werden verzögert geladen und besitzen feste Abmessungen gegen Layoutsprünge.
- Lange Produktlisten rendern abschnittsweise; nicht sichtbare Gruppen erzeugen keine teuren Detailansichten.
- Kritische Aktionen zeigen Fortschritt, bleiben gegen Doppelklick gesperrt und blockieren nicht die gesamte Navigation.

## HTTP-Schnittstellen der Anwendung

Die genaue Benennung interner MCP-Tools bleibt im Adapter. Die Webanwendung benötigt fachliche Routen für:

- Knuspr-Verbindungsstatus, OAuth-Start, OAuth-Rücksprung und Trennen,
- Lesen und Schreiben der Zusatzliste,
- Erzeugen oder erneutes Würfeln eines Wochenplanentwurfs,
- Suchen und Auswählen von Produktalternativen,
- Lesen und Bearbeiten der Warenkorbvorschau,
- bestätigte, revisionsgebundene Übertragung in den Knuspr-Warenkorb.

Schreibende Routen verwenden den bereits vorhandenen Schutz für lokale beziehungsweise tokenautorisierte Aufrufe. OAuth- und Warenkorb-Routen ergänzen Prüfung von Ursprung, `state` und Entwurfsrevision.

## Fehlerbehandlung

- **Nicht verbunden:** Planung mit Live-Produkten und Warenkorbaktionen fordert zum Verbinden auf; lokale Inhalte bleiben verfügbar.
- **OAuth abgelaufen:** Status wechselt zu `Neu verbinden`; keine Passwortabfrage in der Anwendung.
- **MCP nicht erreichbar:** Letzter Plan bleibt lesbar, Live-Aktionen werden deaktiviert und können später wiederholt werden.
- **Zeitüberschreitung:** Begrenzter Wiederholungsversuch nur für sichere Lesezugriffe; Warenkorbänderungen werden erst nach erneutem Lesen des Warenkorbs wiederholt.
- **Kein eindeutiger Treffer:** Position bleibt offen und benötigt eine Alternative oder Entfernung.
- **Preis oder Bestand geändert:** Neuer Entwurf mit hervorgehobenen Änderungen; keine automatische Übertragung.
- **Teilweise Übertragung:** Erfolg und Fehler werden positionsgenau gespeichert. Der nächste Versuch berechnet erneut die fehlende Differenz.
- **Beschädigte lokale Daten:** Betroffene Datei wird nicht überschrieben; die UI bietet einen nachvollziehbaren Neustart der jeweiligen Liste oder Vorschau.

## Entfernung der bisherigen Händlerlogik

Im Knuspr-Branch werden aktive Implementierung und Dokumentation für REWE, EDEKA und Kaufland entfernt:

- Händler-HTML-Parser und Import-Endpunkte,
- automatisierte Händlerbrowser und Profile,
- gezielte Normalpreis-Scraper und Preis-Baselines,
- REWE-Preis-API und Beispieldateien,
- Marktvergleich, Marktentscheidung und geteilte Einkaufskörbe,
- Händlerkonfiguration, UI-Texte, README-Anleitungen und Service-Worker-Einträge,
- veraltete Plan- und Cache-Beispieldaten,
- Tests, die ausschließlich die entfernte Händlerlogik absichern.

Historische Planungsdokumente zu diesen Funktionen werden aus dem Arbeitsbaum entfernt und bleiben über die Git-Historie auffindbar. Allgemeine Tests für Rezepte, Ausschlüsse, Mengen, Einkaufsabteilungen und Meal-Prep werden auf das neue Datenmodell angepasst und beibehalten.

## Teststrategie

### Unit-Tests

- harte Produkt- und Rezeptfilter,
- Preis-Leistungs-Rangfolge,
- Packungsbedarf und Überschuss,
- Wiederverwendung über mehrere Gerichte,
- festgepinnte Produkte und Alternativen,
- Zusatzlistenvalidierung und Speicherung,
- Warenkorbdifferenz und Idempotenz.

### Adapter- und Server-Tests

Ein simulierter MCP-Server deckt ab:

- OAuth-Zustände und ungültigen `state`,
- Werkzeugerkennung und normalisierte Produktantworten,
- Zeitüberschreitungen und nicht verfügbare Werkzeuge,
- Preis- und Bestandsänderungen,
- Lesen eines bestehenden Warenkorbs,
- vollständige und teilweise erfolgreiche Übertragungen,
- sichere Wiederholung ohne Duplikate,
- Schutz sensibler Token in Antworten und Logs.

Tests sprechen standardmäßig niemals den echten Knuspr-Warenkorb an.

### UI- und Browser-Tests

- kompletter Ablauf von Verbindung über Planung und Vorschau bis zur simulierten Übertragung,
- Erstellen, Bearbeiten, Pausieren und Löschen der Zusatzliste,
- Produktalternative und Mengenänderung,
- Darstellung offener Entscheidungen und geänderter Preise,
- Navigation und feste Aktionsleiste bei 320, 375, 768 und breiten Desktop-Viewports,
- Tastaturnavigation, Fokusführung und Live-Status,
- keine aktiven Referenzen oder Bedienelemente der entfernten Händler.

## Abnahmekriterien

Die Umstellung ist fertig, wenn:

1. der Branch nur Knuspr als aktive Händlerquelle verwendet,
2. OAuth ohne Speicherung eines Passworts funktioniert,
3. sieben passende Abendessen anhand aktueller Knuspr-Daten geplant werden,
4. konkrete Produkte, Packungsmengen, Preise und offene Treffer vorab sichtbar sind,
5. eine editierbare dauerhafte Zusatzliste funktioniert,
6. eine bestätigte Vorschau idempotent in den bestehenden Warenkorb übertragen wird,
7. Checkout und Bestellung niemals automatisch ausgelöst werden,
8. alle automatisierten Tests ohne echten Warenkorbzugriff bestehen,
9. die Kernabläufe ab 320 Pixel Breite sowie per Tastatur vollständig bedienbar sind,
10. App-Hülle und letzter Plan auch bei einem MCP-Ausfall nutzbar bleiben.
