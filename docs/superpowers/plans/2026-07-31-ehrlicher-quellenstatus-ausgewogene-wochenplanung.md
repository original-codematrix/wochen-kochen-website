# Ehrlicher Quellenstatus und ausgewogene Wochenplanung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aktuelle Import-/Abrufzeitpunkte korrekt anzeigen und jeden neu berechneten Plan angebotsbasiert auf drei bis vier Fleischgerichte, zwei bis drei Pastagerichte und mindestens drei fleischfreie Gerichte pro zehn Planungstage ausbalancieren.

**Architecture:** `server/refresh.js` speichert marktbezogene Zeitstempel und reicht sie über `plan.sources` an die bestehende UI weiter; `app.js` entscheidet anhand von Status, Zeitstempel und nicht abgelaufenem `validUntil`, welche Quellenzeit angezeigt wird. `server/planner.js` erweitert die bestehende deterministische `rotatedSelection` um proportional skalierte Mindest-/Maximalquoten, ohne Angebotsranking, Ausschlüsse oder explizite Fallback-Sequenzen zu umgehen.

**Tech Stack:** Node.js 22+, CommonJS, native `node:test`, Playwright, HTML/CSS/Vanilla JavaScript.

## Global Constraints

- Fisch und Meeresfrüchte bleiben vollständig ausgeschlossen.
- Fleisch-Pasta zählt gleichzeitig als Fleisch- und Pastagericht.
- Keine wiederholte Rezept-ID, solange genügend zulässige Rezepte vorhanden sind.
- HTML-Import, automatischer Refresh und manuelles Neuwürfeln verwenden dieselbe Plannerlogik.
- Die bestehende vollständige Einkaufsliste und der Meal-Prep-Plan bleiben aus der ausgewählten Rezeptfolge abgeleitet.
- Keine neuen Laufzeitabhängigkeiten.

---

### Task 1: Marktbezogene Import- und Abrufzeitpunkte

**Files:**
- Modify: `server/refresh.js:155-175, 224-250, 340-390`
- Modify: `app.js:46-48, 98-108`
- Test: `tests/refresh.test.js`
- Test: `tests/shopping-browser.test.js`

**Interfaces:**
- Consumes: bestehendes Cacheformat `{ capturedAt, sources: [{ market, offers }] }` und `plan.sources`.
- Produces: Cachequellen `{ market, importedAt, offers }`; Refreshergebnisse und Planquellen mit `checkedAt: string|null` sowie `importedAt: string|null`; UI-Helfer `sourceTimingLabel(source, now = new Date()) -> string`.

- [ ] **Step 1: Failing Cache- und Refresh-Tests schreiben**

Erweitere `tests/refresh.test.js` so, dass ein Import einen marktbezogenen Zeitpunkt speichert und ein späterer Import eines anderen Marktes ihn nicht überschreibt:

```js
const firstImportedAt = '2026-07-31T12:27:00.000Z';
const secondImportedAt = '2026-07-31T12:29:00.000Z';
// importOfferHtml erhält optional `now`; anschließend müssen beide
// sources ihren jeweils eigenen importedAt-Wert behalten.
```

Erweitere die `applyBrowserCache`-Tests um die Assertions:

```js
assert.equal(restored[0].importedAt, cached.sources[0].importedAt);
assert.equal(restored[0].checkedAt, null);
```

Erweitere den `refreshPlan`-Test für einen festen Zeitpunkt:

```js
assert.equal(rewe.checkedAt, '2026-07-24T10:00:00.000Z');
assert.equal(rewe.importedAt, null);
```

- [ ] **Step 2: RED für Refresh-Tests verifizieren**

Run: `node --test tests/refresh.test.js`

Expected: FAIL, weil `importOfferHtml` noch kein `now` übernimmt und weder `importedAt` noch `checkedAt` marktbezogen persistiert werden.

- [ ] **Step 3: Zeitstempel minimal im Refresh-Datenfluss implementieren**

In `importOfferHtml` einen optionalen `now = new Date()`-Parameter akzeptieren und beim ersetzten Markteintrag speichern:

```js
const importedAt = now.toISOString();
cache.capturedAt = importedAt;
cache.sources.push({ market, importedAt, offers });
```

In `applyBrowserCache` das Alter je Markt über `cached.importedAt || cache.capturedAt` prüfen und bei Übernahme zurückgeben:

```js
return {
  ...result,
  offers: allowedCached,
  status: 'browser-cached',
  checkedAt: null,
  importedAt: cached.importedAt || cache.capturedAt,
  error: null
};
```

In `refreshPlan` einmalig `const runAt = options.now || new Date()` bilden. Direkte Ergebnisse erhalten `checkedAt: runAt.toISOString(), importedAt: null`; `refreshedBase.sources` setzt beide Felder explizit aus dem Ergebnis, damit alte Basiswerte nicht weitergetragen werden.

