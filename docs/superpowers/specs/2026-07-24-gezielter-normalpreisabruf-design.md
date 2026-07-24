# Gezielter öffentlicher Normalpreisabruf

## Ziel

Der bestehende Angebotsplan soll für die tatsächlich ausgewählten Gerichte zusätzlich öffentlich sichtbare Produktpreise der drei fest konfigurierten Märkte erfassen. Der bestehende HTML-Import, die Angebotsparser, die Rezeptauswahl, Ausschlüsse, Meal-Prep und die manuelle Neuberechnung bleiben funktionsfähig.

## Märkte

- REWE Eching, Schlesierstraße 4, Markt-ID `440303`
- EDEKA Morsestraße 1, Markt-ID `234100`
- Kaufland Lohhof, Andreas-Danzer-Weg 2, Filiale `DE1820`

Es werden ausschließlich öffentliche Händlerseiten ohne Anmeldung verwendet. Schutzmaßnahmen werden nicht umgangen. Wenn eine Quelle keinen lokalen Preis veröffentlicht oder den Abruf ablehnt, gilt der Abruf als eingeschränkt und nicht als bestätigter Preis.

## Ablauf

1. Der vorhandene Wochenlauf lädt und filtert Angebote wie bisher.
2. Ein erster Planlauf wählt die zehn verschiedenen Gerichte.
3. Aus diesen Gerichten werden ausschließlich kategorisierbare, nicht optionale Zutaten abgeleitet und nach Kategorie dedupliziert.
4. Für diese Suchbegriffe werden öffentliche Händlerseiten mit begrenzter Parallelität und einem Cache abgefragt.
5. Erkannte Produktpreise werden als `regular`, `offer`, `previous` oder `stale-regular` mit Markt, Produkt, Packung, URL und Abrufzeit gespeichert.
6. Ein zweiter Planlauf bewertet die benötigten Zutaten mit diesen Preisdatensätzen und erstellt Einkaufsliste und Marktvergleich neu.

## Daten und Transparenz

Der Cache liegt in `runtime-data/regular-price-cache.json` und ist ein reines Laufzeit-Artefakt. Ein bestätigter öffentlicher Preis wird sieben Tage frisch verwendet. Danach darf er weitere 28 Tage nur als `stale-regular` mit seinem ursprünglichen Abrufdatum verwendet werden. Fehlt auch ein Cachepreis, bleibt die bestehende Schätzung erhalten.

Ein Cacheeintrag enthält mindestens:

```json
{
  "market": "REWE Eching",
  "query": "Nudeln",
  "name": "ja! Spaghetti 500g",
  "package": "500 g",
  "price": 0.79,
  "priceType": "regular",
  "sourceUrl": "https://www.rewe.de/...",
  "capturedAt": "2026-07-24T15:30:00.000Z"
}
```

Ein Preis ohne sichtbare Produktbezeichnung und Endpreis wird verworfen. Niedrigster 30-Tage-Preis, App-Preis und ehemaliger Preis werden nicht als aktueller Normalpreis ausgegeben.

## Ausfallsicherheit

- Der öffentliche Normalpreisabruf ist optional: Fehler dürfen den Angebotslauf nicht abbrechen.
- Schreibvorgänge erfolgen atomar über eine temporäre Datei.
- Pro URL wird höchstens einmal innerhalb der Cachefrist abgerufen.
- Direkter HTTP-Abruf wird bevorzugt; der vorhandene Browser-Fallback darf ohne manuelle Anmeldung verwendet werden.
- Fisch und Meeresfrüchte werden vor Speicherung erneut herausgefiltert.
- Der bestehende `runtime-data/current-plan.json` wird erst ersetzt, wenn der vollständige Plan erfolgreich erzeugt wurde.

## Oberfläche

Die bestehende Einzelseite bleibt bestehen. Einkaufspositionen zeigen Preisart und Quelle:

- `Angebot` für aktuelle Wochenangebote
- `Normalpreis · öffentlich geprüft` für aktuelle Produktpreise
- `zuletzt gesehen am …` für veraltete Cachepreise
- `geschätzt` für interne Richtwerte

Der Quellenstatus nennt je Markt neben der Zahl der Angebote auch die Abdeckung der gezielt geprüften Zutaten.

## Rezepttext Brühe

Alle mengenmäßig angegebenen Brühen werden eindeutig als zubereitete Flüssigkeit formuliert, zum Beispiel:

`300 ml zubereitete Brühe (Wasser + Brühenpulver/-würfel nach Packungsangabe)`

Fond bleibt eine optionale, nicht automatisch eingekaufte Alternative.

## Tests

- Parserfixtures für öffentliche Produktkarten und Preisarten
- Cachefrische, veralteter Cache und fehlgeschlagene Quellen
- Ableitung nur benötigter Zutaten
- Planer nutzt bestätigte Normalpreise, behält Angebotspreise vorrangig und kennzeichnet Schätzungen
- kein Fisch/Seafood
- bestehende 52 Tests bleiben grün
- Browser-Smoke-Test der Einzelseite

