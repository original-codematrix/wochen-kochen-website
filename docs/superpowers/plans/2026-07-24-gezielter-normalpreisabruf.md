# Gezielter Normalpreisabruf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Öffentliche Preise nur für die Zutaten der ausgewählten Gerichte abrufen, cachen und transparent in den vorhandenen Wochenplan einrechnen.

**Architecture:** Der vorhandene Angebotslauf erzeugt zunächst einen Entwurfsplan. Ein neues, unabhängiges Preisquellen-Modul leitet daraus Suchbegriffe ab, liest öffentliche Produktseiten fehlertolerant und cached bestätigte Treffer. Ein zweiter Planlauf verbindet Angebote, Normalpreise und bestehende Schätzwerte, ohne die bisherigen Import- und Regenerierungswege zu ersetzen.

**Tech Stack:** Node.js 22, CommonJS, native `fetch`, Playwright-Fallback, `node:test`, bestehendes HTML/CSS/JavaScript.

## Global Constraints

- Nur öffentliche Händlerseiten ohne Anmeldung verwenden.
- REWE Eching `440303`, EDEKA Morsestraße `234100` und Kaufland Lohhof `DE1820`.
- Nur Zutaten der ausgewählten Gerichte plus bereits kategorisierte Grundzutaten abfragen.
- Fisch und Meeresfrüchte vollständig ausschließen.
- Bestehenden HTML-Import, Planer, Meal-Prep und manuelle Neuberechnung erhalten.
- Normalpreise, veraltete Cachepreise und Schätzungen sichtbar unterscheiden.
- Laufzeitdaten ausschließlich unter `runtime-data/` speichern.

---

### Task 1: Zielzutaten und öffentliche Preisdatensätze

**Files:**
- Create: `server/regular-prices.js`
- Create: `tests/regular-prices.test.js`

**Interfaces:**
- Consumes: Planobjekt mit `weekend`, `nextWeek` und Rezeptliste.
- Produces: `collectNeededQueries(plan, recipes)`, `parsePublicProducts(html, market, sourceUrl)`, `chooseMatchingPrice(query, records)`.

- [ ] **Step 1: Write the failing tests**

```js
test('collectNeededQueries returns only categorized ingredients used by visible recipes', () => {
  assert.deepEqual(collectNeededQueries(plan, recipes), ['Nudeln', 'Spinat']);
});

test('parsePublicProducts accepts visible product prices and rejects comparison-only prices', () => {
  const rows = parsePublicProducts(fixture, 'REWE Eching', 'https://www.rewe.de/shop/suche?search=Nudeln');
  assert.equal(rows[0].priceType, 'regular');
  assert.equal(rows.some(row => row.name === '30-Tage-Preis'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/regular-prices.test.js`
Expected: FAIL because `server/regular-prices.js` does not exist.

- [ ] **Step 3: Implement minimal extraction and parsing**

Create exports:

```js
module.exports = {
  collectNeededQueries,
  parsePublicProducts,
  chooseMatchingPrice
};
```

`collectNeededQueries` maps visible recipe IDs to recipe ingredients, ignores `optional`, fish and uncategorized seasonings, converts ingredients to stable category search terms, deduplicates and sorts. `parsePublicProducts` accepts JSON-LD `Product`/`Offer` and visible HTML product cards only when name and positive EUR price coexist.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/regular-prices.test.js`
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/regular-prices.js tests/regular-prices.test.js
git commit -m "feat: derive targeted public price queries"
```

### Task 2: Cache und fehlertoleranter gezielter Abruf

**Files:**
- Modify: `server/regular-prices.js`
- Modify: `tests/regular-prices.test.js`

**Interfaces:**
- Consumes: `queries`, Marktdefinitionen, optionaler `fetchHtml`, `dataDir`, `now`.
- Produces: `fetchTargetedRegularPrices(options)` mit `{records, coverage}`.

- [ ] **Step 1: Write failing cache and failure tests**

```js
test('fetchTargetedRegularPrices reuses fresh cached query results', async () => {
  const result = await fetchTargetedRegularPrices({ queries: ['Nudeln'], cache, fetchHtml: failIfCalled, now });
  assert.equal(result.records[0].priceType, 'regular');
});

test('fetchTargetedRegularPrices labels old cache entries and survives a blocked source', async () => {
  const result = await fetchTargetedRegularPrices({ queries: ['Spinat'], cache, fetchHtml: blocked, now });
  assert.equal(result.records[0].priceType, 'stale-regular');
  assert.equal(result.coverage[0].status, 'cached-stale');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/regular-prices.test.js`
Expected: FAIL because `fetchTargetedRegularPrices` is not exported.

- [ ] **Step 3: Implement cache and bounded requests**

Add `fetchTargetedRegularPrices` with:

```js
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 35 * 24 * 60 * 60 * 1000;
```

Use official search URL builders per market, at most three concurrent requests, per-query error capture, forbidden-product filtering, and atomic `regular-price-cache.json` writes. Never promote `previous`, `30-day-low` or `app-offer` to `regular`.

- [ ] **Step 4: Run focused and complete tests**

