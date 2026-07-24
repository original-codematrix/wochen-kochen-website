# Unser Feierabend-Kochbuch – Angebotsplaner

Eine Website für Rezepte, Wochenplanung, Vorräte und den Preisvergleich von REWE Eching, EDEKA Morsestraße und Kaufland Lohhof.

## Direkt mit Node.js starten

Voraussetzung ist Node.js 22 oder neuer.

```bash
cp .env.example .env
npm ci
set -a
. ./.env
set +a
npm start
```

Danach `http://localhost:8080` öffnen. In den Einstellungen denselben Wert wie `REFRESH_TOKEN` eintragen, damit der manuelle Aktualisierungsknopf auch von einem anderen Gerät im Heimnetz funktioniert.

Ein einmaliger Wochenlauf ist über folgenden Befehl möglich:

```bash
npm run refresh
```

Der Lauf speichert seine Daten standardmäßig in `./runtime-data`.

### Empfohlen: Angebotsseite aus dem normalen Chrome übernehmen

REWE und EDEKA können automatisierte Browser trotz bestätigter Prüfung erneut blockieren. Dann funktioniert der Import über den normalen Chrome:

1. Im Sparplan auf die Statuskarte des gewünschten Markts klicken.
2. Die Angebotsseite vollständig laden und eine eventuelle Prüfung bestätigen.
3. Mit `Strg+S` beziehungsweise `⌘+S` speichern und „Webseite, nur HTML“ wählen.
4. Zurück im Sparplan auf `REWE-HTML`, `EDEKA-HTML` oder `Kaufland-HTML` klicken und die Datei auswählen.

Die Website liest die Angebote ein, entfernt Fisch und Meeresfrüchte und berechnet den Sparplan neu. Der Quellenstatus zeigt danach `Chrome-Import`. Die importierten Angebote werden unter `runtime-data/browser-offers.json` gespeichert und bei den automatischen Wochenläufen bis zu acht Tage weiterverwendet.

Jeder HTML-Import erzeugt sofort einen neuen Angebotsplan samt Marktentscheidung, Einkaufsliste und passendem Meal-Prep-Ablauf. Mit `Rezepte neu würfeln` lässt sich jederzeit eine andere Kombination aus denselben gespeicherten Angeboten erstellen, ohne die Händlerseiten erneut abzurufen. Der Meal-Prep-Plan wird dabei ebenfalls neu berechnet und trennt Kühlschrank, Gefrierschrank und frisch fertigzustellende Bestandteile.

Die automatische Auswahl belegt jeden sichtbaren Tag mit einem anderen Gericht: heute bis Sonntag und die sieben Tage der Folgewoche überschneiden sich nicht. Die Mengen werden dafür auf zwei Portionen skaliert. Mindestens die Hälfte der ausgewählten Gerichte ist fleischfrei, solange der nach Ausschlüssen verbleibende Rezeptpool dies zulässt.

Im Sparplan können unter `Was soll nicht in den Plan?` Zutaten kommagetrennt ausgeschlossen werden. Die Auswahl bleibt serverseitig im aktuellen Plan erhalten und gilt dadurch auch für spätere HTML-Importe sowie automatische Wochenläufe. `Milch` steht dabei für sämtliche Milchprodukte wie Sahne, Käse, Joghurt und Butter.

### Optional: Einmalige Freigabe im automatisierten Browser

Wenn ein Händler im Quellenstatus „Browserprüfung“ oder HTTP 403 meldet, auf einem Rechner mit grafischer Oberfläche einmal ausführen:

```bash
npm run browser:setup
```

Chromium öffnet die beiden Marktseiten mit einem separaten Profil. Eine eventuell sichtbare Händlerprüfung im Browser bestätigen. Cookies und Sitzungsdaten werden unter `runtime-data/browser-profiles` gespeichert. Da Händler diesen Browser trotzdem erneut prüfen können, ist der HTML-Import aus dem normalen Chrome der verlässlichere Weg. Danach erneut `npm run refresh` starten.

## Mit Docker Compose starten

```bash
cp .env.example .env
docker compose up -d --build
```

`runtime-data` ist als persistentes Verzeichnis eingebunden.

## Freitagabend und Samstagfrüh automatisch aktualisieren

Auf einem Linux-Server kann `crontab -e` beispielsweise diese beiden Läufe enthalten:

