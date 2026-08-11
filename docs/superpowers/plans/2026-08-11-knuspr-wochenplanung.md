# Knuspr-Wochenplanung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-retailer offer planner on `feature/knuspr-only` with a mobile-first weekly planner that uses Knuspr MCP over OAuth to select good-value products and safely prepare the user's existing Knuspr cart.

**Architecture:** Keep the existing dependency-light CommonJS application, but introduce focused server modules for persistence, OAuth/MCP transport, Knuspr response normalization, product ranking, weekly-plan orchestration, and idempotent cart transfer. The browser talks only to same-origin domain endpoints; OAuth tokens and raw MCP responses stay server-side. The UI uses the approved guided weekly flow and progressively enhances the locally available recipe experience.

**Tech Stack:** Node.js 22, CommonJS, native `node:http`, official `@modelcontextprotocol/client@2.0.0` loaded with dynamic `import()`, vanilla HTML/CSS/JavaScript, Node test runner, Playwright 1.61.0.

## Global Constraints

- Work only on branch `feature/knuspr-only`; do not modify `main`.
- Knuspr MCP endpoint is exactly `https://mcp.knuspr.de/mcp`.
- Use OAuth; never collect or persist the user's Knuspr password.
- Never automate checkout, payment, delivery-window selection, or final order submission.
- Never delete or reduce pre-existing Knuspr cart quantities.
- Require a fresh price, availability, and cart read before every cart mutation.
- Keep recipe browsing and the last valid plan usable during MCP outages.
- Plan seven different dinners for two people, with no fish/seafood and at least half vegetarian when the eligible pool allows it.
- Do not add filler products to reach the minimum order value.
- Display the currently known Mindestbestellwert as information, never as a reason to add products.
- Core workflows must work at 320 CSS pixels without horizontal scrolling and with keyboard-only input.
- Preserve recipe browsing, favorites, exclusions, quantities, Meal-Prep, print view, and PWA basics.
- During an MCP-Ausfall, keep local recipes and the last valid plan readable while disabling live and cart actions.
- Checkout remains a user-only action on Knuspr; no application route may initiate it.
- Automated tests must never mutate the real Knuspr account; live verification is read-only unless the user separately approves a disposable cart test.

---

## File Map

### New server modules

- `server/knuspr/contracts.js` — normalized records and validation helpers shared by all Knuspr modules.
- `server/knuspr/store.js` — atomic JSON persistence below `DATA_DIR` with restrictive auth-file permissions.
- `server/knuspr/oauth-provider.js` — SDK-compatible OAuth provider backed by the store.
- `server/knuspr/client.js` — MCP Streamable HTTP lifecycle, authorization start/callback, and tool invocation.
- `server/knuspr/adapter.js` — tool discovery, semantic argument mapping, and normalization of Knuspr responses.
- `server/knuspr/product-selection.js` — pack calculation and price-performance ranking.
- `server/knuspr/cart.js` — fresh-cart diff, revalidation, idempotent application, and per-line receipts.
- `server/knuspr-service.js` — weekly plan/product search orchestration, cache, preview persistence, and CLI refresh.

### New browser modules

- `knuspr-api.js` — small same-origin HTTP client with typed error normalization.
- `knuspr-ui.js` — Knuspr connection, additional-list, plan, preview, and cart interaction state.

### Existing files to reshape

- `server/planner.js` — retain dietary, quantity, shopping-department, diversity, and meal-prep logic; replace retailer scoring with Knuspr plan scoring.
- `server.js` — expose Knuspr OAuth, list, planning, preview, and cart routes.
- `index.html`, `styles.css`, `app.js` — implement the approved guided responsive UI while retaining cookbook features.
- `server/current-plan.json` — replace the legacy fallback with schema-versioned Knuspr offline data.
- `service-worker.js`, `manifest.webmanifest` — cache new static modules and update product wording/version.
- `package.json`, `package-lock.json`, `config.example.json`, `compose.yaml`, `README.md` — dependency, runtime configuration, and operator documentation.

### Tests

- `tests/knuspr-store.test.js`
- `tests/knuspr-oauth.test.js`
- `tests/knuspr-adapter.test.js`
- `tests/knuspr-product-selection.test.js`
- `tests/knuspr-planner.test.js`
- `tests/knuspr-cart.test.js`
- `tests/knuspr-server.test.js`
- `tests/knuspr-ui.test.js`
- `tests/knuspr-browser.test.js`

---

### Task 1: Normalized contracts and atomic runtime persistence

**Files:**
- Create: `server/knuspr/contracts.js`
- Create: `server/knuspr/store.js`
- Create: `tests/knuspr-store.test.js`

**Interfaces:**
- Produces: `validateAdditionalItems(items)`, `validatePreview(preview)`, `createKnusprStore({ dataDir, fsImpl })`.
- Store methods: `read(name, fallback)`, `write(name, value, { sensitive = false } = {})`, `remove(name)`.
- Persisted names: `knuspr-auth.json`, `knuspr-additional-items.json`, `knuspr-product-cache.json`, `knuspr-preview.json`, `current-plan.json`, `knuspr-cart-receipt.json`.

- [ ] **Step 1: Write failing validation and atomic-write tests**

