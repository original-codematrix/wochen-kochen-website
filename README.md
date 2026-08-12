# Unser Feierabend-Kochbuch – Knuspr-Wochenplaner

Eine Website für Rezepte, Wochenplanung, Vorräte und einen geführten Wochenplan mit automatischem Knuspr-Warenkorb.

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

Danach `http://localhost:8080` öffnen. In den Einstellungen denselben Wert wie `REFRESH_TOKEN` eintragen, damit Planerstellung und Warenkorbübertragung auch von einem anderen Gerät im Heimnetz funktionieren.

## Konfiguration

Der Server liest folgende Umgebungsvariablen (siehe `.env.example` und `config.example.json`):

- `APP_ORIGIN` – die öffentliche Adresse der Website, zum Beispiel `http://localhost:8080`. Wird für die Knuspr-OAuth-Weiterleitung und zur Herkunftsprüfung schreibender Anfragen benötigt.
- `KNUSPR_MCP_URL` – der Endpunkt des Knuspr-MCP-Servers, standardmäßig `https://mcp.knuspr.de/mcp`.
- `DATA_DIR` – Verzeichnis für persistente Laufzeitdaten (Sitzung, aktueller Plan, Zusatzartikel). Standard: `./runtime-data`.
- `REFRESH_TOKEN` – ein langes, zufälliges Passwort, das jede planändernde Anfrage (Planerstellung, Vorschauänderung, Warenkorbübertragung, Knuspr-Verbindung) im Heimnetz absichert.

## Einmalige Knuspr-Verbindung

Unter „Einstellungen“ → „Knuspr-Verbindung“ einmalig auf „Mit Knuspr verbinden“ klicken. Das öffnet die Knuspr-Anmeldung in einem neuen Tab (OAuth); nach erfolgreicher Anmeldung ist die Verbindung dauerhaft gespeichert und muss nicht wiederholt werden, solange sie nicht ausdrücklich über „Verbindung trennen“ beendet wird.

## Geführter Wochenplan

Auf „Wochenplan erstellen“ klicken: Die Website wählt sieben unterschiedliche Gerichte, ermittelt passende Knuspr-Produkte für alle Zutaten sowie die hinterlegten Zusatzartikel und zeigt eine Warenkorbvorschau. Mehrdeutige oder fehlende Positionen lassen sich vor der Übertragung noch mit einer Alternative versehen oder entfernen. Unter „Was soll nicht in den Plan?“ können Zutaten kommagetrennt ausgeschlossen werden; `Milch` schließt dabei alle Milchprodukte wie Sahne, Käse, Joghurt und Butter ein.

### Warenkorbsicherheit

Die Übertragung zu Knuspr ergänzt ausschließlich die geprüften Positionen der aktuellen Vorschau. Bereits im Knuspr-Warenkorb vorhandene Artikel werden nie gelöscht oder verändert. Hat sich der Preis einer Position seit der letzten Prüfung geändert, verlangt die Website eine erneute ausdrückliche Bestätigung, bevor irgendetwas übertragen wird.

### Nur-lese-Verträglichkeitstest

Nach der einmaligen Knuspr-Verbindung lässt sich die MCP-Kompatibilität ohne jedes Risiko prüfen:

```bash
node scripts/knuspr-readonly-smoke.js
```

Das Skript liest ausschließlich die gespeicherte Verbindung, ruft die verfügbaren Knuspr-Fähigkeiten ab und führt eine einzige harmlose Produktsuche nach „Kartoffeln“ aus. Es bricht mit einem Fehler ab, falls Produktsuche, Warenkorb-Lesen oder Warenkorb-Hinzufügen nicht als Fähigkeit erkannt werden. **Es ruft niemals eine warenkorbverändernde Funktion auf** – weder `getCart` noch `addCartItems` werden vom Skript ausgeführt; das ist durch einen automatisierten Test in `tests/knuspr-adapter.test.js` gegen einen simulierten Adapter abgesichert.

## Mit Docker Compose starten

```bash
cp .env.example .env
docker compose up -d --build
```

`runtime-data` ist als persistentes Verzeichnis eingebunden und überlebt Neustarts sowie Image-Updates des Containers.

## Ausfallverhalten

Ist Knuspr vorübergehend nicht erreichbar, bleiben Rezepte, das digitale Kochbuch und der zuletzt gespeicherte Wochenplan weiterhin lesbar; lediglich Planerstellung, Vorschauänderungen und Warenkorbübertragung sind bis zur Wiederherstellung der Verbindung nicht möglich.

## Enthalten
- geführter Wochenplan mit sieben unterschiedlichen Gerichten und automatischer Knuspr-Warenkorbvorschau
- editierbare Liste wiederkehrender Zusatzartikel (Getränke, Vorrat, Haushalt), die bei jedem Einkauf ergänzt werden
- vollständiger Ausschluss von Fisch und Meeresfrüchten sowie frei wählbaren Zutaten
- 4-Wochen-Vorlagen
- 100 vollständige Rezepte, darunter zusätzliche vegetarische Nudel-, Reis-, Spinat-, Kartoffel-, Auflauf- und Fleischgerichte
- konkrete Pflichtgewürze mit Mengenangaben für vier Portionen sowie optionale Würzvarianten als separate Gewürzempfehlung
- Suche, Filter und Favoriten
- Zutaten, Anleitung, Nährwerte, Kosten und Low-Carb-Varianten
- lokale Speicherung und Datensicherung
- dynamischer Meal-Prep-Plan passend zum aktuellen Wochenplan
- Druckansicht
- PWA/Offline-Cache
- lokaler Node-Server mit geschützter, tokenbasierter Knuspr-Anbindung
