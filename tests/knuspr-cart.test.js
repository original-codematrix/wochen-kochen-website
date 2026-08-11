'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyPreview,
  computeCartDelta,
  revalidatePreview,
} = require('../server/knuspr/cart');

function product(id, price = 1.09, available = true) {
  return {
    id,
    name: `${id} product`,
    brand: null,
    url: null,
    imageUrl: null,
    available,
    package: { amount: 1, unit: 'piece', label: '1 Stück' },
    price: { current: price, regular: null, unit: price, unitLabel: '€/Stück', offer: false },
    qualityTags: [],
  };
}

function previewLine(id, productId, quantity = 1, price = 1.09) {
  return {
    id,
    source: 'additional',
    department: 'Getränke',
    demand: { searchTerm: productId, amount: quantity, unit: 'piece', ingredient: productId },
    recipeIds: [],
    ingredientIds: [],
    status: 'selected',
    product: product(productId, price),
    alternatives: [],
    productPackages: quantity,
    cartQuantity: quantity,
    totalAmount: quantity,
    wasteAmount: 0,
    totalPrice: price * quantity,
    reason: null,
    removed: false,
  };
}

function preview(lines, revision = 'preview-1') {
  return {
    generatedAt: '2026-08-11T10:00:00.000Z',
    days: [],
    revision,
    lines,
    estimatedTotal: lines.reduce((sum, line) => sum + line.totalPrice, 0),
    openLineCount: 0,
  };
}

let storeSequence = 0;

function memoryStore(savedPreview, { identity = `cart-test-store:${storeSequence += 1}` } = {}) {
  const files = new Map([['knuspr-preview.json', structuredClone(savedPreview)]]);
  const writes = [];
  return {
    identity,
    writes,
    async read(name, fallback) {
      return files.has(name) ? structuredClone(files.get(name)) : fallback;
    },
    async write(name, value) {
      writes.push({ name, value: structuredClone(value) });
      files.set(name, structuredClone(value));
    },
  };
}

function fakeAdapter({ products, cart = [], add, readCart } = {}) {
  const currentCart = structuredClone(cart);
  const searchCalls = [];
  const addCalls = [];
  let cartReads = 0;
  const adapter = {
    searchCalls,
    addCalls,
    currentCart,
    get cartReads() {
      return cartReads;
    },
    async searchProducts(query) {
      searchCalls.push(query);
      const found = typeof products === 'function' ? products(query) : products?.[query];
      return structuredClone(found || []);
    },
    async getCart() {
      cartReads += 1;
      if (readCart) return readCart({ currentCart, readNumber: cartReads });
      return structuredClone(currentCart);
    },
    async addCartItems(items) {
      const requested = structuredClone(items);
      addCalls.push(requested);
      if (add) return add({ items: requested, currentCart, callNumber: addCalls.length });
      for (const item of requested) {
        const existing = currentCart.find(line => line.productId === item.productId);
        if (existing) existing.quantity += item.quantity;
        else currentCart.push({ productId: item.productId, quantity: item.quantity });
      }
      return { accepted: true };
    },
  };
  return adapter;
}

test('delta adds only missing quantities and never removes existing items', () => {
  assert.deepEqual(
    computeCartDelta(
      [{ id: 'milk-line', product: { id: 'milk' }, cartQuantity: 3 }],
      [{ productId: 'milk', quantity: 2 }],
    ),
    [{ lineId: 'milk-line', productId: 'milk', quantity: 1 }],
  );
  assert.deepEqual(
    computeCartDelta(
      [{ id: 'milk-line', product: { id: 'milk' }, cartQuantity: 1 }],
      [{ productId: 'milk', quantity: 2 }],
    ),
    [],
  );
});

test('delta aggregates duplicate cart lines and allocates their quantity across duplicate preview products', () => {
  const lines = [
    { id: 'milk-a', product: { id: 'milk' }, cartQuantity: 2 },
    { id: 'milk-b', product: { id: 'milk' }, cartQuantity: 2 },
  ];
  const cart = [
    { productId: 'milk', quantity: 1 },
    { productId: 'milk', quantity: 2 },
  ];

  assert.deepEqual(computeCartDelta(lines, cart), [
    { lineId: 'milk-b', productId: 'milk', quantity: 1 },
  ]);
});

test('changed price returns a refreshed preview without reading or mutating the cart', async () => {
  const saved = preview([previewLine('milk-line', 'milk', 2, 1.09)]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({ products: { milk: [product('milk', 1.29)] } });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'reconfirm-required');
  assert.equal(result.preview.lines[0].product.price.current, 1.29);
  assert.equal(result.preview.lines[0].totalPrice, 2.58);
  assert.notEqual(result.preview.revision, saved.revision);
  assert.deepEqual(adapter.searchCalls, ['milk']);
  assert.equal(adapter.cartReads, 0);
  assert.deepEqual(adapter.addCalls, []);
  assert.equal(store.writes.at(-1).name, 'knuspr-preview.json');
});