```js
test('additional items reject unknown categories and normalize optional pins', () => {
  assert.deepEqual(validateAdditionalItems([{ id:'water', label:'Wasser', searchTerm:'Mineralwasser', quantity:2, category:'getraenke', enabled:true }])[0].pinnedProductId, null);
  assert.throws(() => validateAdditionalItems([{ id:'x', label:'X', searchTerm:'X', quantity:1, category:'sonstiges', enabled:true }]), /Kategorie/);
});

test('sensitive writes use mode 0600 and survive a complete read', async () => {
  const store = createKnusprStore({ dataDir });
  await store.write('knuspr-auth.json', { tokens:{ access_token:'secret' } }, { sensitive:true });
  assert.deepEqual(await store.read('knuspr-auth.json', null), { tokens:{ access_token:'secret' } });
  assert.equal((await fs.stat(path.join(dataDir, 'knuspr-auth.json'))).mode & 0o777, 0o600);
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `node --test tests/knuspr-store.test.js`

Expected: FAIL with `Cannot find module '../server/knuspr/store'`.

- [ ] **Step 3: Implement contracts and temp-file-plus-rename writes**

```js
function validateAdditionalItems(items) {
  const categories = new Set(['getraenke', 'vorrat', 'haushalt']);
  if (!Array.isArray(items)) throw new Error('Zusatzliste muss ein Array sein');
  return items.map(item => {
    if (!categories.has(item.category)) throw new Error('Ungültige Kategorie');
    if (!String(item.id || '').trim() || !String(item.label || '').trim() || !String(item.searchTerm || '').trim()) throw new Error('Eintrag ist unvollständig');
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Menge muss positiv sein');
    return { id:String(item.id), label:String(item.label).trim(), searchTerm:String(item.searchTerm).trim(), quantity, category:item.category, enabled:item.enabled !== false, pinnedProductId:item.pinnedProductId ? String(item.pinnedProductId) : null };
  });
}

async function write(name, value, { sensitive = false } = {}) {
  await fs.mkdir(dataDir, { recursive:true });
  const target = path.join(dataDir, safeName(name));
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode:sensitive ? 0o600 : 0o644 });
  await fs.rename(temporary, target);
  if (sensitive) await fs.chmod(target, 0o600);
}
```

- [ ] **Step 4: Run the focused test and full existing suite**

Run: `node --test tests/knuspr-store.test.js`

Expected: PASS.

Run: `npm test`

Expected: all pre-existing tests plus the new store tests PASS.

- [ ] **Step 5: Commit the persistence boundary**

```bash
git add server/knuspr/contracts.js server/knuspr/store.js tests/knuspr-store.test.js
git commit -m "feat: add Knuspr runtime data store"
```

### Task 2: OAuth provider and MCP client lifecycle

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/knuspr/oauth-provider.js`
- Create: `server/knuspr/client.js`
- Create: `tests/knuspr-oauth.test.js`

**Interfaces:**
- Consumes: `createKnusprStore()` from Task 1.
- Produces: `createOAuthProvider({ store, redirectUrl, onAuthorizationUrl, stateFactory })`.
- Produces: `createKnusprClient({ store, redirectUrl, endpoint, sdkLoader })` with `status()`, `beginAuthorization()`, `finishAuthorization(callbackUrl)`, `disconnect()`, `listTools()`, `callTool(name, args)`.

- [ ] **Step 1: Install the pinned official client package**

Run: `npm install --save-exact @modelcontextprotocol/client@2.0.0`

Expected: `package.json` and lockfile contain exactly `@modelcontextprotocol/client` version `2.0.0`.

- [ ] **Step 2: Write failing provider and callback tests with an injected SDK**

```js
test('provider persists PKCE, state, client registration and tokens server-side', async () => {
  const provider = createOAuthProvider({ store, redirectUrl:'http://localhost:8080/api/knuspr/callback', stateFactory:()=>'state-123' });
  await provider.saveCodeVerifier('verifier');
  await provider.saveTokens({ access_token:'token', token_type:'bearer' }, { issuer:'https://auth.example' });
  assert.equal(await provider.codeVerifier(), 'verifier');
  assert.equal((await provider.tokens()).access_token, 'token');
  assert.equal(await provider.state(), 'state-123');
});

test('finishAuthorization rejects a mismatched state before token exchange', async () => {
  const client = createKnusprClient({ store, redirectUrl, sdkLoader:fakeSdkLoader });
  await client.beginAuthorization();
  await assert.rejects(client.finishAuthorization(`${redirectUrl}?code=abc&state=wrong`), /OAuth-State/);
});
```

- [ ] **Step 3: Verify the OAuth tests fail**

Run: `node --test tests/knuspr-oauth.test.js`

Expected: FAIL with missing `oauth-provider` and `client` modules.

- [ ] **Step 4: Implement the SDK provider and fresh-transport callback flow**

```js
const DEFAULT_ENDPOINT = 'https://mcp.knuspr.de/mcp';

async function connectTransport() {
  const { Client, StreamableHTTPClientTransport } = await sdkLoader();
  const provider = createOAuthProvider({ store, redirectUrl, onAuthorizationUrl:url => { pendingAuthorizationUrl = String(url); } });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { authProvider:provider });
  const client = new Client({ name:'feierabend-kochbuch', version:'5.0.0' });
  await client.connect(transport);
  return { client, transport, provider };
}

async function finishAuthorization(callbackUrl) {
  const callback = new URL(callbackUrl);
  await assertAndConsumeState(callback.searchParams.get('state'));
  const session = await createUnconnectedSession();
  await session.transport.finishAuth(callback.searchParams);
  await session.client.connect(await createFreshTransport(session.provider));
  return { connected:true };
}
```

