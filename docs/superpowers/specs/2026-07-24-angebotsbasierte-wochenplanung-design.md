# Angebotsbasierte Wochenplanung für drei Märkte

## Ziel

Die bestehende Kochbuch-Website wird zu einer selbst gehosteten Wochenplanung erweitert. Ein wöchentlicher Lauf liest die veröffentlichten Preise und Angebote dreier festgelegter Märkte aus und erstellt daraus einen günstigen, abwechslungsreichen Abendessensplan für zwei Personen.

Berücksichtigte Märkte:

- REWE, Schlesierstraße 4, 85386 Eching, Markt-ID 440303
- EDEKA, Morsestraße 1, 85716 Unterschleißheim
- Kaufland, Andreas-Danzer-Weg 2, 85716 Unterschleißheim-Lohhof

Die Planung bevorzugt ein gutes Preis-Leistungs-Verhältnis. Fleisch von der Frischetheke wird bevorzugt, wenn Preis und Verfügbarkeit dies sinnvoll erlauben; abgepackte Ware bleibt eine zulässige Alternative.

## Haushalts- und Essensregeln

- Zwei Personen, ein Abendessen pro Tag
- Rezepte ergeben in der Regel vier Portionen und dürfen höchstens zwei aufeinanderfolgende Tage eingeplant werden
- Tomaten und Champignons werden getrennt serviert
- Brokkoli wird weich gegart
- Fisch und Meeresfrüchte sind vollständig ausgeschlossen, einschließlich Garnelen, Muscheln, Tintenfisch und Hummer
- Vorräte werden vor der Erstellung der Einkaufsliste abgezogen
- Geschmack, Qualität und Abwechslung haben Vorrang vor einer rein mathematisch billigsten Zusammenstellung

## Systemarchitektur

Die Anwendung besteht künftig aus zwei Teilen:

1. Eine statische Browseroberfläche für Wochenplan, Rezepte, Vorräte, Angebote und Einkaufsliste.
2. Ein kleiner Node.js-Server, der die Website ausliefert, Händlerdaten abruft, normalisiert, speichert und den Planer ausführt.

Der Server verwendet pro Händler einen separaten Adapter. Dadurch kann eine geänderte Händlerseite repariert werden, ohne den Planer oder die anderen Adapter anzupassen.

Die normalisierten Angebots- und Preisdaten werden als lokale JSON-Dateien gespeichert. Favoriten, Häkchen und rein persönliche Einstellungen können weiterhin im Browser verbleiben. Vorräte werden serverseitig gespeichert, damit der automatische Wochenlauf sie berücksichtigen kann. Die Anwendung ist für einen privaten Einzelhaushalt ohne Benutzerverwaltung vorgesehen und soll nur im geschützten Heimnetz beziehungsweise hinter der vorhandenen Zugriffskontrolle betrieben werden.

## Preisquellen und Verlässlichkeit

Jeder Preiseintrag erhält:

- Händler und konkrete Filiale
- Produktname und, soweit verfügbar, Marke
- Packungsmenge und Einheit
- Verkaufspreis und Grundpreis
- Angebots- oder Normalpreis
- gegebenenfalls vorherigen Vergleichspreis
- Gültigkeitszeitraum
- Quelle und Abrufzeitpunkt
- Herkunft Frischetheke oder abgepackt, soweit erkennbar
- Verlässlichkeitsstufe

Die Preisermittlung verwendet folgende Reihenfolge:

1. Aktueller veröffentlichter Filial- oder Onlineshoppreis
2. Aktueller Angebotspreis und veröffentlichter Vergleichspreis
3. Letzter bekannter Preis desselben Produkts in derselben Filiale
4. Manuell korrigierter oder vom Nutzer bestätigter Preis
5. Klar gekennzeichnete konservative Schätzung

REWE-Sortimentspreise können genutzt werden, soweit der ausgewählte Markt sie im Abholshop bereitstellt. Preise loser Waren und der Frischetheke bleiben Näherungswerte bis zum tatsächlichen Wiegen. EDEKA und Kaufland liefern öffentlich nicht durchgehend vollständige filialgenaue Normalpreiskataloge; dort ergänzen Preishistorie und manuelle Korrekturen die veröffentlichten Angebotsdaten.

Eine Schätzung darf nie wie ein bestätigter Preis dargestellt werden. Gesamtsummen zeigen zusätzlich, welcher Anteil bestätigt beziehungsweise geschätzt ist.

## Aktualisierungsrhythmus