test('stock change returns a refreshed unavailable line without mutating the cart', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({ products: { milk: [product('milk', 1.09, false)] } });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'reconfirm-required');
  assert.equal(result.preview.lines[0].status, 'missing');
  assert.equal(result.preview.lines[0].product.available, false);
  assert.equal(result.preview.openLineCount, 1);
  assert.equal(adapter.cartReads, 0);
  assert.deepEqual(adapter.addCalls, []);
});

test('corrupt selected preview with matching unavailable live product cannot reach mutation', async () => {
  const line = previewLine('milk-line', 'milk');
  line.product.available = false;
  const saved = preview([line]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({ products: { milk: [product('milk', 1.09, false)] } });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'reconfirm-required');
  assert.equal(result.preview.lines[0].status, 'missing');
  assert.equal(adapter.cartReads, 0);
  assert.deepEqual(adapter.addCalls, []);
});

test('stale revision fails closed before live reads or cart mutation', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({ products: { milk: [product('milk')] } });

  await assert.rejects(
    applyPreview({ previewRevision: 'stale', acceptedLineIds: ['milk-line'], adapter, store }),
    error => error.code === 'KNUSPR_PREVIEW_CONFLICT' && error.statusCode === 409,
  );

  assert.deepEqual(adapter.searchCalls, []);
  assert.equal(adapter.cartReads, 0);
  assert.deepEqual(adapter.addCalls, []);
  assert.deepEqual(store.writes, []);
});

test('partial mutation writes a per-line receipt and retry adds only the still-missing product', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  let breadFailures = 1;
  const adapter = fakeAdapter({
    products: { milk: [product('milk')], bread: [product('bread')] },
    add({ items, currentCart }) {
      const item = items[0];
      if (item.productId === 'bread' && breadFailures > 0) {
        breadFailures -= 1;
        throw Object.assign(new Error('timeout'), { code: 'KNUSPR_TIMEOUT' });
      }
      currentCart.push({ productId: item.productId, quantity: item.quantity });
      return { accepted: true };
    },
  });

  const first = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(first.status, 'partial');
  assert.deepEqual(first.receipt.lines.map(line => ({
    lineId: line.lineId,
    requested: line.requested,
    added: line.added,
    status: line.status,
    errorCode: line.errorCode,
  })), [
    { lineId: 'milk-line', requested: 1, added: 1, status: 'added', errorCode: null },
    { lineId: 'bread-line', requested: 1, added: 0, status: 'failed', errorCode: 'KNUSPR_TIMEOUT' },
  ]);
  assert.equal(store.writes.at(-1).name, 'knuspr-cart-receipt.json');

  const callsBeforeRetry = adapter.addCalls.length;
  const retry = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(retry.status, 'complete');
  assert.deepEqual(
    adapter.addCalls.slice(callsBeforeRetry).flat().map(item => item.productId),
    ['bread'],
  );
  assert.deepEqual(retry.receipt.lines.map(line => line.productId), ['bread']);
  assert.deepEqual(adapter.currentCart, [
    { productId: 'milk', quantity: 1 },
    { productId: 'bread', quantity: 1 },
  ]);
});

test('later search failure preserves prior receipt progress and retry attempts only the failed SKU', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  let breadSearches = 0;
  const adapter = fakeAdapter({
    products(query) {
      if (query === 'bread') {
        breadSearches += 1;
        if (breadSearches === 3) {
          throw Object.assign(new Error('search unavailable'), { code: 'KNUSPR_SEARCH_DOWN' });
        }
      }
      return [product(query)];
    },
  });

  const first = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(first.status, 'partial');
  assert.deepEqual(first.receipt.lines, [
    {
      lineId: 'milk-line', productId: 'milk', requested: 1, added: 1, status: 'added', errorCode: null,
    },
    {
      lineId: 'bread-line', productId: 'bread', requested: 1, added: 0, status: 'failed', errorCode: 'KNUSPR_SEARCH_DOWN',
    },
  ]);
  const firstReceiptWrites = store.writes.filter(write => write.name === 'knuspr-cart-receipt.json');
  assert.equal(firstReceiptWrites.length, 2);
  assert.deepEqual(firstReceiptWrites[0].value.lines.map(line => line.productId), ['milk']);
  assert.deepEqual(firstReceiptWrites[1].value, first.receipt);
  assert.deepEqual(await store.read('knuspr-cart-receipt.json', null), first.receipt);

  const callsBeforeRetry = adapter.addCalls.length;
  const retry = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(retry.status, 'complete');
  assert.deepEqual(adapter.addCalls.slice(callsBeforeRetry).flat().map(item => item.productId), ['bread']);
  assert.deepEqual(adapter.currentCart, [
    { productId: 'milk', quantity: 1 },
    { productId: 'bread', quantity: 1 },
  ]);
});