Implement every required `OAuthClientProvider` method: `redirectUrl`, `clientMetadata`, `state`, `clientInformation`, `saveClientInformation`, `tokens`, `saveTokens`, `redirectToAuthorization`, `saveCodeVerifier`, `codeVerifier`, `saveDiscoveryState`, `discoveryState`, and `invalidateCredentials`. Do not log token-bearing objects.

- [ ] **Step 5: Run OAuth tests and dependency audit**

Run: `node --test tests/knuspr-oauth.test.js`

Expected: PASS, including mismatch and disconnect cases.

Run: `npm audit --omit=dev`

Expected: no known high or critical production vulnerability. If present, stop and document the exact advisory before continuing.

- [ ] **Step 6: Commit OAuth/MCP transport support**

```bash
git add package.json package-lock.json server/knuspr/oauth-provider.js server/knuspr/client.js tests/knuspr-oauth.test.js
git commit -m "feat: connect to Knuspr MCP with OAuth"
```

### Task 3: Discover tools and normalize Knuspr responses

**Files:**
- Create: `server/knuspr/adapter.js`
- Create: `tests/knuspr-adapter.test.js`

**Interfaces:**
- Consumes: `client.listTools()` and `client.callTool(name, args)` from Task 2.
- Produces: `createKnusprAdapter({ client })` with `capabilities()`, `searchProducts(query)`, `getCart()`, `addCartItems(items)`.
- Normalized product shape: `{ id, name, brand, url, imageUrl, available, package:{ amount, unit, label }, price:{ current, regular, unit, unitLabel, offer }, qualityTags }`.
- Normalized cart line: `{ productId, name, quantity, unitPrice, totalPrice }`.

- [ ] **Step 1: Write failing semantic-tool and normalization tests**

```js
test('adapter resolves product search and cart capabilities from tool metadata', async () => {
  const adapter = createKnusprAdapter({ client:fakeClient([
    tool('catalog_product_search', 'Search available products'),
    tool('cart_get', 'Read the current shopping cart'),
    tool('cart_add_items', 'Add product quantities to cart')
  ]) });
  assert.deepEqual(await adapter.capabilities(), { searchProducts:true, readCart:true, addCartItems:true });
});

test('ambiguous capability discovery fails closed', async () => {
  const adapter = createKnusprAdapter({ client:fakeClient([tool('search_a','Search products'), tool('search_b','Search products')]) });
  await assert.rejects(adapter.searchProducts('Kartoffeln'), /KNUSPR_TOOLSET_UNSUPPORTED/);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test tests/knuspr-adapter.test.js`

Expected: FAIL with missing adapter module.

- [ ] **Step 3: Implement deterministic capability discovery and argument mapping**

```js
const CAPABILITIES = {
  searchProducts: [/search.*product/i, /product.*search/i, /produkt.*such/i],
  readCart: [/(get|read|show).*cart/i, /cart.*(get|read|show)/i, /warenkorb.*(lesen|anzeigen)/i],
  addCartItems: [/add.*cart/i, /cart.*add/i, /warenkorb.*hinzu/i]
};

function resolveTool(tools, capability) {
  const matches = tools.filter(tool => CAPABILITIES[capability].some(pattern => pattern.test(`${tool.name} ${tool.title || ''} ${tool.description || ''}`)));
  if (matches.length !== 1) throw Object.assign(new Error(`KNUSPR_TOOLSET_UNSUPPORTED: ${capability}`), { code:'KNUSPR_TOOLSET_UNSUPPORTED' });
  return matches[0];
}

function searchArguments(tool, query) {
  const properties = tool.inputSchema?.properties || {};
  const key = ['query','searchTerm','term','text'].find(candidate => properties[candidate]);
  if (!key) throw new Error('KNUSPR_TOOLSET_UNSUPPORTED: search argument');
  return { [key]:query };
}
```

Normalize JSON from either `structuredContent` or JSON-bearing text content. Reject responses without stable product IDs, finite non-negative prices, or interpretable availability; never invent fields.

- [ ] **Step 4: Run adapter tests**

Run: `node --test tests/knuspr-adapter.test.js`

Expected: PASS for discovery, structured/text content, malformed data, product normalization, cart normalization, and safe argument mapping.

- [ ] **Step 5: Commit the anti-corruption adapter**

```bash
git add server/knuspr/adapter.js tests/knuspr-adapter.test.js
git commit -m "feat: normalize Knuspr MCP tools"
```

### Task 4: Pack calculations and balanced price-performance product selection

**Files:**
- Create: `server/knuspr/product-selection.js`
- Create: `tests/knuspr-product-selection.test.js`

**Interfaces:**
- Produces: `parseRequiredAmount(ingredient, servingScale)`, `calculatePackChoice(demand, product)`, `rankProducts(demand, products, preferences)`, `chooseProduct(demand, products, preferences)`.
- `chooseProduct` returns `{ selected, alternatives, packages, totalAmount, wasteAmount, totalPrice, reason, status }`; status is `selected`, `ambiguous`, or `missing`.

- [ ] **Step 1: Write failing correctness and ranking tests**