Der reguläre Lauf startet freitagabends. Er lädt Angebote, die für die kommende Planungswoche gültig sind, und erzeugt einen vorläufigen Plan.

Da einzelne Händler ihre nächste Angebotswoche freitags möglicherweise noch nicht vollständig veröffentlicht haben, läuft samstagmorgens ein gezielter zweiter Versuch für fehlende, fehlerhafte oder noch nicht passende Quellen. Beide Zeitpunkte sind über Umgebungsvariablen konfigurierbar.

Zusätzlich bietet die Oberfläche einen manuellen Lauf. Jeder Lauf ist idempotent: Mehrfaches Ausführen erzeugt keine doppelten Datensätze und überschreibt einen freigegebenen Plan nicht stillschweigend. Ein neu berechneter Plan wird zunächst als Vorschlag gespeichert.

Für einen Einkauf am laufenden Freitag oder Samstag kann der Planer zusätzlich einen Kurzplan vom aktuellen Tag bis Sonntag erzeugen. Sonntage werden als geschlossene Einkaufstage behandelt.

## Ausfallsicherung

Wenn ein Händlerabruf fehlschlägt:

- bleiben die letzten gültigen Daten erhalten,
- wird die Quelle mit Fehler und Alter sichtbar markiert,
- wird kein alter Preis als aktuelles Angebot ausgegeben,
- versucht der Samstagslauf nur die betroffene Quelle erneut,
- kann eine normalisierte JSON-Datei manuell importiert werden,
- können einzelne Preise und Angebote in der Oberfläche korrigiert werden.

Ein Plan darf nur dann als vollständig bezeichnet werden, wenn alle für seine Bewertung benötigten Quellen entweder aktuell oder ausdrücklich vom Nutzer akzeptiert sind.

## Rezeptbewertung und Planer

Der bestehende Rezeptbestand wird weiterverwendet und um strukturierte Zutaten ergänzt. Freitext-Zutaten allein reichen für belastbare Mengen- und Preisvergleiche nicht aus. Jede relevante Zutat erhält eine normalisierte Produktgruppe, benötigte Menge, Einheit und zulässige Alternativen.

Der Planer arbeitet in dieser Reihenfolge:

1. Zeitraum und benötigte Mahlzeiten bestimmen
2. Vorhandene Vorräte abziehen
3. Rezepte anhand verfügbarer Angebote und Produktalternativen bepreisen
4. Unzulässige oder nicht passende Varianten ausschließen
5. Kombinationen für Abwechslung, Resteverwertung und maximal zwei gleiche Tage bilden
6. Den besten Ein-Markt-Warenkorb je Händler berechnen
7. Den günstigsten aufgeteilten Warenkorb berechnen
8. Eine begründete Einkaufsempfehlung erzeugen

Die Rezeptbewertung berücksichtigt:

- geschätzte Gesamtkosten der tatsächlich benötigten Mengen
- Nutzung guter Angebote statt bloßer Anzahl angebotener Zutaten
- Qualität und Frischethekenpräferenz
- Anteil bestätigter Preise
- Geschmack und vorhandene Rezeptbewertungen
- Abwechslung zwischen Fleisch, Beilagen und Zubereitungsarten
- sinnvolle Resteverwertung und Packungsgrößen
- aktive Kochzeit und Feierabendtauglichkeit

Ein günstigstes Gericht mit schwachen Qualitäts- oder Geschmackswerten verdrängt kein deutlich besser passendes Gericht wegen einer kleinen Ersparnis.

## Marktentscheidung

Die Standardempfehlung ist der günstigste vollständige Wocheneinkauf in genau einem Markt. Die Oberfläche zeigt für jeden Markt:

- geschätzte Gesamtsumme
- verwendete Angebote
- bestätigte und geschätzte Preisanteile
- nicht verfügbare oder ersetzte Produkte

Zusätzlich wird ein auf zwei oder drei Märkte verteilter Bestpreis berechnet. Mehrere Märkte werden nur empfohlen, wenn die Ersparnis im Verhältnis zu Warenmenge, Gesamtwert, zusätzlichen Stopps und Datenqualität sinnvoll ist.

Die Orientierungsschwelle beträgt 20 Euro pro Woche. Sie ist keine starre Regel:

- Bei kleinen Einkäufen muss die prozentuale Ersparnis deutlich sein.
- Bei großen Einkäufen kann eine knapp unter 20 Euro liegende Ersparnis sinnvoll sein, wenn die Aufteilung wenige klare Warengruppen betrifft.
- Bei vielen Einzelpositionen oder unsicheren Preisen wird eher ein Markt empfohlen.
- Die Begründung wird in verständlichem Text angezeigt.