test('later pre-mutation cart failure preserves the reconciled first line as partial', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')], bread: [product('bread')] },
    readCart({ currentCart, readNumber }) {
      if (readNumber === 4) {
        throw Object.assign(new Error('cart unavailable'), { code: 'KNUSPR_CART_READ_DOWN' });
      }
      return structuredClone(currentCart);
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'partial');
  assert.deepEqual(result.receipt.lines, [
    {
      lineId: 'milk-line', productId: 'milk', requested: 1, added: 1, status: 'added', errorCode: null,
    },
    {
      lineId: 'bread-line', productId: 'bread', requested: 1, added: 0, status: 'failed', errorCode: 'KNUSPR_CART_READ_DOWN',
    },
  ]);
  const receiptWrites = store.writes.filter(write => write.name === 'knuspr-cart-receipt.json');
  assert.equal(receiptWrites.length, 2);
  assert.deepEqual(receiptWrites[0].value.lines.map(line => line.productId), ['milk']);
  assert.deepEqual(receiptWrites[1].value, result.receipt);
});

test('first-line pre-mutation cart failure rejects without fabricating a receipt', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')] },
    readCart({ currentCart, readNumber }) {
      if (readNumber === 2) {
        throw Object.assign(new Error('cart unavailable'), { code: 'KNUSPR_CART_READ_DOWN' });
      }
      return structuredClone(currentCart);
    },
  });

  await assert.rejects(
    applyPreview({
      previewRevision: saved.revision,
      acceptedLineIds: ['milk-line'],
      adapter,
      store,
    }),
    error => error.code === 'KNUSPR_CART_READ_DOWN',
  );
  assert.deepEqual(store.writes.filter(write => write.name === 'knuspr-cart-receipt.json'), []);
  assert.deepEqual(adapter.addCalls, []);
});

test('later product change persists prior success and an explicit failed current line', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  let breadSearches = 0;
  const adapter = fakeAdapter({
    products(query) {
      if (query === 'bread') breadSearches += 1;
      return [product(query, 1.09, query !== 'bread' || breadSearches < 3)];
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'partial');
  assert.notEqual(result.preview.revision, saved.revision);
  assert.equal(result.preview.lines.find(line => line.id === 'bread-line').status, 'missing');
  assert.deepEqual(adapter.addCalls.flat().map(item => item.productId), ['milk']);
  assert.deepEqual(result.receipt.lines, [
    {
      lineId: 'milk-line', productId: 'milk', requested: 1, added: 1, status: 'added', errorCode: null,
    },
    {
      lineId: 'bread-line', productId: 'bread', requested: 1, added: 0, status: 'failed', errorCode: 'KNUSPR_RECONFIRM_REQUIRED',
    },
  ]);
  assert.deepEqual(await store.read('knuspr-cart-receipt.json', null), result.receipt);
});

test('each later line rereads the cart and skips a quantity another client already added', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')], bread: [product('bread')] },
    add({ items, currentCart }) {
      const item = items[0];
      currentCart.push({ productId: item.productId, quantity: item.quantity });
      if (item.productId === 'milk') currentCart.push({ productId: 'bread', quantity: 1 });
      return { accepted: true };
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(adapter.addCalls.flat().map(item => item.productId), ['milk']);
  assert.deepEqual(adapter.currentCart, [
    { productId: 'milk', quantity: 1 },
    { productId: 'bread', quantity: 1 },
  ]);
  assert.deepEqual(result.receipt.lines.map(line => line.productId), ['milk']);
});

test('selected product is searched again at the inner mutation gate', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  let searches = 0;
  const adapter = fakeAdapter({
    products() {
      searches += 1;
      return [product('milk', 1.09, searches === 1)];
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'reconfirm-required');
  assert.equal(searches, 2);
  assert.equal(adapter.cartReads, 1);
  assert.deepEqual(adapter.addCalls, []);
});

test('revision changed during the final cart read prevents the pending add', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')] },
    async readCart({ currentCart, readNumber }) {
      if (readNumber === 2) {
        await store.write('knuspr-preview.json', { ...saved, revision: 'R2' });
      }
      return structuredClone(currentCart);
    },
  });

  await assert.rejects(
    applyPreview({
      previewRevision: saved.revision,
      acceptedLineIds: ['milk-line'],
      adapter,
      store,
    }),
    error => error.code === 'KNUSPR_PREVIEW_CONFLICT',
  );

  assert.deepEqual(adapter.addCalls, []);
});