```js
test('exact match beats a cheaper prepared product', () => {
  const demand = demandOf('600 g Hähnchenbrust');
  const result = chooseProduct(demand, [product('ramen','Chicken Ramen',0.99,140), product('breast','Hähnchenbrustfilet',5.49,600)], {});
  assert.equal(result.selected.id, 'breast');
});

test('ranking charges whole packs and accepts modest reusable waste for a clearly lower total', () => {
  const demand = demandOf('750 g Kartoffeln');
  const result = chooseProduct(demand, [product('onekg','Kartoffeln',1.99,1000), product('two','Kartoffeln',1.79,500)], {});
  assert.deepEqual({ id:result.selected.id, packages:result.packages, totalPrice:result.totalPrice, waste:result.wasteAmount }, { id:'onekg', packages:1, totalPrice:1.99, waste:250 });
});

test('available pinned product wins after hard suitability checks', () => {
  const result = chooseProduct(demandOf('1 l Milch'), [product('a','Vollmilch',1.09,1000), product('b','Bio Vollmilch',1.29,1000)], { pinnedProductId:'b' });
  assert.equal(result.selected.id, 'b');
});
```

- [ ] **Step 2: Run and observe missing implementation**

Run: `node --test tests/knuspr-product-selection.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement transparent suitability and value ranking**

```js
function rankTuple(choice, preferences) {
  const valueCost = choice.totalPrice + Math.min(0.5, choice.wasteRatio * 0.5);
  return [
    choice.matchTier,
    choice.missingAmount > 0 ? 1 : 0,
    choice.product.id === preferences.pinnedProductId ? 0 : 1,
    -choice.qualitySignals.length,
    valueCost,
    choice.wasteRatio,
    choice.totalPrice
  ];
}

function compareTuple(left, right) {
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
```

Carry forward the existing meat-cut, fresh-versus-prepared, optional-ingredient, cucumber, cheese, pasta, and seasoning safeguards as hard suitability rules. Treat unknown package sizes as `ambiguous`, not as one arbitrary package.

- [ ] **Step 4: Run focused and retained planner matching tests**

Run: `node --test tests/knuspr-product-selection.test.js tests/planner.test.js`

Expected: PASS with exact package totals and no unsuitable substitutions.

- [ ] **Step 5: Commit product selection**

```bash
git add server/knuspr/product-selection.js tests/knuspr-product-selection.test.js
git commit -m "feat: rank Knuspr products by value"
```

### Task 5: Knuspr weekly planner and preview orchestration

**Files:**
- Modify: `server/planner.js`
- Create: `server/knuspr-service.js`
- Create: `tests/knuspr-planner.test.js`
- Modify: `tests/planner.test.js`
- Modify: `server/current-plan.json`

**Interfaces:**
- Produces from planner: `buildIngredientDemands(recipes, { servings })`, `selectKnusprWeek({ recipes, productChoices, exclusions, variation, now })`, `buildKnusprPlan(...)`.
- Produces from service: `createKnusprService({ adapter, store, recipes, now, concurrency })` with `generatePlan(input)`, `regeneratePlan(input)`, `getPlan()`, `getPreview()`, `updatePreviewLine(input)`, `getAdditionalItems()`, `saveAdditionalItems(items)`; `createRuntime(options)` wires the real store, client, adapter, and service for the HTTP server, CLI, and read-only smoke script.
- Current schema uses `schemaVersion:5`, `days`, `shoppingPreview`, `mealPrep`, `excludedIngredients`, `planRevision`, and `generatedAt`.

- [ ] **Step 1: Write failing plan tests for seven days, value, reuse, and outage fallback**

```js
test('planner selects seven unique dinners for two and at least four vegetarian meals', async () => {
  const plan = await serviceWithCatalog(catalog).generatePlan({ excludedIngredients:[], variation:0 });
  assert.equal(plan.days.length, 7);
  assert.equal(new Set(plan.days.map(day => day.recipeId)).size, 7);
  assert.ok(plan.days.filter(day => recipe(day.recipeId).vegetarian).length >= 4);
  assert.equal(plan.servings, 2);
});

test('planner reuses a purchased pack across recipes instead of charging it twice', async () => {
  const plan = await serviceWithCatalog(sharedSpinachCatalog).generatePlan({ variation:0 });
  const spinach = plan.shoppingPreview.lines.find(line => line.demand.searchTerm === 'Spinat');
  assert.equal(spinach.productPackages, 1);
  assert.deepEqual(spinach.recipeIds.sort(), ['spinach-gnocchi','spinach-pasta']);
});

test('failed MCP refresh leaves the last schema-5 plan untouched', async () => {
  await store.write('current-plan.json', savedPlan);
  await assert.rejects(failingService.generatePlan({}), /Knuspr/);
  assert.deepEqual(await store.read('current-plan.json', null), savedPlan);
});
```

- [ ] **Step 2: Run planner tests and verify failure**

Run: `node --test tests/knuspr-planner.test.js`

Expected: FAIL because `createKnusprService` and Knuspr planner exports do not exist.

- [ ] **Step 3: Implement bounded product lookup and plan assembly**

```js
async function mapConcurrent(values, limit, mapper) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() { while (cursor < values.length) { const index = cursor++; result[index] = await mapper(values[index], index); } }
  await Promise.all(Array.from({ length:Math.min(limit, values.length) }, worker));
  return result;
}

