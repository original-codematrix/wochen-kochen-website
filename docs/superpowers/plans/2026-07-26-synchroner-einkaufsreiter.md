# Synchroner Einkaufsreiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Reiter `Einkauf` zeigt, kopiert und verwaltet exakt die vollständige Einkaufsliste des aktuellen Angebots-Sparplans.

**Architecture:** `activePlan.shopping` wird zur einzigen Einkaufsdatenquelle außerhalb der Rezeptvorlagen. Kleine gemeinsame UI-Funktionen erzeugen aus einem Plan dieselbe Positionsdarstellung für Sparplan und Einkaufsreiter; beide Ansichten teilen `state.checked.plan`.

**Tech Stack:** Browser-JavaScript, HTML, Node.js-Test-Runner, Playwright für den abschließenden Browser-Smoke-Test, bestehender Node-Server.

## Global Constraints

- Die bestehende Planerzeugung in `server/planner.js` bleibt unverändert.
- `activePlan.shopping` ist die einzige Datenquelle für beide aktuellen Einkaufslisten.
- Ohne geladenen Plan darf keine statische Vorlagenliste als aktueller Einkauf erscheinen.
- Mengen, Hinweise, Preise und Preisstatus müssen in beiden Ansichten identisch sein.
- Der gemeinsame Abhakzustand bleibt unter `state.checked.plan`.
- Angebotsimport und Neuberechnung bleiben im Sparplan.

---

### Task 1: Vertrag und Beschriftung des Einkaufsreiters

**Files:**
- Modify: `tests/structure.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: die bestehenden DOM-IDs `shoppingWeekLabel`, `shoppingTotal`, `shoppingDone` und `shoppingGroups`
- Produces: ein Einkaufsreiter, dessen Text ausschließlich den aktuellen Sparplan beschreibt

- [ ] **Step 1: Write the failing structure test**

Ergänze nach dem bestehenden HTML-Laden in `tests/structure.test.js`:

```js
if (!html.includes('AKTUELLER SPARPLAN')) {
  throw new Error('Einkaufsreiter muss den aktuellen Sparplan anzeigen');
}
if (html.includes('Automatisch aus der ausgewählten Vorlagenwoche erstellt')) {
  throw new Error('Einkaufsreiter darf keine Vorlagenliste ankündigen');
}
if (html.includes('id="importPrices"') || html.includes('id="priceFile"')) {
  throw new Error('Alter Vorlagenpreis-Import darf im Einkaufsreiter nicht erscheinen');
}
```

- [ ] **Step 2: Run the structure test to verify it fails**

Run: `node tests/structure.test.js`

Expected: FAIL mit `Einkaufsreiter muss den aktuellen Sparplan anzeigen`.

- [ ] **Step 3: Update the shopping tab copy**

Ersetze den Inhalt von `#shoppingView` in `index.html` so, dass die vorhandenen IDs erhalten bleiben und die Überschriften den aktuellen Plan benennen:

```html
<section id="shoppingView" class="view">
  <div class="section-head">
    <div>
      <span class="eyebrow">AKTUELLER SPARPLAN</span>
      <h2>Einkaufsliste</h2>
      <p>Identisch mit dem aktuellen Angebots-Sparplan – vollständig mit Mengen, Preisstatus und Ladenempfehlung.</p>
    </div>
    <div class="button-row">
      <button id="refreshPrices" class="btn primary">Quellenstatus prüfen</button>
      <button id="copyShopping" class="btn subtle">Kopieren</button>
      <button id="printShopping" class="btn subtle">Drucken</button>
    </div>
  </div>
  <div id="priceStatus" class="status">Aktueller Sparplan wird geladen …</div>
  <div class="shopping-summary">
    <div><span>Empfohlener Einkauf</span><strong id="shoppingWeekLabel">–</strong></div>
    <div><span>Geschätzte Summe</span><strong id="shoppingTotal">–</strong></div>
    <div><span>Abgehakt</span><strong id="shoppingDone">0 / 0</strong></div>
    <button id="resetShopping" class="link danger">Zurücksetzen</button>
  </div>
  <div id="shoppingGroups" class="shopping-groups"><article class="info-card">Aktueller Sparplan wird geladen …</article></div>
  <p class="fineprint">Angebot = veröffentlichter Preis. Schätzung = öffentlich nicht vollständig verfügbarer Normalpreis; bitte am Regal beziehungsweise an der Frischetheke prüfen. Vorräte vorher abziehen.</p>
</section>
```

- [ ] **Step 4: Run the structure test**

Run: `node tests/structure.test.js`

