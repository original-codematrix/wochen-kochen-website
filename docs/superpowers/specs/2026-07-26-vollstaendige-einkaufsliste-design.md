# Vollständige Einkaufsliste und strikte Produktzuordnung

## Ziel

Die Einkaufsliste muss ohne Öffnen der Rezeptdetails alle Pflichtzutaten der ausgewählten Gerichte enthalten. Eine Zutat darf nur durch ein Angebot oder einen öffentlichen Normalpreis ersetzt werden, wenn Produktart und – bei Fleisch – Zuschnitt tatsächlich passen.

## Vollständigkeitsregel

Für jedes im sichtbaren Plan ausgewählte Gericht werden alle Zutaten außer ausdrücklich als `optional` markierten Zutaten erfasst. Jede dieser Zutaten erhält intern eine eindeutige Kennung aus Rezept-ID und Zutatenposition.

Nach Aufbau der Einkaufsliste muss jede Kennung genau einer Einkaufsposition zugeordnet sein:

- passendes Angebot,
- passender öffentlich bestätigter oder gecachter Normalpreis,
- oder Originalzutat mit Rezeptmenge und Status `estimated`.

Eine fehlende Zuordnung ist ein Planungsfehler und darf nicht stillschweigend gespeichert werden. Unterschiedliche Zutaten derselben Preiskategorie bleiben unterschiedliche Bedarfe. Gleiche tatsächlich gekaufte Produkte dürfen über mehrere Gerichte aggregiert werden, müssen aber alle abgedeckten Zutatenkennungen behalten.

## Strikte Fleischzuschnitte

Die Produktzuordnung unterscheidet mindestens:

- Schnitzel,
- Geschnetzeltes,
- Filet,
- Medaillons,
- Hackfleisch,
- Nacken beziehungsweise Steak,
- Braten,
- Wings, Keulen und Brust.

Ein Schweinenackensteak darf kein Schweineschnitzel oder Schweinegeschnetzeltes ersetzen. Fehlt ein exakt geeigneter Treffer, erscheint zum Beispiel `Schweineschnitzel von der Frischetheke` mit `700 g` als eigene Einkaufsposition.

## Anzeige

Die bestehende Einzelseite bleibt unverändert aufgebaut. Ungefundene Pflichtzutaten stehen konkret unter `Weitere Zutaten`; es gibt keine pauschalen Zeilen wie `Weitere Zutaten für <Gericht>`. Ein unbekannter Einzelpreis wird als `Preis offen` und `geschätzt` angezeigt, niemals als künstlicher Centbetrag.

## Aktualisierung

Import, Wochenlauf und `Rezepte neu würfeln` erzeugen die vollständige Einkaufsliste automatisch neu. Der aktuelle gespeicherte Plan wird nach dem Fix einmal regeneriert.

## Tests

- Schweinenackensteak ersetzt kein Schweineschnitzel.
- Schweinenackensteak ersetzt kein Schweinegeschnetzeltes.
- Zwei verschiedene Zutaten derselben Kategorie bleiben beide abgedeckt.
- Jede nicht-optionale Zutat besitzt nach der Planung genau eine Zuordnung.
- Optionale Zutaten werden weiterhin nicht automatisch eingekauft.
- Bestehende Angebots-, Ausschluss-, Fisch-, Mengen- und Rezeptvielfaltstests bleiben grün.

