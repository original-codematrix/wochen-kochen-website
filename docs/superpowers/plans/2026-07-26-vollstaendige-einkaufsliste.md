# Vollständige Einkaufsliste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede nicht-optionale Rezeptzutat exakt einer konkreten Einkaufsposition zuordnen und unpassende Ersetzungen zwischen Fleischzuschnitten verhindern.

**Architecture:** `evaluateRecipe` versieht jeden Zutatenbedarf mit einer stabilen Kennung und wählt Angebote nur bei kompatibler Produktform. `buildShopping` aggregiert passende Produkte, behält aber die Kennungen aller abgedeckten Zutaten; nicht gematchte Bedarfe werden unter ihrem Originalnamen ausgegeben. Eine abschließende Vollständigkeitsprüfung verhindert das Speichern unvollständiger Pläne.

**Tech Stack:** Node.js 22, CommonJS, `node:test`, bestehender serverseitiger Planer.

## Global Constraints

- Jede nicht-optionale Zutat muss genau einer Einkaufsposition zugeordnet sein.
- Angebote, Normalpreise und Originalzutaten bleiben als Preisarten unterscheidbar.
- Schnitzel, Geschnetzeltes, Filet, Medaillons, Hack, Nacken/Steak und Braten dürfen nicht verwechselt werden.
- Die bestehende Einzelseite, Händlerimporte, Ausschlüsse, Meal-Prep und Rezeptauswahl bleiben erhalten.
- Fisch und Meeresfrüchte bleiben ausgeschlossen.

---

### Task 1: Strikte Fleischzuschnitte

**Files:**
- Modify: `server/planner.js`
- Modify: `tests/planner.test.js`

**Interfaces:**
- Consumes: `isOfferSuitable(ingredient, category, offerName)`.
- Produces: dieselbe boolesche Schnittstelle mit strikter Zuschnittprüfung.

- [ ] **Step 1: Write the failing regression test**

```js
test('generateOfferPlan does not replace pork schnitzel or strips with nacken steak', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'schnitzel',
      name: 'Schnitzel',
      cat: 'Fleischklassiker',
      cost: 12,
      rating: 5,
      ingredients: ['700 g Schweineschnitzel', '700 g Schweinegeschnetzeltes']
    }],
    offers: [{
      name: 'Schweinenackensteak Mexico Style',
      package: '750 g',
      price: 4.49,
      market: 'Kaufland Lohhof',
      status: 'offer'
    }],
    basePlan: {},
    now: new Date('2026-07-26T12:00:00+02:00')
  });
  const items = plan.shopping.flatMap(group => group.items);
  assert.equal(items.some(item => item.name === 'Schweinenackensteak Mexico Style'), false);
  assert.equal(items.some(item => /Schweineschnitzel/i.test(item.name)), true);
  assert.equal(items.some(item => /Schweinegeschnetzeltes/i.test(item.name)), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/planner.test.js`
Expected: FAIL because the Nackensteak is accepted for both pork ingredients.

- [ ] **Step 3: Implement cut compatibility**

Add a table of ingredient requirements before `isOfferSuitable`:

```js
const MEAT_CUT_RULES = [
  [/\bschnitzel/i, /\bschnitzel/i],
  [/\bgeschnetzel/i, /\bgeschnetzel/i],
  [/\bfilet/i, /\bfilet/i],
  [/\bmedaillon/i, /\b(medaillon|filet)/i],
  [/\bhack/i, /\bhack/i],
  [/\b(nacken|steak)/i, /\b(nacken|steak)/i],
  [/\bbraten/i, /\bbraten/i]
];
```

For meat categories, if the ingredient matches a rule and the offered name does not match the paired rule, return `false`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/planner.test.js`
Expected: all planner tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/planner.js tests/planner.test.js
git commit -m "fix: require matching meat cuts"
```

### Task 2: Vollständigkeitsinvariante

**Files:**
- Modify: `server/planner.js`
- Modify: `tests/planner.test.js`

**Interfaces:**
- Consumes: Zutaten aus `evaluateRecipe`.
- Produces: `ingredientIds: string[]` auf Einkaufspositionen und `assertCompleteShopping(selected, shopping)`.

- [ ] **Step 1: Write failing completeness tests**

```js
test('generateOfferPlan covers every required ingredient exactly once', () => {
  const plan = generateOfferPlan({ recipes, offers, basePlan: {}, now });
  const covered = plan.shopping.flatMap(group => group.items).flatMap(item => item.ingredientIds || []);
  assert.equal(covered.length, new Set(covered).size);
  assert.equal(covered.length, 4);
});

test('two ingredients in one price category remain separate requirements', () => {
  const plan = generateOfferPlan({ recipes: cheeseRecipe, offers, basePlan: {}, now });
  const items = plan.shopping.flatMap(group => group.items);
  assert.equal(items.some(item => /Parmesan/i.test(item.name)), true);
  assert.equal(items.some(item => /Mozzarella/i.test(item.name)), true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/planner.test.js`
Expected: FAIL because matches are deduplicated by category and shopping items have no ingredient IDs.

- [ ] **Step 3: Implement per-ingredient tracking**

Create ingredient records with:

```js
{ id: `${recipe.id}:${index}`, raw, category: categoryFor(raw) }
```

Do not deduplicate matches by category. In `buildShopping`, track matched ingredient IDs instead of matched categories, append `ingredientIds` to aggregated offer and estimated items, and verify:

```js
function assertCompleteShopping(selected, shopping) {
  const expected = selected.flatMap(item => item.ingredients.map(ingredient => ingredient.id));
  const covered = shopping.flatMap(group => group.items).flatMap(item => item.ingredientIds || []);
  if (covered.length !== expected.length || new Set(covered).size !== expected.length
      || expected.some(id => !covered.includes(id))) {
    throw new Error('Einkaufsliste unvollständig: Pflichtzutaten konnten nicht eindeutig zugeordnet werden');
  }
}
```

- [ ] **Step 4: Run complete verification**

Run: `node --check server/planner.js`
Expected: exit 0.

Run: `npm test`
Expected: complete suite PASS.

Regenerate a copy of `runtime-data/current-plan.json` and assert that `Schweineschnitzel von der Frischetheke` is present while Nackensteak is only assigned to compatible recipes.

- [ ] **Step 5: Commit**

```bash
git add server/planner.js tests/planner.test.js
git commit -m "fix: enforce complete shopping lists"
```

### Task 3: Laufzeitplan und Browserprüfung

**Files:**
- Runtime only: `runtime-data/current-plan.json`

**Interfaces:**
- Consumes: gemergten Planer und aktuellen `offerSnapshot`.
- Produces: neu berechneten aktuellen Plan ohne verlorene Zutaten.

- [ ] **Step 1: Regenerate the current plan**

Run:

```bash
node -e "const {regeneratePlan}=require('./server/refresh'); regeneratePlan({dataDir:'./runtime-data'})"
```

Expected: exit 0.

- [ ] **Step 2: Verify the saved shopping list**

Run a Node assertion that checks ten visible unique recipes, `Schweineschnitzel von der Frischetheke`, no ambiguous Nackensteak assignment, and one coverage ID per non-optional selected ingredient.

- [ ] **Step 3: Browser smoke test**

Start `node server.js`, load `http://127.0.0.1:8080` in Playwright, and assert that the shopping list contains `Schweineschnitzel`, contains no generic per-recipe remainder blocks, and emits no page errors.