- [ ] **Step 4: Refresh-Tests grün ausführen**

Run: `node --test tests/refresh.test.js`

Expected: PASS.

- [ ] **Step 5: Failing Browser-Test für ehrliche Quellenanzeige schreiben**

Gib dem Testplan in `tests/shopping-browser.test.js` zwei Quellen:

```js
sources: [
  {
    market: 'Importmarkt', status: 'browser-cached',
    importedAt: '2026-07-31T12:27:00.000Z', validUntil: '2026-07-25',
    coverage: '20 Angebote', url: '#'
  },
  {
    market: 'Direktmarkt', status: 'current',
    checkedAt: '2026-07-31T12:28:00.000Z', validUntil: '2026-07-29',
    coverage: '15 Angebote', url: '#'
  }
]
```

Prüfe, dass die Kartentexte `importiert am 31.07.2026` und `abgerufen am 31.07.2026` enthalten, aber weder `gültig bis 25.07.2026` noch `gültig bis 29.07.2026`.

- [ ] **Step 6: RED für Browser-Test verifizieren**

Run: `node --test tests/shopping-browser.test.js`

Expected: FAIL, weil `app.js` derzeit immer `gültig bis …` rendert.

- [ ] **Step 7: Quellenzeit in der UI implementieren**

Füge in `app.js` den Helfer hinzu:

```js
function sourceTimingLabel(source, now = new Date()) {
  if (source.status === 'browser-cached' && source.importedAt) {
    return `importiert am ${new Date(source.importedAt).toLocaleString('de-DE')}`;
  }
  if (source.checkedAt) {
    return `abgerufen am ${new Date(source.checkedAt).toLocaleString('de-DE')}`;
  }
  const validUntil = source.validUntil ? new Date(`${source.validUntil}T23:59:59`) : null;
  if (validUntil && Number.isFinite(validUntil.getTime()) && validUntil >= now) {
    return `gültig bis ${validUntil.toLocaleDateString('de-DE')}`;
  }
  return 'Zeitpunkt nicht verfügbar';
}
```

Nutze `${sourceTimingLabel(source)} · ${source.coverage}` im `<small>` der Quellenkarte.

- [ ] **Step 8: Task-1-Tests ausführen und committen**

Run: `node --test tests/refresh.test.js tests/shopping-browser.test.js`

Expected: PASS.

```bash
git add server/refresh.js app.js tests/refresh.test.js tests/shopping-browser.test.js
git commit -m "fix: show honest retailer source timestamps"
```

---

### Task 2: Angebotsbasierte Auswahl mit ausgewogenen Quoten

**Files:**
- Modify: `server/planner.js:250-305`
- Test: `tests/planner.test.js:574-605, 1210-1295`

**Interfaces:**
- Consumes: sortierte `evaluations`, `variation`, sichtbares `limit` in `rotatedSelection(evaluations, variation, limit)`.
- Produces: eindeutige Evaluationen mit proportionalen Zielen aus `selectionTargets(limit)` und Merkmalen aus `recipeTraits(recipe)`.

- [ ] **Step 1: Failing Zehn-Tage-Quotentest schreiben**

Ersetze den bisherigen allgemeinen Fleischlimit-Test durch einen Katalog mit mindestens vier Fleisch-, vier Pasta- und fünf fleischfreien Kandidaten. Erzeuge am Freitag zehn sichtbare Tage und prüfe:

```js
assert.ok(meatCount >= 3 && meatCount <= 4);
assert.ok(pastaCount >= 2 && pastaCount <= 3);
assert.ok(meatFreeCount >= 3);
assert.equal(new Set(selected.map(recipe => recipe.id)).size, 10);
```

Mindestens eine Fleisch-Pasta muss im Testkatalog enthalten sein; die Zählung verwendet dieselben fachlichen Muster wie der Planner.

- [ ] **Step 2: Failing proportionalen Kurzplan-Test schreiben**

Erzeuge am Sonntag acht sichtbare Tage. Prüfe die skalierten Ziele:

```js
assert.ok(meatCount >= 3 && meatCount <= 4);
assert.ok(pastaCount >= 2 && pastaCount <= 3);
assert.ok(meatFreeCount >= 3);
```

- [ ] **Step 3: RED für Planner-Tests verifizieren**

Run: `node --test tests/planner.test.js`

Expected: FAIL, weil `rotatedSelection` bislang nur maximal die Hälfte Fleisch sowie mindestens ein Nudelgericht erzwingt und keine Fleisch-/Pasta-Mindestquote besitzt.

- [ ] **Step 4: Merkmale und proportional skalierte Zielwerte implementieren**

In `server/planner.js` ergänzen:

