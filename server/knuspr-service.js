'use strict';

const path = require('node:path');

const { createKnusprAdapter } = require('./knuspr/adapter');
const { createKnusprClient, DEFAULT_ENDPOINT } = require('./knuspr/client');
const { validateAdditionalItems, validatePreview } = require('./knuspr/contracts');
const { chooseProduct } = require('./knuspr/product-selection');
const { storeIdentity, withRuntimeLock } = require('./knuspr/runtime-lock');
const { createKnusprStore } = require('./knuspr/store');
const {
  buildIngredientDemands,
  buildKnusprPlan,
  isVegetarianRecipe,
  knusprRecipeAllowed,
} = require('./planner');

const CACHE_TTL_MS = 10 * 60 * 1000;

async function mapConcurrent(values, limit, mapper) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index], index);
    }
  }
  const workerCount = Math.min(Math.max(1, Number(limit) || 1), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return result;
}

function createLimiter(limit) {
  const maximum = Math.max(1, Math.min(4, Math.floor(Number(limit) || 1)));
  const waiting = [];
  let active = 0;

  function drain() {
    while (active < maximum && waiting.length > 0) {
      const { task, resolve, reject } = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  return function limitTask(task) {
    return new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      drain();
    });
  };
}

function rotate(values, variation) {
  if (!values.length) return [];
  const offset = Math.abs(Number(variation) || 0) % values.length;
  return values.slice(offset).concat(values.slice(0, offset));
}

function shortlistRecipes(recipes, exclusions, variation, limit = 14) {
  const eligible = (Array.isArray(recipes) ? recipes : [])
    .filter(recipe => knusprRecipeAllowed(recipe, exclusions))
    .sort((left, right) => (
      (Number(right.rating) || 0) - (Number(left.rating) || 0)
      || (Number(left.cost) || 0) - (Number(right.cost) || 0)
      || left.id.localeCompare(right.id)
    ));
  const ordered = rotate(eligible, variation);
  const target = Math.min(limit, ordered.length);
  const selected = [];
  const add = (recipe, requireNewCategory = false) => {
    if (!recipe || selected.some(item => item.id === recipe.id)) return false;
    if (requireNewCategory && selected.some(item => item.cat === recipe.cat)) return false;
    selected.push(recipe);
    return true;
  };
  const desiredVegetarian = Math.min(Math.ceil(target / 2), ordered.filter(isVegetarianRecipe).length);
  for (const recipe of ordered.filter(isVegetarianRecipe)) {
    if (selected.filter(isVegetarianRecipe).length >= desiredVegetarian) break;
    add(recipe, true);
  }
  for (const recipe of ordered.filter(isVegetarianRecipe)) {
    if (selected.filter(isVegetarianRecipe).length >= desiredVegetarian) break;
    add(recipe);
  }
  for (const recipe of ordered) {
    if (selected.length >= target) break;
    add(recipe, true);
  }
  for (const recipe of ordered) {
    if (selected.length >= target) break;
    add(recipe);
  }
  return selected;
}

function uniqueQueries(demands, additionalItems) {
  return [...new Set([
    ...demands.map(demand => demand.searchTerm),
    ...additionalItems.filter(item => item.enabled !== false).map(item => item.searchTerm),
  ])];
}

function nowDate(now) {
  const value = new Date(now());
  if (Number.isNaN(value.getTime())) throw new Error('Planungszeitpunkt ist ungültig');
  return value;
}

function planValid(plan) {
  const recipeIds = Array.isArray(plan && plan.days)
    ? plan.days.map(day => String(day && day.recipeId || '').trim())
    : [];
  return Boolean(
    plan
    && plan.schemaVersion === 5
    && typeof plan.generatedAt === 'string'
    && typeof plan.planRevision === 'string'
    && recipeIds.length === 7
    && recipeIds.every(Boolean)
    && new Set(recipeIds).size === 7
    && Array.isArray(plan.excludedIngredients)
    && plan.mealPrep
    && plan.shoppingPreview,
  );
}

function createAdditionalChoice(item, products) {
  const available = products.filter(product => product && product.available === true && Number.isFinite(product.price && product.price.current));
  const selected = available.find(product => product.id === item.pinnedProductId) || available[0] || null;
  const quantity = Number(item.quantity);
  return {
    selected,
    alternatives: available.filter(product => !selected || product.id !== selected.id),
    packages: selected ? quantity : null,
    totalAmount: null,
    wasteAmount: null,
    totalPrice: selected ? Math.round(selected.price.current * quantity * 100) / 100 : null,
    reason: selected
      ? item.pinnedProductId === selected.id ? 'Festgepinntes Produkt' : 'Verfügbares Produkt für die Zusatzliste'
      : 'Kein passendes lieferbares Produkt',
    status: selected ? 'selected' : 'missing',
  };
}

