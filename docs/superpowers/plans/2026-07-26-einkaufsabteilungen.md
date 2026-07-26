# Einheitliche Einkaufsabteilungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angebote und geschätzte Zutaten erscheinen anhand derselben Regeln in sinnvollen Supermarkt-Abteilungen.

**Architecture:** `buildShopping()` erzeugt weiterhin dieselben Einkaufspositionen, führt bepreiste und geschätzte Positionen danach jedoch zusammen. Eine reine Funktion `shoppingDepartment(item)` ordnet jede fertige Position anhand von Kategorie und konkretem Namen genau einer geordneten Abteilung zu.

**Tech Stack:** Node.js, Browser-JavaScript, Node-Test-Runner, bestehender Playwright-Integrationstest.

## Global Constraints

- Die Abteilungsreihenfolge lautet `Fleisch & Frischetheke`, `Obst & Gemüse`, `Kühlregal & Tiefkühl`, `Nudeln, Reis & Beilagen`, `Soßen, Gewürze & Vorrat`, `Weitere Zutaten`.
- Angebote, öffentliche Normalpreise und geschätzte Positionen verwenden dieselbe Gruppierungsfunktion.
- `Weitere Zutaten` enthält ausschließlich nicht zuverlässig zuordenbare Positionen.
- Rezeptauswahl, Mengen, Preise, Preisstatus und `ingredientIds` bleiben unverändert.
- Der aktuelle Laufzeitplan und der Offline-Fallback behalten dieselben acht sichtbaren Rezept-IDs.

---

### Task 1: Gemeinsame Abteilungslogik

**Files:**
- Modify: `server/planner.js`
- Modify: `tests/planner.test.js`

**Interfaces:**
- Consumes: Einkaufspositionen mit `name: string` und `category: string | null`
- Produces: `shoppingDepartment(item): string` und ein `shopping`-Array mit einheitlich gruppierten bepreisten und geschätzten Positionen

- [ ] **Step 1: Write failing department tests**

Ergänze in `tests/planner.test.js` einen Test, der einen Plan mit geschätzten Pflichtzutaten erzeugt und folgende Zuordnungen prüft:

```js
test('generateOfferPlan groups priced and estimated items by supermarket department', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'departments',
      name: 'Abteilungs-Test',
      cat: 'Pfanne',
      cost: 20,
      rating: 5,
      servings: 2,
      ingredients: [
        '650 g Rindergeschnetzeltes',
        '600 g TK-Blattspinat',
        '1 Gurke',
        '2 Zwiebeln',
        '2 Knoblauchzehen',
        '400 g Couscous',
        '150 g Paniermehl',
        '500 ml zubereitete Rinderbrühe',
        '2 EL Öl',
        '1 EL Senf',
        '1 TL Stärke'
      ]
    }],
    offers: [{ name: 'Tafelsalz', package: '500 g', price: 0.49, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const namesByDepartment = Object.fromEntries(
    plan.shopping.map(group => [group.department, group.items.map(item => item.name)])
  );

  assert.ok(namesByDepartment['Fleisch & Frischetheke'].includes('Rindergeschnetzeltes'));
  assert.ok(namesByDepartment['Kühlregal & Tiefkühl'].includes('TK-Blattspinat'));
  assert.deepEqual(
    ['Gurke', 'Zwiebeln', 'Knoblauchzehen'].every(name => namesByDepartment['Obst & Gemüse'].includes(name)),
    true
  );
  assert.deepEqual(
    ['Couscous', 'Paniermehl'].every(name => namesByDepartment['Nudeln, Reis & Beilagen'].includes(name)),
    true
  );
  assert.deepEqual(
    ['zubereitete Rinderbrühe', 'EL Öl', 'EL Senf', 'TL Stärke']
      .every(fragment => namesByDepartment['Soßen, Gewürze & Vorrat'].some(name => name.includes(fragment))),
    true
  );
  assert.equal(
    (namesByDepartment['Weitere Zutaten'] || []).some(name => /Rindergeschnetzeltes|Spinat|Gurke|Zwiebel|Knoblauch|Couscous|Paniermehl|Brühe|Öl|Senf|Stärke/i.test(name)),
    false
  );
});
```