Expected: PASS mit `Website-Struktur OK`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/structure.test.js
git commit -m "test: define current-plan shopping tab"
```

### Task 2: Gemeinsames Rendering und gemeinsamer Abhakzustand

**Files:**
- Create: `tests/shopping-ui.test.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: `activePlan.shopping`, `activePlan.recommendation`, `state.checked.plan`
- Produces: `shoppingItemId(group, item)`, `planShoppingItems(plan)`, `shoppingItemMarkup(group, item)`, `renderPlanShoppingViews()`, `shoppingClipboardText(plan)`

- [ ] **Step 1: Write the failing source-level UI contract**

Erstelle `tests/shopping-ui.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('both current shopping views use the active plan', () => {
  assert.match(app, /function renderPlanShoppingViews\(\)/);
  assert.match(app, /renderPlanShoppingInto\('#planShoppingGroups'/);
  assert.match(app, /renderPlanShoppingInto\('#shoppingGroups'/);
  assert.doesNotMatch(app, /function renderShopping\(\)\{const items=aggregateShopping/);
});

test('shopping actions use the active plan and shared checked state', () => {
  assert.match(app, /shoppingClipboardText\(activePlan\)/);
  assert.match(app, /state\.checked\.plan=\{\}/);
  assert.doesNotMatch(app, /copyShopping'\)\.onclick=.*aggregateShopping/);
  assert.doesNotMatch(app, /state\.checked\['week'\+state\.week\]=\{\}/);
});

test('shopping tab has an explicit no-plan state', () => {
  assert.match(app, /Aktueller Sparplan ist nicht verfügbar/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/shopping-ui.test.js`

Expected: FAIL, weil `renderPlanShoppingViews()` noch nicht existiert und die Aktionen noch `aggregateShopping()` verwenden.

- [ ] **Step 3: Add shared shopping helpers**

Ersetze die alte `renderShopping()`-Implementierung und ergänze direkt bei `priceTypeLabel()` folgende klar getrennte Helfer:

```js
function shoppingItemId(group,item){return group.department+'-'+item.name}
function planShoppingItems(plan){return (plan?.shopping||[]).flatMap(group=>group.items.map(item=>({group,item,id:shoppingItemId(group,item)})))}
function shoppingItemMarkup(group,item){
  const id=shoppingItemId(group,item),checked=!!state.checked.plan[id];
  const priceLabel=item.status==='pantry'?'Vorrat':item.price!=null?euro(item.price):'Preis offen';
  const reference=item.regularPrice!=null?`<small class="reference-price">statt ${euro(item.regularPrice)} · spart ${euro(item.savings)}</small>`:'';
  return `<label class="shopping-item ${checked?'done':''}"><input type="checkbox" data-current-shop="${encodeURIComponent(id)}" ${checked?'checked':''}><span>${item.name}<small>${item.quantity} · ${item.note}</small></span><span class="price-tag ${item.status}">${priceLabel}<small class="price-type">${priceTypeLabel(item)}</small>${reference}</span></label>`;
}
function renderPlanShoppingInto(selector,plan){
  $(selector).innerHTML=plan.shopping.map(group=>`<section class="shopping-group"><h3>${group.department}</h3>${group.items.map(item=>shoppingItemMarkup(group,item)).join('')}</section>`).join('');
}
function renderPlanShoppingViews(){
  state.checked.plan=state.checked.plan||{};
  if(!activePlan){
    $('#planShoppingGroups').innerHTML='<article class="info-card">Aktueller Sparplan ist nicht verfügbar.</article>';
    $('#shoppingGroups').innerHTML='<article class="info-card">Aktueller Sparplan ist nicht verfügbar.</article>';
    $('#shoppingWeekLabel').textContent='–';
    $('#shoppingTotal').textContent='–';
    $('#shoppingDone').textContent='0 / 0';
    return;
  }
  renderPlanShoppingInto('#planShoppingGroups',activePlan);
  renderPlanShoppingInto('#shoppingGroups',activePlan);
  const items=planShoppingItems(activePlan);
  const done=items.filter(entry=>state.checked.plan[entry.id]).length;
  $('#shoppingWeekLabel').textContent=activePlan.recommendation.market;
  $('#shoppingTotal').textContent=euro(activePlan.recommendation.estimatedTotal);
  $('#shoppingDone').textContent=`${done} / ${items.length}`;
  $$('[data-current-shop]').forEach(el=>el.onchange=()=>{
    state.checked.plan[decodeURIComponent(el.dataset.currentShop)]=el.checked;
    saveState();
    renderPlanShoppingViews();
  });
}
function renderShopping(){
  renderPlanShoppingViews();
  const meta=state.priceMeta;
  $('#priceStatus').className='status '+(activePlan?'success':'');
  $('#priceStatus').textContent=activePlan?`Preisquelle: ${meta.source}${meta.updated?' · aktualisiert '+new Date(meta.updated).toLocaleString('de-DE'):''}`:'Aktueller Sparplan ist nicht verfügbar.';
}
```

