# Konkrete Gewürze und 25 neue Rezepte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle vorhandenen Rezepte erhalten messbare Pflichtgewürze und individuelle optionale Würzvarianten; zusätzlich wächst der fischfreie Katalog um 25 vollständige, ausgewogene Feierabendgerichte.

**Architecture:** Gewürzdaten für den bestehenden Katalog und neue Rezepte liegen in zwei browser- und Node-kompatiblen Datenmodulen. `data.js` führt sie zu einem normalisierten Rezeptkatalog zusammen, sodass Rezeptansicht, Planer und Einkaufsliste weiterhin dieselbe Datenquelle verwenden. Der Rezeptdialog zeigt `seasoningTip` separat, während die messbaren Pflichtgewürze über `ingredients` automatisch in die Einkaufsplanung gelangen.

**Tech Stack:** JavaScript ohne Framework, Node.js 22+, Node Test Runner, Playwright, bestehender lokaler HTTP-Server/PWA.

## Global Constraints

- Der Gesamtkatalog enthält nach der Änderung genau 100 Rezepte: 75 bestehende plus 25 neue eindeutige IDs.
- Mindestens 13 der 25 neuen Rezepte sind fleischfrei.
- Fisch, Meeresfrüchte, Garnelen und Hummer bleiben vollständig ausgeschlossen.
- Gewürzmengen gelten für vier Portionen und werden vom bestehenden Planer auf die Plangröße skaliert.
- Verbindliche Gewürze stehen in `ingredients`; optionale Varianten stehen nur in `seasoningTip`.
- Kein Rezept enthält den pauschalen Zutateneintrag `Gewürze` oder ungemessene Sammelangaben wie `Salz und Pfeffer`.
- Fremde Chefkoch-Texte werden nicht kopiert; die neuen Rezepte werden eigenständig formuliert.
- Keine neuen Laufzeitabhängigkeiten.

---

### Task 1: Katalogweite Gewürzdaten und Normalisierung

**Files:**
- Create: `recipe-seasonings.js`
- Modify: `data.js`
- Modify: `index.html`
- Test: `tests/data-module.test.js`

**Interfaces:**
- Produces: `RECIPE_SEASONINGS`, ein Objekt `{ [recipeId]: { required: string[], tip: string } }`.
- Produces: Der Export aus `data.js` enthält für jedes bestehende Rezept konkrete Gewürze in `ingredients` und einen nicht leeren String `seasoningTip`.
- Consumes: Die 75 bestehenden Rezept-IDs aus `data.js`.

- [ ] **Step 1: Failing contract tests für alle bestehenden Rezepte schreiben**

In `tests/data-module.test.js` vor der Implementierung die ursprünglichen 75 IDs festhalten und prüfen:

```js
const ORIGINAL_RECIPE_IDS = [
  'garlic-pasta', 'teriyaki', 'gyros', 'nuggets', 'cajun',
  'honey-soy', 'pizza', 'beef-onion', 'coconut-curry', 'bbq-pasta',
  'burger', 'sheet-pan', 'sweet-chili', 'hoisin-noodles', 'wings',
  'beef-pasta', 'mustard-chicken', 'lemon-garlic', 'pepper-beef',
  'garlic-rice', 'kebab-bowl', 'crispy-chicken', 'soy-sesame',
  'curry-noodles', 'bbq-tray', 'beef-rice', 'garlic-parmesan',
  'oven-pizza', 'mustard-pasta', 'crispy-wrap', 'garlic-beef-noodles',
  'chicken-rice-bake', 'hoisin-rice', 'frosta-evening', 'mexico-pork',
  'spinach-pasta', 'spinach-potatoes-eggs', 'leberkaese-eggs',
  'leberkaese-spinach', 'ham-cream-pasta', 'spinach-gnocchi',
  'schnitzel-potatoes', 'meatballs-cream', 'pork-tenderloin-pasta',
  'chicken-spinach-lasagna', 'potato-mince-bake', 'kaesespaetzle',
  'paprika-cream-pork', 'beef-fried-noodles', 'sausage-spinach-pasta',
  'chicken-spinach-rice', 'pesto-pea-pasta', 'vegetable-egg-rice',
  'broccoli-potato-bake', 'lentil-bolognese',
  'garlic-oil-spinach-pasta', 'veggie-coconut-curry',
  'potato-egg-skillet', 'spinach-feta-bake', 'broccoli-cheese-pasta',
  'pea-carrot-rice', 'oven-potato-herb-quark', 'egg-noodle-stirfry',
  'chicken-pesto-pasta', 'pork-noodle-skillet', 'spinach-tortellini',
  'vegetable-noodle-bake', 'chicken-potato-pan',
  'spinach-rice-omelette', 'paprika-cream-pasta',
  'sausage-potato-skillet', 'roast-vegetable-couscous',
  'chicken-schnitzel-pasta', 'broccoli-rice-bake',
  'beef-potato-bowl'
];

test('all original recipes have measured seasoning and an individual seasoning tip', () => {
  const { recipes } = require('../data');
  const originals = recipes.filter(recipe => ORIGINAL_RECIPE_IDS.includes(recipe.id));
  assert.equal(originals.length, 75);
  for (const recipe of originals) {
    assert.equal(typeof recipe.seasoningTip, 'string', recipe.id);
    assert.ok(recipe.seasoningTip.trim().length >= 20, recipe.id);
    assert.ok(recipe.ingredients.some(item => (
      /(?:TL|EL|Prise) .*(?:salz|pfeffer|paprika|curry|muskat|oregano|thymian|rosmarin|kümmel|chili|knoblauch|kräuter)/i.test(item)
    )), `messbare Würzung fehlt: ${recipe.id}`);
    assert.equal(recipe.ingredients.some(item => /^Gewürze$/i.test(item)), false, recipe.id);
    assert.equal(recipe.ingredients.some(item => /^(?:Salz|Pfeffer)(?:,| und )/i.test(item)), false, recipe.id);
  }
});
```

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test tests/data-module.test.js
```

Expected: FAIL, weil `seasoningTip` fehlt und bestehende Rezepte pauschale Gewürzeinträge enthalten.

- [ ] **Step 3: Browser- und Node-kompatibles Gewürzmodul anlegen**

`recipe-seasonings.js` enthält genau einen Eintrag je ursprünglicher Rezept-ID:

```js
const RECIPE_SEASONINGS = {
  'garlic-pasta': {
    required: ['1 TL mildes Paprikapulver', '3/4 TL Salz', '1/2 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1 TL italienische Kräuter ergänzen; rauchiger wird es mit 1/2 TL geräuchertem Paprikapulver.'
  },
  teriyaki: {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken ergänzen; milder bleibt das Gericht ohne Chili.'
  }
};

if (typeof window !== 'undefined') window.RECIPE_SEASONINGS = RECIPE_SEASONINGS;
if (typeof module !== 'undefined') module.exports = RECIPE_SEASONINGS;
```

Jeder der 75 Einträge bekommt individuell passende `required`-Werte. Salz bei Soja-, Teriyaki-, Brühe- und Fertigsoßengerichten weglassen oder höchstens als kleine gemessene Menge verwenden. `tip` nennt eine konkrete optionale Veränderung samt Menge.

- [ ] **Step 4: Gewürze in `data.js` normalisieren**

Am Ende von `data.js`, aber vor dem Browser-/Node-Export:

```js
const seasoningData = typeof module !== 'undefined' && module.exports
  ? require('./recipe-seasonings')
  : window.RECIPE_SEASONINGS;

const VAGUE_SEASONING = /^(?:Gewürze|Salz|Pfeffer|Salz[, ]+(?:und )?Pfeffer|Muskat, Salz und Pfeffer)$/i;

KOCHBUCH_DATA.recipes = KOCHBUCH_DATA.recipes.map(recipe => {
  const seasoning = seasoningData[recipe.id];
  if (!seasoning) throw new Error(`Gewürzdaten fehlen für ${recipe.id}`);
  return {
    ...recipe,
    ingredients: [
      ...recipe.ingredients.filter(item => !VAGUE_SEASONING.test(item.trim())),
      ...seasoning.required
    ],
    seasoningTip: seasoning.tip
  };
});
```

Die Erkennung bei Bedarf so erweitern, dass alle tatsächlich vorhandenen pauschalen Gewürze entfernt werden, ohne Soßen, Brühe, Knoblauchzehen oder andere normale Zutaten zu löschen.

- [ ] **Step 5: Browser-Ladereihenfolge ergänzen**

In `index.html` `recipe-seasonings.js` unmittelbar vor `data.js` laden:

```html
<script src="recipe-seasonings.js"></script>
<script src="data.js"></script>
```

- [ ] **Step 6: GREEN verifizieren**

Run:

```bash
node --test tests/data-module.test.js
node --check recipe-seasonings.js
node --check data.js
```

Expected: alle Datenmodultests PASS, beide Syntaxprüfungen Exit 0.

- [ ] **Step 7: Commit**

```bash
git add recipe-seasonings.js data.js index.html tests/data-module.test.js
git commit -m "feat: add measured seasoning to recipe catalog"
```

---

### Task 2: 25 neue eigenständige Feierabendrezepte

**Files:**
- Create: `recipe-expansion.js`
- Modify: `data.js`
- Modify: `index.html`
- Test: `tests/data-module.test.js`

**Interfaces:**
- Produces: `EXPANSION_RECIPES`, ein Array mit genau 25 vollständigen Rezeptobjekten.
- Consumes: Das bestehende Rezeptformat mit `id`, `name`, `cat`, `time`, `cost`, `kcal`, `protein`, `tags`, `desc`, `ingredients`, `steps`, `freeze`, `lowcarb`, `servings`, `rating`, `difficulty` und `seasoningTip`.

- [ ] **Step 1: Failing tests für Umfang, Vielfalt und Vollständigkeit schreiben**

```js
const EXPANSION_IDS = [
  'lemon-pea-pasta',
  'mushroom-spinach-tagliatelle',
  'pumpkin-sage-gnocchi',
  'cauliflower-cheese-pasta',
  'creamy-bean-orzo',
  'potato-zucchini-fritters',
  'mushroom-potato-goulash',
  'cauliflower-potato-curry',
  'spinach-potato-gratin',
  'crispy-potato-egg-tray',
  'lentil-spinach-curry',
  'bean-cheese-quesadillas',
  'vegetable-bulgur-bowl',
  'beef-mushroom-one-pan-pasta',
  'salsiccia-spinach-rigatoni',
  'paprika-chicken-rice',
  'pork-mustard-strips',
  'turkey-leek-pasta',
  'chicken-broccoli-potato-bake',
  'beef-bean-burrito-bowl',
  'meatball-orzo-pan',
  'bratwurst-apple-onion-pan',
  'bacon-pea-gnocchi',
  'chicken-fajita-tray',
  'ham-cheese-potato-bake'
];

test('catalog adds exactly 25 complete fish-free Feierabend recipes', () => {
  const { recipes } = require('../data');
  const additions = recipes.filter(recipe => EXPANSION_IDS.includes(recipe.id));
  assert.equal(recipes.length, 100);
  assert.equal(additions.length, 25);
  assert.equal(new Set(additions.map(recipe => recipe.id)).size, 25);
  assert.ok(additions.filter(recipe => recipe.tags.includes('fleischfrei')).length >= 13);
  for (const recipe of additions) {
    for (const field of ['name', 'cat', 'desc', 'freeze', 'lowcarb', 'difficulty', 'seasoningTip']) {
      assert.ok(String(recipe[field] || '').trim(), `${recipe.id}: ${field}`);
    }
    assert.equal(recipe.servings, 4, recipe.id);
    assert.ok(recipe.time >= 20 && recipe.time <= 50, recipe.id);
    assert.ok(recipe.ingredients.length >= 6, recipe.id);
    assert.ok(recipe.steps.length >= 4, recipe.id);
    assert.doesNotMatch(`${recipe.name} ${recipe.ingredients.join(' ')}`, /fisch|lachs|thunfisch|garnele|hummer|meeresfr/i);
  }
});
```

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test tests/data-module.test.js
```

Expected: FAIL mit 75 statt 100 Rezepten und null gefundenen Erweiterungs-IDs.

- [ ] **Step 3: `recipe-expansion.js` mit 25 vollständigen Rezepten erstellen**

Jedes Objekt folgt diesem vollständig ausgefüllten Format:

```js
{
  id: 'lemon-pea-pasta',
  name: 'Zitronige Erbsen-Frischkäse-Pasta',
  cat: 'Nudeln',
  time: 25,
  cost: 11.5,
  kcal: 610,
  protein: 25,
  tags: ['fleischfrei', 'schnell', 'Meal-Prep'],
  desc: 'Cremige Feierabendpasta mit Erbsen und frischer Zitronennote.',
  ingredients: [
    '500 g Pasta',
    '400 g TK-Erbsen',
    '200 g Frischkäse',
    '1 Zitrone',
    '200 ml zubereitete Gemüsebrühe (Wasser + Brühenpulver/-würfel nach Packungsangabe)',
    '1 TL getrockneter Basilikum',
    '1/2 TL Knoblauchpulver',
    '1/2 TL Salz',
    '1/4 TL schwarzer Pfeffer'
  ],
  steps: [
    'Pasta bissfest kochen und 150 ml Kochwasser auffangen.',
    'Erbsen fünf Minuten mitgaren.',
    'Frischkäse, Brühe und die Grundgewürze bei kleiner Hitze verrühren.',
    'Pasta, Erbsen, Zitronenabrieb und etwas Zitronensaft unterheben.'
  ],
  freeze: 'Bis 2 Monate; über Nacht im Kühlschrank auftauen und mit einem Schluck Wasser erwärmen.',
  lowcarb: 'Die halbe Pastamenge verwenden und 500 g Zucchini ergänzen.',
  servings: 4,
  rating: 4,
  difficulty: 'Einfach',
  seasoningTip: 'Für mehr Kräuteraroma zusätzlich 1 TL italienische Kräuter verwenden; kräftiger wird die Pasta mit 1/2 TL Chiliflocken.'
}
```

Die übrigen 24 Objekte werden ebenso vollständig und eigenständig formuliert. Die ersten 13 IDs der Liste sind fleischfrei und tragen das Tag `fleischfrei`; die letzten 12 enthalten Fleisch. Alle Pflichtgewürze sind einzeln gemessen. Brühemengen verwenden immer die bereits etablierte Erklärung für zubereitete Brühe.

Die Namen und Kategorien sind verbindlich:

| ID | Anzeigename | Kategorie |
|---|---|---|
| `lemon-pea-pasta` | Zitronige Erbsen-Frischkäse-Pasta | Nudeln |
| `mushroom-spinach-tagliatelle` | Champignon-Spinat-Tagliatelle | Nudeln |
| `pumpkin-sage-gnocchi` | Kürbis-Salbei-Gnocchi | Nudeln |
| `cauliflower-cheese-pasta` | Blumenkohl-Käse-Pasta | Nudeln |
| `creamy-bean-orzo` | Cremige Bohnen-Orzo-Pfanne | Nudeln |
| `potato-zucchini-fritters` | Kartoffel-Zucchini-Puffer | Kartoffeln |
| `mushroom-potato-goulash` | Champignon-Kartoffel-Gulasch | Kartoffeln |
| `cauliflower-potato-curry` | Blumenkohl-Kartoffel-Curry | Reis |
| `spinach-potato-gratin` | Spinat-Kartoffel-Gratin | Kartoffeln |
| `crispy-potato-egg-tray` | Knusperkartoffeln mit Ofeneiern | TK & Ofen |
| `lentil-spinach-curry` | Linsen-Spinat-Curry | Reis |
| `bean-cheese-quesadillas` | Bohnen-Käse-Quesadillas | Bowls & Wraps |
| `vegetable-bulgur-bowl` | Ofengemüse-Bulgur-Bowl | Reis |
| `beef-mushroom-one-pan-pasta` | One-Pan-Hack-Pasta mit Champignons | Nudeln |
| `salsiccia-spinach-rigatoni` | Salsiccia-Spinat-Rigatoni | Nudeln |
| `paprika-chicken-rice` | Paprika-Hähnchen-Reis | Reis |
| `pork-mustard-strips` | Senf-Schweinegeschnetzeltes | Fleisch |
| `turkey-leek-pasta` | Puten-Lauch-Pasta | Nudeln |
| `chicken-broccoli-potato-bake` | Hähnchen-Brokkoli-Kartoffelauflauf | TK & Ofen |
| `beef-bean-burrito-bowl` | Rind-Bohnen-Burrito-Bowl | Bowls & Wraps |
| `meatball-orzo-pan` | Hackbällchen-Orzo-Pfanne | Nudeln |
| `bratwurst-apple-onion-pan` | Bratwurst-Apfel-Zwiebel-Pfanne | Kartoffeln |
| `bacon-pea-gnocchi` | Speck-Erbsen-Gnocchi | Nudeln |
| `chicken-fajita-tray` | Hähnchen-Fajita-Blech | TK & Ofen |
| `ham-cheese-potato-bake` | Schinken-Käse-Kartoffelauflauf | TK & Ofen |

- [ ] **Step 4: Erweiterung in `data.js` zusammenführen**

Nach der Normalisierung der ursprünglichen Rezepte:

```js
const expansionRecipes = typeof module !== 'undefined' && module.exports
  ? require('./recipe-expansion')
  : window.EXPANSION_RECIPES;

KOCHBUCH_DATA.recipes = [...KOCHBUCH_DATA.recipes, ...expansionRecipes];
```

In `index.html` muss die Reihenfolge lauten:

```html
<script src="recipe-seasonings.js"></script>
<script src="recipe-expansion.js"></script>
<script src="data.js"></script>
```

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/data-module.test.js
node --check recipe-expansion.js
node --check data.js
```

Expected: Datenmodultests PASS; Kataloggröße genau 100; 25 neue IDs; mindestens 13 Tags `fleischfrei`.

- [ ] **Step 6: Commit**

```bash
git add recipe-expansion.js data.js index.html tests/data-module.test.js
git commit -m "feat: add 25 fish-free Feierabend recipes"
```

---

### Task 3: Gewürzempfehlung im Rezeptdialog anzeigen

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Test: `tests/structure.test.js`
- Test: `tests/seasoning-browser.test.js`

**Interfaces:**
- Consumes: `recipe.seasoningTip: string`.
- Produces: Im geöffneten Rezeptdialog existiert ein Abschnitt mit Überschrift `Gewürzempfehlung` und dem unveränderten Tipptext.

- [ ] **Step 1: Failing Struktur- und Browsertest schreiben**

Der Strukturtest prüft, dass `app.js` `r.seasoningTip` rendert. Der Browsertest startet `createServer`, öffnet ein echtes Katalogrezept und prüft:

```js
await page.locator('[data-recipe="garlic-pasta"]').first().click();
await expect(page.locator('#recipeDialog')).toBeVisible();
assert.equal(
  (await page.locator('#recipeDialog').innerText()).includes('Gewürzempfehlung'),
  true
);
assert.equal(
  (await page.locator('#recipeDialog').innerText()).includes(
    require('../data').recipes.find(recipe => recipe.id === 'garlic-pasta').seasoningTip
  ),
  true
);
```

Falls die Oberfläche keinen `data-recipe`-Selektor besitzt, den bestehenden Rezeptkarten-Selektor verwenden und den Test auf das tatsächlich gerenderte erste Rezept ausrichten.

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test tests/structure.test.js tests/seasoning-browser.test.js
```

Expected: FAIL, weil der Dialog noch keinen Gewürzempfehlungs-Abschnitt enthält.

- [ ] **Step 3: Dialog-Markup und dezente Darstellung ergänzen**

In `openRecipe` nach dem Zutaten-/Zubereitungsraster einfügen:

```js
<div class="seasoning-tip">
  <strong>Gewürzempfehlung</strong>
  <p>${r.seasoningTip}</p>
</div>
```

`styles.css` ergänzt eine zum bestehenden dunklen Kartendesign passende Abgrenzung. Kein Modal, kein neuer Navigationsreiter und keine Auswahlsteuerung.

- [ ] **Step 4: GREEN verifizieren**

Run:

```bash
node --test tests/structure.test.js tests/seasoning-browser.test.js
node --check app.js
```

Expected: beide Tests PASS, Syntaxprüfung Exit 0.

- [ ] **Step 5: Commit**

```bash
git add app.js styles.css tests/structure.test.js tests/seasoning-browser.test.js
git commit -m "feat: show seasoning recommendations in recipes"
```

---

### Task 4: Einkaufsplanung und Abteilungszuordnung absichern

**Files:**
- Modify: `server/planner.js`
- Test: `tests/planner.test.js`
- Modify: `server/current-plan.json`
- Test: `tests/fallback-plan.test.js`

**Interfaces:**
- Consumes: konkrete Gewürze aus den zusammengeführten `recipe.ingredients`.
- Produces: Pflichtgewürze erscheinen als konkrete Einkaufspositionen unter `Soßen, Gewürze & Vorrat`.

- [ ] **Step 1: Failing Planungstest schreiben**

```js
test('generateOfferPlan carries measured recipe seasoning into pantry shopping', () => {
  const recipe = require('../data').recipes.find(item => item.id === 'garlic-pasta');
  const plan = generateOfferPlan({
    recipes: [recipe],
    offers: [{ name: 'Penne', package: '500 g', price: 0.99, market: 'Testmarkt', status: 'offer' }],
    basePlan: {},
    now: new Date('2026-07-27T12:00:00+02:00')
  });
  const pantry = plan.shopping.find(group => group.department === 'Soßen, Gewürze & Vorrat');
  assert.ok(pantry.items.some(item => /Paprikapulver/i.test(item.name)));
  assert.ok(pantry.items.some(item => /Pfeffer/i.test(item.name)));
});
```

Zusätzlich den bestehenden Vollkatalog-Audit auf 100 Rezepte ausweiten.

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test --test-name-pattern="seasoning|catalog audit" tests/planner.test.js
```

Expected: Mindestens ein konkretes Gewürz fällt noch in die falsche Abteilung oder der Katalogaudit scheitert an einer neuen Zutatenbezeichnung.

- [ ] **Step 3: Nur tatsächlich fehlende Abteilungsregeln ergänzen**

`shoppingDepartment` um die konkreten im neuen Katalog verwendeten Gewürznamen erweitern, falls sie nicht bereits durch die Gewürzregel erfasst werden. Keine generische Catch-all-Regel einführen; Lebensmittel wie Paprika oder Kräuterquark dürfen nicht wegen Teilworten falsch einsortiert werden.

- [ ] **Step 4: Fallback-Plan deterministisch neu erzeugen**

Den bestehenden Aktualisierungsweg verwenden, um `server/current-plan.json` mit unveränderten sichtbaren Rezepten, aber vollständigen neuen Gewürzpositionen neu zu erzeugen. Prüfen:

```bash
node --test tests/fallback-plan.test.js
```

Expected: jede nicht optionale Zutat der sichtbaren Rezepte ist genau einmal über `ingredientIds` abgedeckt.

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/planner.test.js tests/fallback-plan.test.js
node --check server/planner.js
git diff --check
```

Expected: alle Tests PASS; Syntax und Diff sauber.

- [ ] **Step 6: Commit**

```bash
git add server/planner.js server/current-plan.json tests/planner.test.js tests/fallback-plan.test.js
git commit -m "fix: include measured spices in shopping plans"
```

---

### Task 5: PWA, Gesamttests und lokale Laufzeit aktualisieren

**Files:**
- Modify: `sw.js`
- Modify: `README.md`
- Runtime only: `runtime-data/current-plan.json`

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: Browser lädt die neuen Datenmodule ohne alten Service-Worker-Cache; lokale Seite liefert den vollständigen neuen Katalog und Einkaufsplan aus.

- [ ] **Step 1: Failing Cache-Strukturtest ergänzen**

In `tests/structure.test.js` prüfen, dass `sw.js` `recipe-seasonings.js` und `recipe-expansion.js` cached und dass die Cache-Version gegenüber dem aktuellen Stand erhöht wurde.

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node tests/structure.test.js
```

Expected: FAIL, weil die neuen Dateien noch nicht in der PWA-Dateiliste stehen.

- [ ] **Step 3: Service Worker und README aktualisieren**

`sw.js` nimmt beide Dateien in die statische Cacheliste auf und erhöht die Cache-Version um eins. README nennt mindestens 100 Rezepte sowie konkrete Gewürzmengen und optionale Würzvarianten.

- [ ] **Step 4: Gesamtsuite ausführen**

Run:

```bash
npm test
git diff --check
```

Expected: 0 fehlgeschlagene Tests und sauberer Diff.

- [ ] **Step 5: Commit**

```bash
git add sw.js README.md tests/structure.test.js
git commit -m "docs: ship expanded seasoned recipe catalog"
```

- [ ] **Step 6: Runtime sichern und aktualisieren**

Vor dem Überschreiben:

```bash
cp runtime-data/current-plan.json runtime-data/current-plan.before-seasonings.json
cp server/current-plan.json runtime-data/current-plan.json
```

Den laufenden Server anschließend kontrolliert neu starten.

- [ ] **Step 7: Live-Abnahme**

Mit Playwright gegen `http://127.0.0.1:8080` prüfen:

- Katalog enthält 100 Rezeptkarten.
- Ein bestehendes und ein neues Rezept zeigen `Gewürzempfehlung`.
- Die Einkaufsliste enthält konkrete Gewürze unter `Soßen, Gewürze & Vorrat`.
- Sparplan- und Einkaufsreiter zeigen denselben aktiven Plan.
- Keine `pageerror`-Ereignisse.