async function generatePlan(input) {
  const shortlist = shortlistRecipes(recipes, input.excludedIngredients, input.variation, 14);
  const demands = buildIngredientDemands(shortlist, { servings:2 });
  const productsByQuery = await mapConcurrent(uniqueQueries(demands), concurrency, cachedSearch);
  const choices = demands.map(demand => chooseProduct(demand, productsByQuery.get(demand.searchTerm) || [], preferenceFor(demand)));
  const plan = buildKnusprPlan({ recipes:shortlist, productChoices:choices, additionalItems:await getAdditionalItems(), exclusions:input.excludedIngredients, variation:input.variation, now:now() });
  await store.write('knuspr-preview.json', plan.shoppingPreview);
  await store.write('current-plan.json', plan);
  return plan;
}
```

Cache identical searches for ten minutes, but never use this cache inside cart application. Persist only after the complete plan and preview validate successfully.

- [ ] **Step 4: Run planner, data, seasoning, and meal-prep tests**

Run: `node --test tests/knuspr-planner.test.js tests/data-module.test.js tests/seasoning-browser.test.js tests/fallback-plan.test.js`

Expected: PASS; fallback test now asserts `schemaVersion === 5` and no legacy market fields.

- [ ] **Step 5: Commit the Knuspr plan service**

```bash
git add server/planner.js server/knuspr-service.js server/current-plan.json tests/knuspr-planner.test.js tests/planner.test.js tests/fallback-plan.test.js
git commit -m "feat: generate Knuspr-backed weekly plans"
```

### Task 6: Idempotent and fail-safe cart transfer

**Files:**
- Create: `server/knuspr/cart.js`
- Create: `tests/knuspr-cart.test.js`

**Interfaces:**
- Consumes: adapter `searchProducts`, `getCart`, and `addCartItems`; store preview and receipt.
- Produces: `computeCartDelta(previewLines, currentCart)`, `revalidatePreview(preview, adapter)`, `applyPreview({ previewRevision, acceptedLineIds, adapter, store })`.
- Receipt shape: `{ previewRevision, attemptedAt, lines:[{ lineId, productId, requested, added, status, errorCode }] }`.

- [ ] **Step 1: Write failing delta, changed-price, partial-failure, and retry tests**

```js
test('delta adds only missing quantities and never removes existing items', () => {
  assert.deepEqual(computeCartDelta([{ id:'milk-line', product:{ id:'milk' }, cartQuantity:3 }], [{ productId:'milk', quantity:2 }]), [{ lineId:'milk-line', productId:'milk', quantity:1 }]);
  assert.deepEqual(computeCartDelta([{ id:'milk-line', product:{ id:'milk' }, cartQuantity:1 }], [{ productId:'milk', quantity:2 }]), []);
});

test('changed price returns a refreshed preview without mutating cart', async () => {
  const result = await applyPreview(fixture({ oldPrice:1.09, freshPrice:1.29 }));
  assert.equal(result.status, 'reconfirm-required');
  assert.equal(adapter.addCalls.length, 0);
});

test('retry after a partial failure does not duplicate the successful line', async () => {
  await applyPreview(partialFailureFixture);
  const retry = await applyPreview(retryFixtureWithFreshCart);
  assert.deepEqual(retry.attemptedProductIds, ['failed-product']);
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `node --test tests/knuspr-cart.test.js`

Expected: FAIL with missing cart module.

- [ ] **Step 3: Implement revalidation, revision check, and fresh-cart delta**

```js
async function applyPreview({ previewRevision, acceptedLineIds, adapter, store }) {
  const preview = validatePreview(await store.read('knuspr-preview.json', null));
  if (preview.revision !== previewRevision) throw conflict('Vorschau ist veraltet');
  const refreshed = await revalidatePreview(preview, adapter);
  if (refreshed.changed) { await store.write('knuspr-preview.json', refreshed.preview); return { status:'reconfirm-required', preview:refreshed.preview }; }
  const currentCart = await adapter.getCart();
  const delta = computeCartDelta(refreshed.preview.lines.filter(line => acceptedLineIds.includes(line.id)), currentCart);
  const receipt = await applyDeltaSequentially(delta, adapter);
  await store.write('knuspr-cart-receipt.json', receipt);
  return { status:receipt.lines.some(line => line.status === 'failed') ? 'partial' : 'complete', receipt };
}
```

After any uncertain mutation error, read the cart again before retrying. Never catch a network timeout and blindly repeat an add operation.

- [ ] **Step 4: Run cart and adapter tests**

Run: `node --test tests/knuspr-cart.test.js tests/knuspr-adapter.test.js`

Expected: PASS for duplicates, price changes, stock changes, stale revisions, partial failures, and uncertain timeouts.

- [ ] **Step 5: Commit safe cart transfer**

```bash
git add server/knuspr/cart.js tests/knuspr-cart.test.js
git commit -m "feat: apply Knuspr cart previews safely"
```

### Task 7: Same-origin Knuspr HTTP API

**Files:**
- Modify: `server.js`
- Create: `tests/knuspr-server.test.js`
- Modify: `config.example.json`
- Modify: `compose.yaml`

**Interfaces:**
- Consumes service/client/cart functions from Tasks 2, 5, and 6.
- Produces routes: `GET /api/knuspr/status`, `POST /api/knuspr/connect`, `GET /api/knuspr/callback`, `POST /api/knuspr/disconnect`, `GET|PUT /api/additional-items`, `POST /api/plan/generate`, `POST /api/plan/regenerate`, `GET /api/current-plan`, `GET|PATCH /api/preview`, `POST /api/knuspr/cart/apply`.

- [ ] **Step 1: Write failing route authorization and response tests**

```js
test('connect returns an OAuth URL but never auth storage', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/knuspr/connect`, { method:'POST', headers:auth });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.authorizationUrl, /^https:\/\//);
    assert.doesNotMatch(JSON.stringify(body), /access_token|refresh_token/);
  });
});