function createKnusprService({ adapter, store, recipes, now = () => new Date(), concurrency = 4 }) {
  if (!adapter || typeof adapter.searchProducts !== 'function') throw new Error('Knuspr-Adapter fehlt');
  if (
    !store
    || typeof store.read !== 'function'
    || typeof store.write !== 'function'
    || typeof store.remove !== 'function'
  ) throw new Error('Knuspr-Speicher mit read, write und remove fehlt');
  storeIdentity(store);
  if (!Array.isArray(recipes)) throw new Error('Rezeptkatalog fehlt');
  const maximumConcurrency = Math.max(1, Math.min(4, Math.floor(Number(concurrency) || 1)));
  const limitSearch = createLimiter(maximumConcurrency);
  let cachePromise;
  let cacheWrite = Promise.resolve();
  let generationQueue = Promise.resolve();

  async function loadCache() {
    if (!cachePromise) {
      cachePromise = store.read('knuspr-product-cache.json', { entries: {} }).then(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !value.entries || typeof value.entries !== 'object') {
          return { entries: {} };
        }
        return value;
      });
    }
    return cachePromise;
  }

  async function cachedSearch(query, requestedAt) {
    const cache = await loadCache();
    const entry = cache.entries[query];
    if (
      entry
      && typeof entry.cachedAt === 'string'
      && requestedAt.getTime() - new Date(entry.cachedAt).getTime() < CACHE_TTL_MS
      && Array.isArray(entry.products)
    ) {
      return entry.products;
    }
    const products = await adapter.searchProducts(query);
    if (!Array.isArray(products)) throw new Error(`Knuspr-Produktsuche für ${query} ist ungültig`);
    cache.entries[query] = { cachedAt: requestedAt.toISOString(), products };
    const snapshot = structuredClone(cache);
    cacheWrite = cacheWrite.catch(() => {}).then(() => store.write('knuspr-product-cache.json', snapshot));
    await cacheWrite;
    return products;
  }

  async function getAdditionalItems() {
    const saved = await store.read('knuspr-additional-items.json', []);
    return validateAdditionalItems(saved);
  }

  async function saveAdditionalItems(items) {
    const validated = validateAdditionalItems(items);
    await store.write('knuspr-additional-items.json', validated);
    return validated;
  }

  async function persistPlanTransaction(plan) {
    if (!planValid(plan)) throw new Error('Knuspr-Plan ist ungültig');
    const preview = validatePreview(plan.shoppingPreview);
    if (!Array.isArray(preview.lines)) throw new Error('Knuspr-Vorschau ist ungültig');
    const previousPlan = await store.read('current-plan.json', null);
    const previousPreview = await store.read('knuspr-preview.json', null);
    try {
      await store.write('knuspr-preview.json', preview);
      await store.write('current-plan.json', plan);
    } catch (error) {
      for (const [name, previous] of [
        ['knuspr-preview.json', previousPreview],
        ['current-plan.json', previousPlan],
      ]) {
        try {
          if (previous === null) await store.remove(name);
          else await store.write(name, previous);
        } catch {
          // Preserve the original generation error after attempting every rollback action.
        }
      }
      throw error;
    }
  }

  function persistPlan(plan) {
    return withRuntimeLock(store, () => persistPlanTransaction(plan));
  }

  async function generatePlanTransaction(input = {}) {
    const requestedAt = nowDate(now);
    const exclusions = input.excludedIngredients || [];
    const variation = Number(input.variation) || 0;
    const shortlist = shortlistRecipes(recipes, exclusions, variation, 14);
    if (shortlist.length < 7) {
      throw new Error('Für den Knuspr-Wochenplan werden sieben unterschiedliche Gerichte benötigt');
    }
    const demands = buildIngredientDemands(shortlist, { servings: 2 });
    const additionalItems = await getAdditionalItems();
    const queries = uniqueQueries(demands, additionalItems);
    const searchResults = await Promise.all(queries.map(query => (
      limitSearch(() => cachedSearch(query, requestedAt))
    )));
    const productsByQuery = new Map(queries.map((query, index) => [query, searchResults[index]]));
    const productChoices = demands.map(demand => {
      const products = productsByQuery.get(demand.searchTerm) || [];
      const preferences = input.pinnedProducts && input.pinnedProducts[demand.searchTerm]
        ? { pinnedProductId: input.pinnedProducts[demand.searchTerm] }
        : {};
      return { demand, products, preferences, ...chooseProduct(demand, products, preferences) };
    });
    const enrichedAdditionalItems = additionalItems.map(item => ({
      ...item,
      choice: createAdditionalChoice(item, productsByQuery.get(item.searchTerm) || []),
    }));
    const plan = buildKnusprPlan({
      recipes: shortlist,
      productChoices,
      additionalItems: enrichedAdditionalItems,
      exclusions,
      variation,
      now: requestedAt,
    });
    await persistPlan(plan);
    return plan;
  }

  function enqueueGeneration(operation) {
    const result = generationQueue.then(operation, operation);
    generationQueue = result.catch(() => {});
    return result;
  }

  function generatePlan(input = {}) {
    return enqueueGeneration(() => generatePlanTransaction(input));
  }

  function regeneratePlan(input = {}) {
    return enqueueGeneration(async () => {
      const current = await getPlan();
      return generatePlanTransaction({
        ...input,
        excludedIngredients: input.excludedIngredients || (current && current.excludedIngredients) || [],
        variation: input.variation === undefined ? ((current && current.variation) || 0) + 1 : input.variation,
      });
    });
  }

  async function getPlan() {
    const plan = await store.read('current-plan.json', null);
    return planValid(plan) ? plan : null;
  }

  async function getPreview() {
    const preview = await store.read('knuspr-preview.json', null);
    return preview === null ? null : validatePreview(preview);
  }

  async function updatePreviewLineTransaction(input = {}) {
    const preview = validatePreview(await store.read('knuspr-preview.json', null));
    if (!Array.isArray(preview.lines)) throw new Error('Knuspr-Vorschau ist ungültig');
    const lineIndex = preview.lines.findIndex(line => line.id === input.lineId);
    if (lineIndex < 0) throw new Error('Vorschauposition nicht gefunden');
    const changes = input.changes && typeof input.changes === 'object' ? input.changes : input;
    const line = { ...preview.lines[lineIndex] };
    if ('removed' in changes) line.removed = Boolean(changes.removed);
    if ('product' in changes) {
      if (changes.product !== null && (!changes.product || !String(changes.product.id || '').trim())) {
        throw new Error('Produktalternative ist ungültig');
      }
      line.product = changes.product;
      line.status = changes.product ? 'selected' : 'missing';
    }
    if ('productId' in changes) {
      const candidate = [line.product, ...(line.alternatives || [])]
        .find(product => product && product.id === changes.productId);
      if (!candidate) throw new Error('Produktalternative ist nicht verfügbar');
      line.product = candidate;
      line.status = 'selected';
    }
    if ('productPackages' in changes || 'cartQuantity' in changes || 'quantity' in changes) {
      const quantity = Number(changes.productPackages ?? changes.cartQuantity ?? changes.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) throw new Error('Packungsmenge ist ungültig');
      line.productPackages = quantity;
      line.cartQuantity = quantity;
    }
    if (line.product && Number.isFinite(line.product.price && line.product.price.current) && Number.isInteger(line.cartQuantity)) {
      line.totalPrice = Math.round(line.product.price.current * line.cartQuantity * 100) / 100;
    }
    const lines = preview.lines.slice();
    lines[lineIndex] = line;
    const generatedAt = nowDate(now).toISOString();
    const revision = require('node:crypto').createHash('sha256')
      .update(JSON.stringify([preview.revision, generatedAt, lines]))
      .digest('hex')
      .slice(0, 20);
    const updated = {
      ...preview,
      generatedAt,
      revision,
      lines,
      estimatedTotal: Math.round(lines.filter(item => !item.removed).reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0) * 100) / 100,
      openLineCount: lines.filter(item => !item.removed && item.status !== 'selected').length,
    };
    await store.write('knuspr-preview.json', validatePreview(updated));
    return updated;
  }

  function updatePreviewLine(input = {}) {
    return withRuntimeLock(store, () => updatePreviewLineTransaction(input));
  }

  return {
    generatePlan,
    regeneratePlan,
    getPlan,
    getPreview,
    updatePreviewLine,
    getAdditionalItems,
    saveAdditionalItems,
  };
}

function createRuntime(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'runtime-data');
  const appOrigin = options.appOrigin || process.env.APP_ORIGIN || 'http://localhost:8080';
  const store = options.store || createKnusprStore({ dataDir });
  const client = options.client || createKnusprClient({
    store,
    redirectUrl: options.redirectUrl || `${appOrigin.replace(/\/$/, '')}/api/knuspr/callback`,
    endpoint: options.endpoint || process.env.KNUSPR_MCP_URL || DEFAULT_ENDPOINT,
    sdkLoader: options.sdkLoader,
  });
  const adapter = options.adapter || createKnusprAdapter({ client });
  const catalog = options.recipes || require('../data').recipes;
  const service = createKnusprService({
    adapter,
    store,
    recipes: catalog,
    now: options.now,
    concurrency: options.concurrency,
  });
  return { store, client, adapter, service };
}

module.exports = { CACHE_TTL_MS, mapConcurrent, createKnusprService, createRuntime };