Ergänze außerdem einen Test, der für eine bepreiste und eine geschätzte Position derselben Kategorie dieselbe Abteilung erwartet.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test --test-name-pattern='supermarket department|same department' tests/planner.test.js
```

Expected: FAIL, weil geschätzte Positionen weiterhin geschlossen unter `Weitere Zutaten` liegen.

- [ ] **Step 3: Add the central department function**

Ergänze in `server/planner.js` vor `buildShopping()`:

```js
const SHOPPING_DEPARTMENTS = [
  'Fleisch & Frischetheke',
  'Obst & Gemüse',
  'Kühlregal & Tiefkühl',
  'Nudeln, Reis & Beilagen',
  'Soßen, Gewürze & Vorrat',
  'Weitere Zutaten'
];

function shoppingDepartment(item) {
  const name = String(item.name || '').toLocaleLowerCase('de-DE');
  const category = item.category || '';
  if (['chicken', 'beef', 'pork', 'nuggets', 'leberkaese', 'sausage', 'ham'].includes(category)) {
    return 'Fleisch & Frischetheke';
  }
  if (/(?:brühe|fond|öl|senf|stärke|soße|sauce|dip|gewürz)(?!\p{L})/iu.test(name)) {
    return 'Soßen, Gewürze & Vorrat';
  }
  if (/\b(?:tk|tiefkühl)/i.test(name)) return 'Kühlregal & Tiefkühl';
  if (['pizza', 'wraps', 'cheese', 'eggs', 'yogurt', 'cream'].includes(category)) {
    return 'Kühlregal & Tiefkühl';
  }
  if (
    ['cucumber', 'tomatoes', 'onions', 'broccoli', 'spinach', 'carrots', 'peppers'].includes(category)
    || /\b(?:gurke|zwiebeln?|knoblauch|zucchini|zitrone|paprika|brokkoli|spinat|karotten?|möhren?)\b/i.test(name)
  ) return 'Obst & Gemüse';
  if (
    ['pasta', 'gnocchi', 'rice', 'potato', 'fries', 'lentils', 'peas'].includes(category)
    || /\b(?:couscous|paniermehl)\b/i.test(name)
  ) return 'Nudeln, Reis & Beilagen';
  if (category === 'coconut') return 'Soßen, Gewürze & Vorrat';
  return 'Weitere Zutaten';
}
```

- [ ] **Step 4: Make estimated items retain their category**

Ergänze beim ersten Erzeugen eines `estimatedItems`-Eintrags und beim Umwandeln einer bepreisten Position:

```js
category: ingredient.category,
// beziehungsweise für pricedItems:
category: item.category,
```

- [ ] **Step 5: Group all finished items through one function**

Wandle zuerst `pricedItems` und `estimatedItems` in fertige UI-Positionen um, kombiniere sie anschließend und gruppiere ausschließlich so:

```js
const allItems = [...finishedPricedItems, ...finishedEstimatedItems];
return SHOPPING_DEPARTMENTS.flatMap(department => {
  const items = allItems.filter(item => shoppingDepartment(item) === department);
  return items.length ? [{ department, items }] : [];
});
```

Die bestehenden Berechnungen für Preis, Status, Mengen, Notizen und `ingredientIds` werden unverändert in `finishedPricedItems` beziehungsweise `finishedEstimatedItems` übernommen.

- [ ] **Step 6: Export and verify GREEN**

Ergänze den Export:

```js
module.exports = {
  allocateDays,
  subtractPantry,
  recommendMarket,
  generateOfferPlan,
  buildMealPrepPlan,
  shoppingDepartment
};
```

Run:

```bash
node --test --test-name-pattern='supermarket department|same department' tests/planner.test.js
```

Expected: beide Tests PASS.

- [ ] **Step 7: Run planner and completeness tests**

Run:

```bash
node --test tests/planner.test.js tests/fallback-plan.test.js
```

Expected: alle Tests PASS; keine `ingredientId` fehlt oder ist doppelt.

- [ ] **Step 8: Commit**

```bash
git add server/planner.js tests/planner.test.js
git commit -m "fix: group all shopping items by department"
```

### Task 2: Pläne aktualisieren und live prüfen

**Files:**
- Modify: `server/current-plan.json`
- Modify: `runtime-data/current-plan.json`
- Modify: `tests/fallback-plan.test.js`

**Interfaces:**
- Consumes: die acht sichtbaren Rezept-IDs aus dem aktuellen Laufzeitplan
- Produces: Offline- und Laufzeitplan mit identischen Artikeln und korrigierten Abteilungen

- [ ] **Step 1: Strengthen the fallback department invariant**

Ergänze in `tests/fallback-plan.test.js`:

```js
const departmentByName = new Map(
  plan.shopping.flatMap(group => group.items.map(item => [item.name, group.department]))
);
assert.equal(departmentByName.get('Rindergeschnetzeltes'), 'Fleisch & Frischetheke');
assert.equal(departmentByName.get('Schweineschnitzel von der Frischetheke'), 'Fleisch & Frischetheke');
assert.equal(departmentByName.get('Schweinenackensteaks Mexico Style'), 'Fleisch & Frischetheke');
assert.equal(departmentByName.get('TK-Blattspinat'), 'Kühlregal & Tiefkühl');
assert.equal(departmentByName.get('Gurke'), 'Obst & Gemüse');
assert.match(departmentByName.get('zubereitete Rinderbrühe (Wasser + Brühenpulver/-würfel nach Packungsangabe)'), /Soßen, Gewürze & Vorrat/);
```

- [ ] **Step 2: Run the fallback test to verify RED**

Run: `node --test tests/fallback-plan.test.js`

Expected: FAIL, weil der gespeicherte Plan noch die alten Abteilungsnamen besitzt.

- [ ] **Step 3: Regenerate without changing recipes or shopping values**

Erzeuge den Plan isoliert aus einer temporären Kopie des aktuellen Laufzeitplans. Verwende dieselben acht eindeutigen Rezept-IDs, `variation: 17` und dessen `generatedAt` als festes `now`. Schreibe das validierte Ergebnis zuerst nach `server/current-plan.json`.

Prüfe vor Übernahme in `runtime-data/current-plan.json`:

```js
assert.deepEqual(new Set(newTimelineIds), new Set(oldTimelineIds));
assert.deepEqual(newShoppingItems.map(item => item.name).sort(), oldShoppingItems.map(item => item.name).sort());
assert.deepEqual(newIngredientIds.sort(), oldIngredientIds.sort());
```

Sichere den vorherigen Laufzeitplan als `runtime-data/current-plan.before-departments.json` und übernimm danach den validierten Plan.

- [ ] **Step 4: Run fallback, full suite and browser test**

Run:

```bash
node --test tests/fallback-plan.test.js tests/shopping-browser.test.js
npm test
node --check server/planner.js
git diff --check
```

Expected: alle Tests PASS, Syntax und Diffcheck ohne Ausgabe.

- [ ] **Step 5: Verify the live server**

Starte beziehungsweise aktualisiere den Server aus `main` mit dem bestehenden `runtime-data`. Prüfe im Browser:

```js
{
  sameLists: true,
  beefDepartment: 'Fleisch & Frischetheke',
  schnitzelDepartment: 'Fleisch & Frischetheke',
  spinachDepartment: 'Kühlregal & Tiefkühl',
  cucumberDepartment: 'Obst & Gemüse',
  brothDepartment: 'Soßen, Gewürze & Vorrat',
  errors: []
}
```

- [ ] **Step 6: Commit**

```bash
git add server/current-plan.json tests/fallback-plan.test.js
git commit -m "chore: refresh shopping departments"
```

`runtime-data/current-plan.json` und seine Sicherung bleiben unversionierte Laufzeitdaten.