test('cart apply rejects missing token and stale revision', async () => {
  assert.equal((await fetch(`${base}/api/knuspr/cart/apply`, { method:'POST' })).status, 403);
  const response = await fetch(`${base}/api/knuspr/cart/apply`, { method:'POST', headers:{ ...auth, 'content-type':'application/json' }, body:JSON.stringify({ previewRevision:'old', acceptedLineIds:[] }) });
  assert.equal(response.status, 409);
});
```

- [ ] **Step 2: Run route tests and verify 404/failure**

Run: `node --test tests/knuspr-server.test.js`

Expected: FAIL because Knuspr routes are absent.

- [ ] **Step 3: Extract mutation authorization and implement exact routes**

```js
function mutationAllowed(req, refreshToken) {
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  return refreshToken ? supplied === refreshToken : local;
}

if (req.method === 'POST' && url.pathname === '/api/knuspr/cart/apply') {
  if (!mutationAllowed(req, refreshToken)) return sendJson(res, 403, { error:'Warenkorbänderung nicht erlaubt' });
  try { return sendJson(res, 200, await cart.applyPreview(await readJson(req))); }
  catch (error) { return sendDomainError(res, error); }
}
```

Set `APP_ORIGIN=http://localhost:8080` and `KNUSPR_MCP_URL=https://mcp.knuspr.de/mcp` in example configuration. OAuth callback errors redirect to `/?knuspr=error` without reflecting raw provider messages.

- [ ] **Step 4: Run server suites**

Run: `node --test tests/server.test.js tests/knuspr-server.test.js`

Expected: PASS. Update `tests/server.test.js` to remove retailer-import expectations while retaining static-file traversal and mutation-auth coverage.

- [ ] **Step 5: Commit the domain API**

```bash
git add server.js tests/server.test.js tests/knuspr-server.test.js config.example.json compose.yaml
git commit -m "feat: expose Knuspr planning API"
```

### Task 8: Connection settings and editable additional list UI

**Files:**
- Create: `knuspr-api.js`
- Create: `knuspr-ui.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Create: `tests/knuspr-ui.test.js`

**Interfaces:**
- Produces browser API methods: `getKnusprStatus`, `connectKnuspr`, `disconnectKnuspr`, `getAdditionalItems`, `saveAdditionalItems`, `generatePlan`, `getPreview`, `patchPreview`, `applyCart`.
- `window.KNUSPR_UI.init({ api, document })` owns Knuspr-specific DOM behavior; generic recipes remain in `app.js`.

- [ ] **Step 1: Write failing structure and state tests**

```js
test('settings expose OAuth connection without password fields', () => {
  assert.match(html, /id="connectKnuspr"/);
  assert.match(html, /id="knusprConnectionStatus"/);
  assert.doesNotMatch(html, /rhl-pass|Knuspr-Passwort/i);
});

test('additional list has create, edit, pause, and delete controls', () => {
  for (const id of ['additionalItemForm','additionalItems','additionalItemCategory','saveAdditionalItems']) assert.match(html, new RegExp(`id="${id}"`));
  for (const action of ['edit-additional','toggle-additional','delete-additional']) assert.match(uiSource, new RegExp(action));
});
```

- [ ] **Step 2: Run UI test and verify missing controls**

Run: `node --test tests/knuspr-ui.test.js`

Expected: FAIL because the new scripts and controls do not exist.

- [ ] **Step 3: Implement the browser API and additional-list editor**

```js
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers:authHeaders(options.headers || {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status:response.status, details:body });
  return body;
}