```cron
30 18 * * 5 cd /pfad/zum/feierabend-kochbuch-vollversion && /usr/bin/npm run refresh
30 8 * * 6 cd /pfad/zum/feierabend-kochbuch-vollversion && /usr/bin/npm run refresh
```

Alternativ kann ein geschützter Lauf über die laufende Website ausgelöst werden:

```bash
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" http://127.0.0.1:8080/api/refresh
```

Freitagabend wird zuerst aktualisiert; Samstagfrüh werden noch fehlende oder verspätet veröffentlichte Daten erneut geprüft.

## Enthalten
- aktueller Plan von heute bis Sonntag
- angebotsbasierter Plan für die nächste Woche
- Vergleich dreier konkreter Märkte auf einer Website
- Eigenmarken wie ja!, Gut & Günstig und K-Classic als günstige Normalpreisoption
- vollständiger Ausschluss von Fisch und Meeresfrüchten
- 4-Wochen-Vorlagen
- 75 vollständige Rezepte, darunter zusätzliche vegetarische Nudel-, Reis-, Spinat-, Kartoffel-, Auflauf- und Fleischgerichte
- veröffentlichte Streich-, Vor- und Vergleichspreise werden getrennt vom Angebotspreis übernommen; die Einkaufsliste zeigt die belastbar berechenbare Ersparnis und lässt unveröffentlichte Regalpreise als Schätzung stehen
- Suche, Filter und Favoriten
- Zutaten, Anleitung, Nährwerte, Kosten und Low-Carb-Varianten
- automatisch erzeugte Einkaufslisten
- lokale Speicherung und Datensicherung
- dynamischer Meal-Prep-Plan passend zum aktuellen Sparplan
- Druckansicht
- PWA/Offline-Cache
- lokaler Node-Server mit geschütztem Aktualisierungslauf

## Preisabdeckung

Die Händler veröffentlichen nicht alle filialgenauen Normalpreise in derselben Form. Der Planer unterscheidet deshalb:

- bestätigtes aktuelles Angebot,
- veröffentlichter Normal- oder Vergleichspreis,
- letzter lokal bekannter Preis,
- klar markierte Schätzung.

Kochrelevante Eigenmarken werden einbezogen. Der Quellenstatus in der Oberfläche zeigt, wie viele Angebote und wie viele der benötigten Normalpreise der jeweilige Lauf maschinenlesbar erfassen konnte. Ein eingeschränkter Status wird niemals als vollständiger Preisvergleich ausgegeben.

### Gezielter öffentlicher Normalpreisabruf

Nach der ersten Rezeptauswahl sucht der Wochenlauf ausschließlich nach den Zutaten dieser Gerichte auf den öffentlichen Seiten von REWE, EDEKA und Kaufland. Es wird kein vollständiges Sortiment gecrawlt und kein Kundenkonto benötigt. Händler veröffentlichen jedoch nicht für jedes Produkt einen filialgenauen Regalpreis; solche Positionen bleiben deshalb sichtbar als `geschätzt`.

Bestätigte Treffer werden unter `runtime-data/regular-price-cache.json` gespeichert:

- bis sieben Tage: `Normalpreis · öffentlich geprüft`
- danach bis insgesamt 35 Tage: `zuletzt gesehen am …`
- anschließend: keine weitere Verwendung; die Position wird wieder geschätzt

Ein HTTP-Fehler oder eine Händlerprüfung stoppt den Angebotsplan nicht. Der bestehende Chrome-HTML-Import bleibt für Wochenangebote unverändert verfügbar. Der manuelle Knopf `Angebote neu laden` sowie `npm run refresh` starten beide den Angebotsabruf, die gezielte Normalpreissuche und anschließend die vollständige Neuberechnung.

### Optionale eigene Preisquelle

Zusätzlich kann `api/rewe-prices.js` über die Umgebungsvariable `PRICE_FEED_URL` an eine eigene erlaubte JSON-Preisquelle angeschlossen werden. Erwartetes Format:

```json
{
  "source": "Name der Quelle",
  "updated": "2026-07-22T10:00:00+02:00",
  "prices": {"Hähnchenbrust": 11.99}
}
```

Eine Beispieldatei liegt als `rewe-preise-beispiel.json` bei.