Ändere `updateProgress()`, sodass es ausschließlich `#weekProgress` für die Vorlagen aktualisiert und nicht mehr `#shoppingDone`.

- [ ] **Step 4: Make `renderCurrentPlan` use the shared renderer**

Entferne in `renderCurrentPlan(plan)` den eigenen Block, der `#planShoppingGroups` und `[data-plan-shop]` erzeugt. Nach `state.priceMeta` und `saveState()` bleibt:

```js
renderShopping();
renderPrep(plan);
bindRecipeOpen();
```

Da `activePlan=plan` am Funktionsanfang gesetzt wird, rendert `renderShopping()` jetzt beide Ansichten aus demselben Objekt.

- [ ] **Step 5: Synchronize copy and reset actions**

Ergänze:

```js
function shoppingClipboardText(plan){
  return planShoppingItems(plan).map(({item})=>{
    const price=item.status==='pantry'?'Vorrat':item.price!=null?euro(item.price):'Preis offen';
    return `☐ ${item.quantity} ${item.name} – ${item.note} – ${price} (${priceTypeLabel(item)})`;
  }).join('\n');
}
```

Ersetze die alten Handler durch:

```js
$('#copyShopping').onclick=async()=>{
  if(!activePlan){toast('Kein aktueller Sparplan geladen');return}
  try{await navigator.clipboard.writeText(shoppingClipboardText(activePlan));toast('Einkaufsliste kopiert')}
  catch{toast('Kopieren im lokalen Dateimodus blockiert')}
};
$('#printShopping').onclick=()=>window.print();
$('#resetShopping').onclick=()=>{
  state.checked.plan={};
  saveState();
  renderPlanShoppingViews();
};
```

Entferne die Eventbindungen für die nicht mehr vorhandenen Elemente `#importPrices` und `#priceFile`. `refreshPrices()` bleibt bestehen und darf nur Statusdaten aktualisieren.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/shopping-ui.test.js`

Expected: 3 Tests PASS.

Run: `npm test`

Expected: alle Tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app.js tests/shopping-ui.test.js
git commit -m "fix: synchronize current shopping views"
```

### Task 3: Browser-Verifikation und Offline-Cache

**Files:**
- Modify: `tests/ui-price-labels.test.js`
- Modify: `tests/structure.test.js`
- Modify: `service-worker.js`

**Interfaces:**
- Consumes: fertige aktuelle Einkaufsliste unter `/api/current-plan`
- Produces: Cache-Version `kochbuch-v13` und überprüfte identische Browserdarstellung

- [ ] **Step 1: Write the failing cache-version tests**

Ändere die Service-Worker-Prüfung in `tests/ui-price-labels.test.js` zu:

```js
test('service worker cache is incremented for the synchronized shopping UI', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  assert.match(worker, /kochbuch-v13/);
});
```

Ändere die entsprechende Bedingung in `tests/structure.test.js` von `kochbuch-v11` auf `kochbuch-v13`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/ui-price-labels.test.js`

Expected: FAIL, weil der Worker noch `kochbuch-v12` enthält.

- [ ] **Step 3: Increment the application-shell cache**

Ändere den Beginn von `service-worker.js` zu:

```js
// Upgrade from kochbuch-v12 after synchronizing both current shopping views.
const CACHE = 'kochbuch-v13';
```

- [ ] **Step 4: Run the complete automated test suite**

Run: `npm test`

Expected: alle Tests PASS.

- [ ] **Step 5: Run the browser synchronization smoke test**

Bei laufendem Branch-Server auf Port 8080:

```bash
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8080',{waitUntil:'networkidle'});const plan=await p.locator('#planShoppingGroups .shopping-item').allTextContents();await p.locator('[data-view=shopping]').click();const tab=await p.locator('#shoppingGroups .shopping-item').allTextContents();const schnitzel=tab.some(x=>/Schweineschnitzel/i.test(x));await p.locator('#shoppingGroups [data-current-shop]').first().check();await p.locator('[data-view=plan]').click();const synced=await p.locator('#planShoppingGroups [data-current-shop]').first().isChecked();console.log(JSON.stringify({same:JSON.stringify(plan)===JSON.stringify(tab),items:tab.length,schnitzel,synced,errors}));await b.close()})().catch(e=>{console.error(e);process.exitCode=1})"
```

Expected: `same`, `schnitzel` und `synced` sind `true`; `items` ist größer als `0`; `errors` ist leer.

- [ ] **Step 6: Verify source formatting**

Run: `git diff --check`

Expected: keine Ausgabe und Exit-Code 0.

- [ ] **Step 7: Commit**

```bash
git add service-worker.js tests/structure.test.js tests/ui-price-labels.test.js
git commit -m "chore: refresh shopping UI cache"
```