function additionalItemMarkup(item) {
  return `<li data-additional-id="${escapeAttribute(item.id)}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.searchTerm)} · ${item.quantity}</small></span><div class="item-actions"><button data-action="edit-additional">Bearbeiten</button><button data-action="toggle-additional">${item.enabled ? 'Pausieren' : 'Aktivieren'}</button><button data-action="delete-additional">Löschen</button></div></li>`;
}
```

All user-provided strings pass through text/attribute escaping. Save only validated server responses back into local view state.

- [ ] **Step 4: Run UI and server tests**

Run: `node --test tests/knuspr-ui.test.js tests/knuspr-server.test.js`

Expected: PASS for connected, disconnected, reconnect-required, create, edit, pause, and delete states.

- [ ] **Step 5: Commit settings and list editor**

```bash
git add knuspr-api.js knuspr-ui.js index.html styles.css app.js tests/knuspr-ui.test.js
git commit -m "feat: add Knuspr settings and recurring items"
```

### Task 9: Guided weekly flow and responsive cart preview

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `knuspr-ui.js`
- Modify: `app.js`
- Create: `tests/knuspr-browser.test.js`
- Modify: `tests/shopping-browser.test.js`
- Modify: `tests/shopping-ui.test.js`

**Interfaces:**
- Consumes schema-5 plan/preview and browser API from previous tasks.
- Produces plan states: `idle`, `loading`, `ready`, `needs-review`, `reconfirm-required`, `applying`, `partial`, `complete`, `offline`.

- [ ] **Step 1: Write failing Playwright tests at mobile and desktop sizes**

```js
test('320px flow renders without horizontal overflow and keeps cart action reachable', async () => {
  await page.setViewportSize({ width:320, height:700 });
  await page.goto(baseUrl);
  await page.getByRole('button', { name:'Wochenplan erstellen' }).click();
  await expect(page.getByRole('heading', { name:'7 Abende. Ein Warenkorb.' })).toBeVisible();
  await page.getByRole('button', { name:/Warenkorb prüfen/ }).click();
  await expect(page.getByRole('button', { name:/Zu Knuspr übertragen/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(overflow, false);
});

test('changed price requires a second confirmation and does not call checkout', async () => {
  await openReadyPreview(page);
  await page.getByRole('button', { name:/Zu Knuspr übertragen/ }).click();
  await expect(page.getByText(/Preis wurde aktualisiert/)).toBeVisible();
  assert.equal(requests.some(request => /checkout|order|payment/i.test(request.url())), false);
});
```

- [ ] **Step 2: Run browser tests and verify missing guided UI**

Run: `node --test tests/knuspr-browser.test.js`

Expected: FAIL on missing headings/actions.

- [ ] **Step 3: Implement approved guided markup and render states**

```html
<section class="plan-hero" aria-labelledby="plan-title">
  <span class="eyebrow">DEINE NÄCHSTE WOCHE</span>
  <h1 id="plan-title">7 Abende. Ein Warenkorb.</h1>
  <p>Gute Produkte, aktuelle Angebote und möglichst wenig Überschuss.</p>
  <button id="generateKnusprPlan" class="btn primary">Wochenplan erstellen</button>
</section>
<nav class="mobile-nav" aria-label="Hauptnavigation">...</nav>
<div id="cartActionBar" class="cart-action-bar" hidden>...</div>
```

Render product groups with native buttons and `aria-expanded`; expose warnings before product lists. Alternatives use a real modal dialog with focus return. The apply button sends the visible `previewRevision` and selected line IDs exactly once while disabled.

- [ ] **Step 4: Add mobile-first CSS, focus, motion, and lazy-image rules**

```css
.cart-action-bar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;min-height:64px;padding:12px max(14px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));background:var(--surface);box-shadow:0 -8px 22px rgb(23 59 44 / .12)}
button,.touch-target{min-height:44px;min-width:44px}
img[loading="lazy"]{aspect-ratio:1;object-fit:cover}
@media (max-width:359px){.summary-grid{grid-template-columns:1fr 1fr}.summary-grid>:last-child{grid-column:1/-1}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
```

- [ ] **Step 5: Run responsive and retained cookbook browser tests**

Run: `node --test tests/knuspr-browser.test.js tests/shopping-browser.test.js tests/seasoning-browser.test.js`

Expected: PASS at 320, 375, 768, and 1280 widths; no page errors; keyboard path reaches every primary action.

- [ ] **Step 6: Commit the guided UI**

```bash
git add index.html styles.css knuspr-ui.js app.js tests/knuspr-browser.test.js tests/shopping-browser.test.js tests/shopping-ui.test.js
git commit -m "feat: add mobile Knuspr weekly flow"
```

### Task 10: Remove legacy retailers and update offline/operator assets

**Files:**
- Delete: `api/rewe-prices.js`
- Delete: `rewe-preise-beispiel.json`
- Delete: `server/browser-setup.js`
- Delete: `server/refresh.js`
- Delete: `server/regular-prices.js`
- Delete: `server/price-baselines.json`
- Delete: `tests/refresh.test.js`
- Delete: `tests/regular-prices.test.js`
- Delete: `tests/ui-price-labels.test.js`
- Delete: `docs/superpowers/specs/2026-07-24-angebotsbasierte-wochenplanung-design.md`
- Delete: `docs/superpowers/specs/2026-07-24-gezielter-normalpreisabruf-design.md`
- Delete: `docs/superpowers/specs/2026-07-31-ehrlicher-quellenstatus-ausgewogene-wochenplanung-design.md`
- Delete: `docs/superpowers/plans/2026-07-24-wochenplan-mvp.md`
- Delete: `docs/superpowers/plans/2026-07-24-gezielter-normalpreisabruf.md`
- Delete: `docs/superpowers/plans/2026-07-31-ehrlicher-quellenstatus-ausgewogene-wochenplanung.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `service-worker.js`
- Modify: `manifest.webmanifest`
- Modify: `tests/structure.test.js`

**Interfaces:**
- Consumes all replacement behavior from Tasks 1–9.
- Produces a Knuspr-only active tree and documentation; old designs remain available in Git history.

- [ ] **Step 1: Change structure tests to define the Knuspr-only boundary**

```js
for (const required of ['knuspr-api.js','knuspr-ui.js','server/knuspr-service.js','server/knuspr/adapter.js']) assert.equal(fs.existsSync(path.join(root, required)), true, `${required} fehlt`);
for (const removed of ['api/rewe-prices.js','server/refresh.js','server/regular-prices.js','server/browser-setup.js']) assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed} muss entfernt sein`);
const active = ['index.html','app.js','knuspr-ui.js','README.md','config.example.json'].map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n');
assert.doesNotMatch(active, /REWE|EDEKA|Kaufland|HTML-Import/i);
assert.match(active, /Knuspr/);
```

- [ ] **Step 2: Run structure test and verify it fails before removal**

Run: `node tests/structure.test.js`

Expected: FAIL because legacy files and active copy still exist.

- [ ] **Step 3: Delete exact legacy files and rewrite operator documentation**

Use `apply_patch` deletions, not a broad recursive command. Change `npm run refresh` to `node server/knuspr-service.js`, remove `browser:setup`, document `APP_ORIGIN`, `KNUSPR_MCP_URL`, `DATA_DIR`, `REFRESH_TOKEN`, one-time OAuth connection, cart safety, Docker persistence, and read-only outage behavior.

Update the service-worker asset order to include `knuspr-api.js` then `knuspr-ui.js` before `app.js`, bump the cache name to `kochbuch-v15`, and continue bypassing every `/api/` request.

- [ ] **Step 4: Run removal scan and full tests**

Run: `rg -n -i "rewe|edeka|kaufland|import-offers|browser:setup|regular-prices" --glob '!docs/superpowers/specs/2026-08-11-knuspr-wochenplanung-design.md' --glob '!docs/superpowers/plans/2026-08-11-knuspr-wochenplanung.md' .`

Expected: no active matches. Matches in the current Knuspr spec/plan are explicitly excluded because they document removal requirements.

Run: `npm test`

Expected: PASS with no real Knuspr calls.

- [ ] **Step 5: Commit legacy removal and documentation**

```bash
git add -A
git commit -m "refactor: remove legacy retailer integrations"
```

### Task 11: Read-only live compatibility check and release verification

**Files:**
- Create: `scripts/knuspr-readonly-smoke.js`
- Modify: `README.md`
- Modify: `tests/knuspr-adapter.test.js` only if live tool metadata reveals a deterministic alias absent from Task 3.

**Interfaces:**
- Consumes the stored OAuth session and adapter.
- Produces a read-only command that lists resolved capabilities and searches one harmless product query; it never calls cart mutation tools.

- [ ] **Step 1: Write the smoke script with an explicit mutation guard**

```js
'use strict';
const { createRuntime } = require('../server/knuspr-service');

async function runReadonlySmoke({ adapter, write = value => console.log(value) }) {
  const capabilities = await adapter.capabilities();
  if (!capabilities.searchProducts || !capabilities.readCart || !capabilities.addCartItems) throw new Error('Benötigte Knuspr-Fähigkeiten fehlen');
  const products = await adapter.searchProducts('Kartoffeln');
  write(JSON.stringify({ capabilities, productCount:products.length, sample:products.slice(0,3).map(({ id,name,available }) => ({ id,name,available })) }, null, 2));
}

if (require.main === module) createRuntime().then(({ adapter }) => runReadonlySmoke({ adapter })).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runReadonlySmoke };
```

- [ ] **Step 2: Test the script against a fake adapter before live use**

Run: `node --test tests/knuspr-adapter.test.js`

Expected: PASS and explicitly assert that `runReadonlySmoke({ adapter:fakeAdapter })` calls `capabilities`, `searchProducts`, and neither `getCart` nor `addCartItems`.

- [ ] **Step 3: Run the read-only smoke after the user completes OAuth**

Run: `node scripts/knuspr-readonly-smoke.js`

Expected: JSON reports all three required capabilities and at least one normalized potato product. If tool discovery fails, add only the exact observed deterministic alias to `CAPABILITIES`, add its fixture to `tests/knuspr-adapter.test.js`, and rerun the focused tests. Do not broaden regexes until multiple unrelated tools match.

- [ ] **Step 4: Run final static, test, and HTTP verification**

Run: `node --check server.js && node --check server/knuspr-service.js && node --check knuspr-ui.js && git diff --check && npm test`

Expected: every syntax check exits 0, `git diff --check` emits no output, and the complete suite reports zero failures.

Run: `npm start`

In a second terminal run: `curl -sS http://127.0.0.1:8080/api/knuspr/status` and `curl -sS http://127.0.0.1:8080/api/current-plan`.