Run: `node --test tests/regular-prices.test.js`
Expected: all price tests PASS.

Run: `npm test`
Expected: 52 existing tests plus new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/regular-prices.js tests/regular-prices.test.js
git commit -m "feat: cache targeted retailer prices"
```

### Task 3: Zwei-Phasen-Refresh und Planer-Integration

**Files:**
- Modify: `server/refresh.js`
- Modify: `server/planner.js`
- Modify: `tests/refresh.test.js`
- Modify: `tests/planner.test.js`

**Interfaces:**
- Consumes: `regularPrices` array in `generateOfferPlan`.
- Produces: shopping items with `status`, `priceType`, `capturedAt`, `sourceUrl`; source coverage with `regularPriceCount`.

- [ ] **Step 1: Write failing planner and refresh tests**

```js
test('generateOfferPlan uses a matching public regular price for an unmatched needed ingredient', () => {
  const plan = generateOfferPlan({ recipes, offers, regularPrices, basePlan: {}, now });
  const spinach = plan.shopping.flatMap(group => group.items).find(item => /Spinat/i.test(item.name));
  assert.equal(spinach.status, 'regular');
  assert.equal(spinach.price, 1.49);
});

test('refreshPlan requests regular prices only after selecting visible recipes', async () => {
  const plan = await refreshPlan({ fetchHtml, fetchRegularPrices, dataDir, planFile, now });
  assert.deepEqual(seenQueries.includes('Nudeln'), true);
  assert.equal(plan.regularPriceSnapshot.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/planner.test.js tests/refresh.test.js`
Expected: FAIL because the planner and refresh ignore `regularPrices`.

- [ ] **Step 3: Implement the two-phase plan**

`refreshPlan` performs:

```js
const draft = generateOfferPlan({ recipes, offers, basePlan: refreshedBase, now, variation, excludedIngredients });
const queries = collectNeededQueries(draft, recipes);
const regularResult = await fetchRegularPrices({ queries, dataDir, now });
const plan = generateOfferPlan({
  recipes,
  offers,
  regularPrices: regularResult.records,
  basePlan: { ...refreshedBase, regularPriceSnapshot: regularResult.records },
  now,
  variation,
  excludedIngredients
});
```

In `server/planner.js`, match regular records with the existing category and suitability rules. Offers remain preferred for the same ingredient when their computed package cost is cheaper. Unmatched needed ingredients become individual shopping items; only items without offer or public/cache price remain `estimated`.

- [ ] **Step 4: Run focused and complete tests**

Run: `node --test tests/planner.test.js tests/refresh.test.js tests/regular-prices.test.js`
Expected: all focused tests PASS.

Run: `npm test`
Expected: complete suite PASS.

- [ ] **Step 5: Commit**

```bash
git add server/refresh.js server/planner.js tests/refresh.test.js tests/planner.test.js
git commit -m "feat: calculate plans with targeted regular prices"
```

### Task 4: Transparente Oberfläche, Brühe und Anleitung

**Files:**
- Modify: `app.js`
- Modify: `data.js`
- Modify: `README.md`
- Modify: `service-worker.js`
- Modify: `tests/data-module.test.js`
- Modify: `tests/structure.test.js`

**Interfaces:**
- Consumes: neue Shopping- und Quellenfelder aus Task 3.
- Produces: verständliche Preislabels und eindeutige Brühenmengen.

- [ ] **Step 1: Write failing UI and recipe wording tests**

```js
test('all measured broth ingredients explain prepared broth', () => {
  const measured = recipes.flatMap(recipe => recipe.ingredients).filter(item => /\d+\s*ml Brühe/i.test(item));
  assert.equal(measured.every(item => /zubereitete Brühe.*Wasser.*Brühenpulver|Brüh.*würfel/i.test(item)), true);
});
```

Extend the structure assertion to require `öffentlich geprüft`, `zuletzt gesehen` and source coverage rendering.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/data-module.test.js && node tests/structure.test.js`
Expected: FAIL on old broth wording and missing UI labels.

- [ ] **Step 3: Implement labels, wording and documentation**

Replace each measured ingredient `N ml Brühe` with:

```text
N ml zubereitete Brühe (Wasser + Brühenpulver/-würfel nach Packungsangabe)
```

Render `regular`, `stale-regular`, `offer`, `app-offer` and `estimated` distinctly in the existing shopping list. Document public-page limitations, cache age, manual refresh and the unchanged HTML import. Increment the service worker cache name once.

- [ ] **Step 4: Verify syntax, tests and browser**

Run: `node --check app.js && node --check data.js && node --check server/regular-prices.js && node --check server/refresh.js && node --check server/planner.js`
Expected: no output, exit 0.

Run: `npm test`
Expected: complete suite PASS.

Run the app on a free local port and verify with Playwright: one page, ten unique daily recipes, no fish, price-type labels render, no page errors.

- [ ] **Step 5: Commit**

```bash
git add app.js data.js README.md service-worker.js tests/data-module.test.js tests/structure.test.js
git commit -m "feat: explain public price coverage and broth"
```