## Benutzeroberfläche

Die vorhandene Gestaltung bleibt erhalten und wird um folgende Bereiche ergänzt:

- „Heute bis Sonntag“ für einen kurzfristigen Plan
- „Nächste Woche“ für Montag bis Sonntag
- Quellenstatus mit Gültigkeit, letztem Abruf und Fehlern
- Schaltfläche „Angebote aktualisieren und Plan neu berechnen“
- Angebotsübersicht nach Markt und Warengruppe
- Vorratsverwaltung mit Menge und Einheit
- Vergleich „ein Markt“ gegen „geteilt einkaufen“
- Begründung pro Rezept und pro Marktempfehlung
- Kennzeichnung für bestätigte, historische und geschätzte Preise
- Import und manuelle Korrektur als Ausfallsicherung

Ein Plan kann bestätigt werden. Spätere Aktualisierungen erzeugen danach einen neuen Vorschlag und verändern den bestätigten Einkaufsplan nicht automatisch.

## Server-Schnittstellen

Der Server stellt mindestens folgende lokale Endpunkte bereit:

- `GET /api/status` für Quellen- und Laufstatus
- `POST /api/refresh` für einen manuellen Angebotslauf
- `GET /api/offers` für normalisierte Angebote
- `GET /api/plans` und `POST /api/plans/generate`
- `POST /api/plans/:id/confirm`
- `GET` und `PUT /api/pantry` für Vorräte
- `POST /api/import` für normalisierte Ausweichimporte
- `PATCH /api/prices/:id` für manuelle Preiskorrekturen

Schreibende Endpunkte werden nur im privaten Betrieb freigegeben. Die Installationsanleitung beschreibt, dass der Server nicht ungeschützt ins öffentliche Internet gestellt werden darf.

## Speicherung und Konfiguration

Serverdaten liegen standardmäßig unter einem konfigurierbaren Datenverzeichnis und werden nicht in den Quellcode geschrieben. Benötigte Einstellungen:

- Port und Datenverzeichnis
- Zeitzone `Europe/Berlin`
- Zeitpunkte für Freitag- und Samstagslauf
- Aktivierung einzelner Händleradapter
- Händler-URLs beziehungsweise Marktkennungen
- Schwelle für Mehrmarkt-Empfehlungen

Die Anwendung erhält eine Beispielkonfiguration, Startskripte und eine Anleitung für direkten Node-Betrieb sowie Docker Compose. Persistente Daten werden als Volume eingebunden.

## Tests und Abnahmekriterien

Automatisierte Tests decken ab:

- Parser mit gespeicherten Händler-Fix­tures
- Normalisierung von Packungsgrößen, Einheiten und Grundpreisen
- Gültigkeitszeiträume über unterschiedliche Händlerwochen
- Preisquellen-Priorität und sichtbare Schätzkennzeichnung
- Vorratsabzug
- Rezeptmengen für zwei Personen und vier Portionen
- maximal zwei aufeinanderfolgende gleiche Gerichte
- Kurzplan bis Sonntag und vollständige Folgewoche
- Ein-Markt-Vergleich
- verhältnismäßige Mehrmarktentscheidung um die 20-Euro-Schwelle
- Schutz bestätigter Pläne vor stiller Überschreibung
- Verhalten bei fehlgeschlagenen oder veralteten Quellen

Die Funktion gilt als abgenommen, wenn ein manueller Lauf:

1. den Status aller drei Quellen anzeigt,
2. verfügbare aktuelle Daten speichert,
3. einen nachvollziehbaren Plan für die nächste Woche erzeugt,
4. bei Bedarf einen Kurzplan bis Sonntag erzeugt,
5. eine nach Märkten bepreiste Einkaufsliste nach Vorratsabzug liefert,
6. Unsicherheiten und fehlende Preise sichtbar ausweist,
7. und vollständig über die dokumentierten Startwege auf dem privaten Server betrieben werden kann.

## Nicht im ersten Umfang

- Automatisches Bestellen oder Reservieren von Waren
- Anmeldung an persönlichen Händlerkonten
- Automatisches Einlösen personalisierter Coupons
- Routenoptimierung oder Berechnung exakter Fahrtkosten
- Mehrbenutzerverwaltung
- Vollautomatische Kassenbonerkennung

Diese Punkte können später ergänzt werden, ohne die Kernarchitektur zu verändern.