test('timeout after a committed add is reconciled from a fresh cart and never blindly retried', async () => {
  const saved = preview([previewLine('milk-line', 'milk', 2)]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')] },
    add({ items, currentCart }) {
      currentCart.push({ productId: 'milk', quantity: items[0].quantity });
      throw Object.assign(new Error('response lost'), { code: 'KNUSPR_TIMEOUT' });
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'complete');
  assert.equal(adapter.cartReads, 3);
  assert.equal(adapter.addCalls.length, 1);
  assert.deepEqual(result.receipt.lines.map(line => ({
    requested: line.requested,
    added: line.added,
    status: line.status,
    errorCode: line.errorCode,
  })), [
    { requested: 2, added: 2, status: 'added', errorCode: 'KNUSPR_TIMEOUT' },
  ]);
});

test('resolved add responses are failed unless a fresh cart confirms the increase', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')] },
    add() {
      return { accepted: false };
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'partial');
  assert.equal(adapter.cartReads, 3);
  assert.deepEqual(result.receipt.lines, [{
    lineId: 'milk-line',
    productId: 'milk',
    requested: 1,
    added: 0,
    status: 'failed',
    errorCode: 'KNUSPR_CART_ADD_REJECTED',
  }]);
});

test('failed post-mutation cart read records an uncertain quantity and stops later adds', async () => {
  const saved = preview([
    previewLine('milk-line', 'milk'),
    previewLine('bread-line', 'bread'),
  ]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')], bread: [product('bread')] },
    readCart({ currentCart, readNumber }) {
      if (readNumber === 3) throw Object.assign(new Error('cart unavailable'), { code: 'KNUSPR_TIMEOUT' });
      return structuredClone(currentCart);
    },
  });

  const result = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line', 'bread-line'],
    adapter,
    store,
  });

  assert.equal(result.status, 'partial');
  assert.deepEqual(adapter.addCalls.flat().map(item => item.productId), ['milk']);
  assert.deepEqual(result.receipt.lines, [{
    lineId: 'milk-line',
    productId: 'milk',
    requested: 1,
    added: null,
    status: 'uncertain',
    errorCode: 'KNUSPR_CART_STATE_UNCERTAIN',
  }]);
});

test('unchanged previews are freshly searched on every apply and write an empty complete receipt when already covered', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const store = memoryStore(saved);
  const adapter = fakeAdapter({
    products: { milk: [product('milk')] },
    cart: [{ productId: 'milk', quantity: 1 }],
  });

  const first = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });
  const second = await applyPreview({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  assert.equal(first.status, 'complete');
  assert.equal(second.status, 'complete');
  assert.deepEqual(first.receipt.lines, []);
  assert.deepEqual(adapter.searchCalls, ['milk', 'milk']);
  assert.equal(adapter.cartReads, 2);
  assert.deepEqual(adapter.addCalls, []);
});

test('overlapping store wrappers with the same identity do not add the same quantity twice', async () => {
  const saved = preview([previewLine('milk-line', 'milk')]);
  const firstStore = memoryStore(saved, { identity: 'cart-test-store:shared' });
  const secondStore = {
    identity: firstStore.identity,
    read: firstStore.read,
    write: firstStore.write,
  };
  const adapter = fakeAdapter({ products: { milk: [product('milk')] } });
  const input = store => ({
    previewRevision: saved.revision,
    acceptedLineIds: ['milk-line'],
    adapter,
    store,
  });

  const results = await Promise.all([applyPreview(input(firstStore)), applyPreview(input(secondStore))]);

  assert.deepEqual(results.map(result => result.status), ['complete', 'complete']);
  assert.equal(adapter.addCalls.length, 1);
  assert.deepEqual(adapter.currentCart, [{ productId: 'milk', quantity: 1 }]);
  assert.deepEqual(results.map(result => result.receipt.lines.length), [1, 0]);
});

test('revalidation deduplicates fresh searches while preserving unchanged preview identity', async () => {
  const saved = preview([
    previewLine('milk-a', 'milk'),
    previewLine('milk-b', 'milk'),
  ]);
  const adapter = fakeAdapter({ products: { milk: [product('milk')] } });

  const result = await revalidatePreview(saved, adapter);

  assert.equal(result.changed, false);
  assert.deepEqual(result.preview, saved);
  assert.deepEqual(adapter.searchCalls, ['milk']);
});
