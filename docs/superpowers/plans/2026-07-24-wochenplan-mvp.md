# Angebotsbasierter Wochenplan MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Heute einen nutzbaren Einkaufs- und Essensplan in der Website anzeigen und einen selbst gehosteten, manuell sowie zeitgesteuert ausführbaren Wochenlauf bereitstellen.

**Architecture:** Ein dependency-freier Node.js-Server liefert die bestehende Website aus und verwaltet gespeicherte Angebots-Snapshots. Ein separat testbarer Planerkern bewertet die vorhandenen Rezepte für zwei Personen anhand gültiger Preise und erzeugt Kurz- und Wochenplan. Die Browseroberfläche lädt den aktuellen Snapshot und zeigt Plan, Quellenstatus und Einkaufsempfehlung an.

**Tech Stack:** Node.js 22+, CommonJS, integrierter `node:test`-Runner, bestehendes HTML/CSS/JavaScript, JSON-Dateien

## Global Constraints

- Zwei Personen und ein Abendessen täglich
- Vier Portionen pro Gericht; dasselbe Gericht höchstens zwei Tage
- Tomaten und Champignons getrennt, Brokkoli weich
- Drei feste Märkte: REWE Eching, EDEKA Morsestraße, Kaufland Lohhof
- Ein Markt wird bevorzugt; Aufteilung nur bei verhältnismäßig sinnvoller Ersparnis um 20 Euro
- Preisstatus muss zwischen aktuell, historisch und geschätzt unterscheiden
- Freitagabend, Samstagfrüh und manuell ausführbar
- Keine Anmeldung an Händlerkonten und keine ungeschützte öffentliche Bereitstellung

---

### Task 1: Planerkern und heutiger Snapshot

**Files:**
- Create: `server/planner.js`
- Create: `server/current-plan.json`
- Test: `tests/planner.test.js`

**Interfaces:**
- Consumes: Rezeptobjekte aus `data.js` beziehungsweise normalisierte Testrezepte und Preisangebote
- Produces: `buildPlans({ recipes, offers, pantry, now })` mit `weekend`, `nextWeek`, `shopping` und `recommendation`

- [ ] **Step 1: Failing tests schreiben**

Tests prüfen zwei Portionstage pro Vier-Portionen-Rezept, maximal zwei gleiche Tage, Vorratsabzug und Ein-Markt-Empfehlung.

- [ ] **Step 2: Tests rot ausführen**

Run: `node --test tests/planner.test.js`
Expected: FAIL wegen fehlendem Modul `server/planner.js`

- [ ] **Step 3: Minimalen Planerkern implementieren**

Der Kern normalisiert Preise pro benötigter Menge, bewertet Rezeptkosten und gibt deterministische Pläne und Einkaufsposten zurück.

- [ ] **Step 4: Tests grün ausführen**

Run: `node --test tests/planner.test.js`
Expected: PASS

### Task 2: Lokaler Server und Wochenlauf

**Files:**
- Create: `server.js`
- Create: `server/refresh.js`
- Create: `config.example.json`
- Create: `package.json`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: `buildPlans(...)` und gespeicherte JSON-Snapshots
- Produces: `GET /api/status`, `GET /api/current-plan`, `POST /api/refresh`

- [ ] **Step 1: Failing HTTP-Tests schreiben**

Tests starten den Server auf einem freien Port und erwarten Status, Plan sowie einen geschützten manuellen Aktualisierungslauf.

- [ ] **Step 2: Tests rot ausführen**

Run: `node --test tests/server.test.js`
Expected: FAIL wegen fehlendem Modul `server.js`

- [ ] **Step 3: Minimalen Server und Refresh-Orchestrator implementieren**

Statische Dateien werden mit sicheren Pfadprüfungen ausgeliefert. Der Refresh-Endpunkt akzeptiert nur lokale Anfragen oder ein konfiguriertes Token und schreibt Snapshots atomar.

- [ ] **Step 4: Tests grün ausführen**

Run: `node --test tests/server.test.js`
Expected: PASS

### Task 3: Sofort nutzbare Oberfläche

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `service-worker.js`
- Test: `tests/structure.test.js`

**Interfaces:**
- Consumes: `GET /api/current-plan` und `POST /api/refresh`
- Produces: sichtbare Bereiche „Heute bis Sonntag“, „Nächste Woche“, Quellenstatus und Einkauf nach Markt

- [ ] **Step 1: Failing Strukturtests ergänzen**

Tests erwarten die neuen DOM-IDs `weekendPlan`, `nextWeekPlan`, `sourceStatus`, `marketRecommendation` und `runWeeklyPlan`.

- [ ] **Step 2: Tests rot ausführen**

Run: `node tests/structure.test.js`
Expected: FAIL mit der ersten fehlenden DOM-ID

- [ ] **Step 3: Oberfläche anbinden**

Die Seite lädt den Plan, zeigt verlässliche und geschätzte Preise getrennt, erlaubt den manuellen Lauf und fällt bei fehlendem Server auf den eingebauten aktuellen Snapshot zurück.

- [ ] **Step 4: Tests grün ausführen**

Run: `node tests/structure.test.js && node --test tests/*.test.js`
Expected: PASS

### Task 4: Selbsthosting und Zeitplan

**Files:**
- Modify: `README.md`
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.env.example`
- Test: `tests/config.test.js`

**Interfaces:**
- Consumes: Node-Startbefehl und Serverkonfiguration
- Produces: direkte Node-Anleitung, Docker-Compose-Anleitung und Cron-Beispiele für Freitag/Samstag

- [ ] **Step 1: Failing Konfigurationstest schreiben**

Der Test erwartet dokumentierte Startbefehle, persistentes Datenvolume und die Variablen `PORT`, `DATA_DIR`, `REFRESH_TOKEN`.

- [ ] **Step 2: Test rot ausführen**

Run: `node --test tests/config.test.js`
Expected: FAIL wegen fehlender Hosting-Dateien

- [ ] **Step 3: Hosting-Dateien und Anleitung ergänzen**

Der Container läuft ohne Root-Benutzer, bindet `./runtime-data` persistent ein und dokumentiert Cron-Aufrufe für Freitagabend und Samstagfrüh.

- [ ] **Step 4: Gesamte Verifikation**

Run: `node tests/structure.test.js && node --test tests/*.test.js`
Expected: alle Tests PASS ohne Warnungen

## Plan-Selbstprüfung

- Der MVP deckt den heute benötigten Plan, drei Marktquellen, Vorräte, Preisstatus, manuellen Lauf und Selbsthosting ab.
- Vollständige belastbare Händlerparser bleiben wegen wechselnder HTML-Strukturen adapterweise erweiterbar; der MVP speichert den verifizierten aktuellen Snapshot und bietet einen sicheren Refresh-/Importpfad.
- Keine Platzhalter oder widersprüchlichen Schnittstellennamen sind enthalten.