```js
function recipeTraits(recipe) {
  const text = `${recipe.name} ${(recipe.ingredients || []).join(' ')}`;
  return {
    meat: MEAT_RECIPE_PATTERN.test(text),
    pasta: recipe.cat === 'Nudeln' || PASTA_RECIPE_PATTERN.test(text)
  };
}

function selectionTargets(limit) {
  return {
    minMeat: Math.min(limit, Math.ceil(limit * 0.3)),
    maxMeat: Math.min(limit, Math.ceil(limit * 0.4)),
    minPasta: Math.min(limit, Math.ceil(limit * 0.2)),
    maxPasta: Math.min(limit, Math.ceil(limit * 0.3)),
    minMeatFree: Math.min(limit, Math.ceil(limit * 0.3))
  };
}
```

- [ ] **Step 5: Quotenbewusste deterministische Auswahl implementieren**

Behalte `sorted`, den rotierenden Top-Pool und das Angebotsranking. Fülle `selected` in dieser Reihenfolge:

1. bestbewertete Fleisch-Pasta-Kandidaten;
2. weitere Fleischkandidaten bis `minMeat`;
3. weitere Pastakandidaten bis `minPasta`;
4. fleischfreie Kandidaten bis `minMeatFree`;
5. Kategorievielfalt unter Beachtung von `maxMeat` und `maxPasta`;
6. Wiederholung von Kategorien unter denselben Maxima;
7. nur bei wegen Ausschlüssen unmöglichen Quoten bestmögliche Restfüllung.

Jede Hinzufügung prüft weiterhin die Rezept-ID. `recipeSequence` bleibt von dieser Logik unberührt, weil es in `generateOfferPlan` bereits separat verarbeitet wird.

- [ ] **Step 6: Planner-Tests grün ausführen**

Run: `node --test tests/planner.test.js`

Expected: PASS.

- [ ] **Step 7: Aktuellen Importsnapshot nur lesend simulieren**

Run:

```bash
node -e "const {recipes}=require('./data');const {generateOfferPlan}=require('./server/planner');const p=require('./runtime-data/current-plan.json');const q=generateOfferPlan({recipes,offers:p.offerSnapshot,regularPrices:p.regularPriceSnapshot,basePlan:p,now:new Date('2026-07-31T14:30:00+02:00'),variation:p.planRevision+1});console.log([...q.weekend,...q.nextWeek].map(x=>x.recipeId))"
```

Expected: zehn eindeutige Rezepte, drei bis vier Fleischgerichte, zwei bis drei Pastagerichte und mindestens drei fleischfreie Gerichte.

- [ ] **Step 8: Task 2 committen**

```bash
git add server/planner.js tests/planner.test.js
git commit -m "feat: balance weekly recipe selection"
```

---

### Task 3: Gesamtprüfung, Merge und lokaler Lauf

**Files:**
- Runtime only: `runtime-data/current-plan.json`
- Runtime backup: `runtime-data/current-plan.before-balanced-selection.json`

**Interfaces:**
- Consumes: vorhandenen `runtime-data/browser-offers.json`, den gemergten Planner und die bestehende lokale Serverkonfiguration.
- Produces: neu berechneten persistenten Plan und eine erreichbare lokale Seite auf dem bisherigen Kochbuch-Port.

- [ ] **Step 1: Vollständige Verifikation im Feature-Worktree**

Run:

```bash
npm test
git diff --check
node --check app.js
node --check server/refresh.js
node --check server/planner.js
```

Expected: 0 fehlgeschlagene Tests und keine Syntax-/Whitespacefehler.

- [ ] **Step 2: Feature-Branch lokal in `main` integrieren**

Fast-Forward-Merge erst nach grüner Suite. Danach `npm test` erneut auf `main` ausführen.

- [ ] **Step 3: Laufzeitplan sichern und neu berechnen**

```bash
cp runtime-data/current-plan.json runtime-data/current-plan.before-balanced-selection.json
```

Anschließend `POST /api/regenerate` auf der neu gestarteten Instanz ausführen, damit der vorhandene frische Importsnapshot ohne erneuten Händlerabruf mit der neuen Mischungslogik geplant wird.

- [ ] **Step 4: Lokalen Server neu starten und live prüfen**

Port 8080 bleibt dem fremden `consent-service` vorbehalten; das Kochbuch wird weiter auf Port 8091 mit `DATA_DIR=.../runtime-data` gestartet. Live prüfen:

- HTTP 200;
- Quellenkarten enthalten Import-/Abrufzeitpunkte und keine abgelaufenen `gültig bis`-Angaben;
- zehn eindeutige Rezepte mit den vereinbarten Quoten;
- Einkauf und Sparplan zeigen dieselben Positionen;
- keine Browserfehler.

- [ ] **Step 5: Worktree und Feature-Branch nach erfolgreichem Merge aufräumen**

Nur den für diese Änderung angelegten Worktree entfernen und den vollständig gemergten Feature-Branch normal mit `git branch -d` löschen.