Expected: status JSON contains no tokens; current plan is schema 5. Stop the server after the checks.

- [ ] **Step 5: Verify responsive behavior manually without cart mutation**

Open `http://127.0.0.1:8080` at 320, 375, 768, and 1280 CSS-pixel widths. Confirm no horizontal scrolling, visible focus, usable bottom navigation, lazy product images, clear offline/reconnect states, and a disabled cart action until every ambiguous line is resolved. Do not press the final cart-transfer action during this read-only check.

- [ ] **Step 6: Commit smoke tooling and any exact compatibility alias**

```bash
git add scripts/knuspr-readonly-smoke.js README.md tests/knuspr-adapter.test.js server/knuspr/adapter.js
git commit -m "test: verify Knuspr MCP compatibility"
```

## Final Completion Gate

Before claiming implementation completion:

1. Run `git status --short --branch` and confirm the intended feature branch and a clean worktree.
2. Run `npm test` fresh and report the exact pass/fail totals.
3. Run `git diff main...HEAD --check`.
4. Review `git diff --stat main...HEAD` against the file map and verify there are no unrelated edits.
5. Confirm no tracked runtime file contains `access_token`, `refresh_token`, an email address, or a Knuspr password.
6. Confirm the real cart was not mutated by automated or smoke tests.
7. Invoke `superpowers:finishing-a-development-branch` and offer merge, PR/push, keep, or discard choices.
