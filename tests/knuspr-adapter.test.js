const assert = require('node:assert/strict');
const test = require('node:test');

const { createKnusprAdapter, validateSchemaValue } = require('../server/knuspr/adapter');
const { runReadonlySmoke } = require('../scripts/knuspr-readonly-smoke');

function tool(name, description, inputSchema = { type: 'object', properties: {} }) {
  return { name, description, inputSchema };
}

function fakeClient(tools, responses = {}) {
  const calls = [];
  return {
    calls,
    async listTools() {
      return { tools };
    },
    async callTool(name, args) {
      calls.push({ name, args });
      const response = responses[name];
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const searchTool = tool('catalog_product_search', 'Search available products', {
  type: 'object',
  properties: { searchTerm: { type: 'string' } },
});

const cartTool = tool('cart_get', 'Read the current shopping cart');

const addTool = tool('cart_add_items', 'Add product quantities to cart', {
  type: 'object',
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: { product_id: { type: 'string' }, amount: { type: 'number' } },
      },
    },
  },
});

const rawProduct = {
  product_id: 'potato-1',
  title: 'Bio Kartoffeln',
  brand: 'Hof Sonnenberg',
  url: 'https://example.test/potato-1',
  image_url: 'https://example.test/potato-1.jpg',
  availability: 'in_stock',
  package: { amount: 1.5, unit: 'kg', label: '1,5 kg' },
  price: { current: 2.49, regular: 2.99, unit: 1.66, unit_label: '€/kg', offer: true },
  quality_tags: ['bio', 'regional'],
};

test('adapter resolves product search and cart capabilities from tool metadata', async () => {
  const adapter = createKnusprAdapter({ client: fakeClient([searchTool, cartTool, addTool]) });

  assert.deepEqual(await adapter.capabilities(), { searchProducts: true, readCart: true, addCartItems: true });
});

test('ambiguous capability discovery fails closed', async () => {
  const adapter = createKnusprAdapter({
    client: fakeClient([
      tool('search_a', 'Search products', { type: 'object', properties: { query: { type: 'string' } } }),
      tool('search_b', 'Search products', { type: 'object', properties: { query: { type: 'string' } } }),
    ]),
  });

  await assert.rejects(adapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
});

test('search maps only a declared semantic query field and normalizes structured products', async () => {
  const client = fakeClient([searchTool, cartTool, addTool], {
    catalog_product_search: { structuredContent: { products: [rawProduct] } },
  });
  const adapter = createKnusprAdapter({ client });

  assert.deepEqual(await adapter.searchProducts('Kartoffeln'), [{
    id: 'potato-1',
    name: 'Bio Kartoffeln',
    brand: 'Hof Sonnenberg',
    url: 'https://example.test/potato-1',
    imageUrl: 'https://example.test/potato-1.jpg',
    available: true,
    package: { amount: 1.5, unit: 'kg', label: '1,5 kg' },
    price: { current: 2.49, regular: 2.99, unit: 1.66, unitLabel: '€/kg', offer: true },
    qualityTags: ['bio', 'regional'],
  }]);
  assert.deepEqual(client.calls, [{ name: 'catalog_product_search', args: { searchTerm: 'Kartoffeln' } }]);
});

test('search reads a complete JSON text response without accepting surrounding prose', async () => {
  const client = fakeClient([searchTool], {
    catalog_product_search: { content: [{ type: 'text', text: JSON.stringify({ results: [rawProduct] }) }] },
  });
  const adapter = createKnusprAdapter({ client });

  assert.equal((await adapter.searchProducts('Kartoffeln'))[0].id, 'potato-1');
});

test('search rejects unknown argument schemas before calling a tool', async () => {
  const client = fakeClient([
    tool('catalog_product_search', 'Search available products', { type: 'object', properties: { filter: { type: 'string' } } }),
  ]);
  const adapter = createKnusprAdapter({ client });

  await assert.rejects(adapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  assert.deepEqual(client.calls, []);
});

test('capabilities report false and avoid calls when declared schemas cannot support the operation', async () => {
  const incompatibleSearch = tool('catalog_product_search', 'Search available products', {
    type: 'object',
    properties: { query: { type: 'number' } },
  });
  const cartWithRequiredInput = tool('cart_get', 'Read the current shopping cart', {
    type: 'object',
    properties: { cartId: { type: 'string' } },
    required: ['cartId'],
  });
  const client = fakeClient([incompatibleSearch, cartWithRequiredInput]);
  const adapter = createKnusprAdapter({ client });

  assert.deepEqual(await adapter.capabilities(), { searchProducts: false, readCart: false, addCartItems: false });
  await assert.rejects(adapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  await assert.rejects(adapter.getCart(), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  assert.deepEqual(client.calls, []);
});

test('cart mutations reject incompatible item schema types and required unmapped inputs', async () => {
  const client = fakeClient([
    tool('cart_add_items', 'Add product quantities to cart', {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'number' },
              quantity: { type: 'string' },
              warehouse: { type: 'string' },
            },
            required: ['productId', 'quantity', 'warehouse'],
          },
        },
      },
    }),
  ]);
  const adapter = createKnusprAdapter({ client });

  assert.deepEqual(await adapter.capabilities(), { searchProducts: false, readCart: false, addCartItems: false });
  await assert.rejects(adapter.addCartItems([{ productId: 'potato-1', quantity: 2 }]), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  assert.deepEqual(client.calls, []);
});

test('cart mutations reject declared quantity and collection bounds before calling a tool', async () => {
  const itemSchema = {
    type: 'object',
    properties: { productId: { type: 'string' }, quantity: { type: 'number', minimum: 10 } },
  };
  const quantityClient = fakeClient([tool('cart_add_items', 'Add product quantities to cart', {
    type: 'object',
    properties: { items: { type: 'array', items: itemSchema } },
  })]);
  const quantityAdapter = createKnusprAdapter({ client: quantityClient });

  await assert.rejects(quantityAdapter.addCartItems([{ productId: 'potato-1', quantity: 1 }]), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
  assert.deepEqual(quantityClient.calls, []);

  const countClient = fakeClient([tool('cart_add_items', 'Add product quantities to cart', {
    type: 'object',
    properties: { items: { type: 'array', minItems: 2, maxItems: 3, items: { ...itemSchema, properties: { productId: { type: 'string' }, quantity: { type: 'number' } } } } },
  })]);
  const countAdapter = createKnusprAdapter({ client: countClient });

  await assert.rejects(countAdapter.addCartItems([{ productId: 'potato-1', quantity: 2 }]), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
  assert.deepEqual(countClient.calls, []);
});

test('search validates declared string constraints before calling a tool', async () => {
  const cases = [
    [{ type: 'string', minLength: 5 }, 'Bio'],
    [{ type: 'string', maxLength: 3 }, 'Bio Kartoffeln'],
    [{ type: 'string', pattern: '^Bio ' }, 'Kartoffeln'],
    [{ type: 'string', enum: ['Bio Kartoffeln'] }, 'Kartoffeln'],
    [{ type: 'string', const: 'Bio Kartoffeln' }, 'Kartoffeln'],
  ];

  for (const [querySchema, query] of cases) {
    const client = fakeClient([tool('catalog_product_search', 'Search available products', {
      type: 'object',
      properties: { query: querySchema },
    })]);
    const adapter = createKnusprAdapter({ client });
    await assert.rejects(adapter.searchProducts(query), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
    assert.deepEqual(client.calls, []);
  }
});

test('cart mutations validate maximum, exclusive bounds, and multipleOf before calling a tool', async () => {
  const cases = [
    [{ maximum: 2 }, 3],
    [{ exclusiveMinimum: 1 }, 1],
    [{ exclusiveMaximum: 3 }, 3],
    [{ multipleOf: 2 }, 3],
  ];

  for (const [constraint, quantity] of cases) {
    const client = fakeClient([tool('cart_add_items', 'Add product quantities to cart', {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { productId: { type: 'string' }, quantity: { type: 'number', ...constraint } },
          },
        },
      },
    })]);
    const adapter = createKnusprAdapter({ client });
    await assert.rejects(adapter.addCartItems([{ productId: 'potato-1', quantity }]), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
    assert.deepEqual(client.calls, []);
  }
});

test('unsupported schema combinators and blank tool names are unavailable without client calls', async () => {
  const combinatorClient = fakeClient([tool('catalog_product_search', 'Search available products', {
    type: 'object',
    properties: { query: { type: 'string', oneOf: [{ minLength: 3 }] } },
  })]);
  const combinatorAdapter = createKnusprAdapter({ client: combinatorClient });

  assert.deepEqual(await combinatorAdapter.capabilities(), { searchProducts: false, readCart: false, addCartItems: false });
  await assert.rejects(combinatorAdapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  assert.deepEqual(combinatorClient.calls, []);

  const blankNameClient = fakeClient([tool('   ', 'Search available products', {
    type: 'object',
    properties: { query: { type: 'string' } },
  })]);
  const blankNameAdapter = createKnusprAdapter({ client: blankNameClient });

  assert.deepEqual(await blankNameAdapter.capabilities(), { searchProducts: false, readCart: false, addCartItems: false });
  await assert.rejects(blankNameAdapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_TOOLSET_UNSUPPORTED');
  assert.deepEqual(blankNameClient.calls, []);
});

test('additionalProperties false accepts exact mapped search and cart payloads', async () => {
  const strictSearch = tool('catalog_product_search', 'Search available products', {
    type: 'object',
    properties: { query: { type: 'string' } },
    additionalProperties: false,
  });
  const strictCart = tool('cart_get', 'Read the current shopping cart', {
    type: 'object',
    properties: {},
    additionalProperties: false,
  });
  const client = fakeClient([strictSearch, strictCart], {
    catalog_product_search: { structuredContent: { products: [rawProduct] } },
    cart_get: { structuredContent: { lines: [{ product_id: 'potato-1', title: 'Bio Kartoffeln', quantity: 2, unit_price: 2.49, total_price: 4.98 }] } },
  });
  const adapter = createKnusprAdapter({ client });

  assert.equal((await adapter.searchProducts('Kartoffeln'))[0].id, 'potato-1');
  assert.equal((await adapter.getCart())[0].productId, 'potato-1');
  assert.deepEqual(client.calls, [
    { name: 'catalog_product_search', args: { query: 'Kartoffeln' } },
    { name: 'cart_get', args: {} },
  ]);
});

test('additionalProperties false rejects undeclared payload keys before a client call', () => {
  const schema = {
    type: 'object',
    properties: { query: { type: 'string' } },
    additionalProperties: false,
  };

  assert.throws(
    () => validateSchemaValue({ query: 'Kartoffeln', unexpected: 'no' }, schema, 'Suchargument'),
    (error) => error.code === 'KNUSPR_RESPONSE_INVALID',
  );
});

test('schema-valued additionalProperties validates every undeclared payload key', () => {
  const schema = {
    type: 'object',
    properties: { query: { type: 'string' } },
    additionalProperties: { type: 'string', minLength: 2 },
  };

  assert.doesNotThrow(() => validateSchemaValue({ query: 'Kartoffeln', locale: 'de' }, schema, 'Suchargument'));
  assert.throws(
    () => validateSchemaValue({ query: 'Kartoffeln', locale: 'd' }, schema, 'Suchargument'),
    (error) => error.code === 'KNUSPR_RESPONSE_INVALID',
  );
  assert.doesNotThrow(() => validateSchemaValue({ query: 'Kartoffeln', page: 1 }, {
    type: 'object',
    properties: { query: { type: 'string' } },
    additionalProperties: true,
  }, 'Suchargument'));
});

test('search rejects products that lack a stable id, a valid current price, or known availability', async () => {
  const malformedProducts = [
    { ...rawProduct, product_id: '' },
    { ...rawProduct, price: { ...rawProduct.price, current: -1 } },
    { ...rawProduct, availability: 'maybe' },
  ];

  for (const product of malformedProducts) {
    const adapter = createKnusprAdapter({
      client: fakeClient([searchTool], { catalog_product_search: { structuredContent: { products: [product] } } }),
    });
    await assert.rejects(adapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
  }
});

test('cart reads and normalizes text response lines', async () => {
  const client = fakeClient([cartTool], {
    cart_get: {
      content: [{
        type: 'text',
        text: JSON.stringify({ cart: { lines: [{ product_id: 'potato-1', title: 'Bio Kartoffeln', quantity: 2, unit_price: 2.49, total_price: 4.98 }] } }),
      }],
    },
  });
  const adapter = createKnusprAdapter({ client });

  assert.deepEqual(await adapter.getCart(), [{ productId: 'potato-1', name: 'Bio Kartoffeln', quantity: 2, unitPrice: 2.49, totalPrice: 4.98 }]);
  assert.deepEqual(client.calls, [{ name: 'cart_get', args: {} }]);
});

test('adding cart items validates the requested lines and maps only declared item fields', async () => {
  const client = fakeClient([addTool], { cart_add_items: { structuredContent: { accepted: true } } });
  const adapter = createKnusprAdapter({ client });

  assert.deepEqual(await adapter.addCartItems([{ productId: 'potato-1', quantity: 2 }]), { accepted: true });
  assert.deepEqual(client.calls, [{
    name: 'cart_add_items',
    args: { lineItems: [{ product_id: 'potato-1', amount: 2 }] },
  }]);
  await assert.rejects(adapter.addCartItems([{ productId: 'potato-1', quantity: 0 }]), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
});

test('adapter rejects malformed JSON text instead of fabricating a response', async () => {
  const adapter = createKnusprAdapter({
    client: fakeClient([searchTool], {
      catalog_product_search: { content: [{ type: 'text', text: 'Products: []' }] },
    }),
  });

  await assert.rejects(adapter.searchProducts('Kartoffeln'), (error) => error.code === 'KNUSPR_RESPONSE_INVALID');
});

function fakeReadonlySmokeAdapter(calls, capabilities) {
  return {
    async capabilities() {
      calls.push('capabilities');
      return capabilities;
    },
    async searchProducts(query) {
      calls.push('searchProducts');
      assert.equal(query, 'Kartoffeln');
      return [
        { id: 'potato-1', name: 'Bio Kartoffeln', available: true, price: { current: 2.49 } },
        { id: 'potato-2', name: 'Frühkartoffeln', available: false, price: { current: 1.99 } },
      ];
    },
    async getCart() {
      calls.push('getCart');
      throw new Error('read-only smoke must never call getCart');
    },
    async addCartItems() {
      calls.push('addCartItems');
      throw new Error('read-only smoke must never call addCartItems');
    },
  };
}

test('read-only smoke script reports capabilities and a harmless search without touching the cart', async () => {
  const calls = [];
  const fakeAdapter = fakeReadonlySmokeAdapter(calls, { searchProducts: true, readCart: true, addCartItems: true });
  let written = null;

  await runReadonlySmoke({ adapter: fakeAdapter, write: (value) => { written = value; } });

  assert.deepEqual(calls, ['capabilities', 'searchProducts']);
  assert.ok(!calls.includes('getCart'), 'must not call getCart');
  assert.ok(!calls.includes('addCartItems'), 'must not call addCartItems');

  const summary = JSON.parse(written);
  assert.deepEqual(summary.capabilities, { searchProducts: true, readCart: true, addCartItems: true });
  assert.equal(summary.productCount, 2);
  assert.deepEqual(summary.sample, [
    { id: 'potato-1', name: 'Bio Kartoffeln', available: true },
    { id: 'potato-2', name: 'Frühkartoffeln', available: false },
  ]);
});

test('read-only smoke script fails closed and never searches when a required capability is missing', async () => {
  const calls = [];
  const fakeAdapter = fakeReadonlySmokeAdapter(calls, { searchProducts: true, readCart: false, addCartItems: true });

  await assert.rejects(
    runReadonlySmoke({ adapter: fakeAdapter, write: () => {} }),
    (error) => error.message === 'Benötigte Knuspr-Fähigkeiten fehlen',
  );

  assert.deepEqual(calls, ['capabilities']);
});

// --- Real Knuspr MCP contract (observed live against https://mcp.knuspr.de/mcp) ---
function knusprText(payload) {
  return {
    // Knuspr also returns a `structuredContent` envelope with a different
    // shape; the adapter must decode the text content, not this.
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: { result: 'envelope-should-be-ignored' },
    isError: false,
  };
}

const knusprSearchTool = tool('batch_search_products', 'Search products by keyword — up to 4 queries', {
  type: 'object',
  properties: { queries: { type: 'array' } },
  required: ['queries'],
});
const knusprCartTool = tool('get_cart', 'View everything currently in the shopping cart');
const knusprAddTool = tool('add_items_to_cart', 'Add products to the shopping cart', {
  type: 'object',
  properties: { items: { type: 'array' } },
  required: ['items'],
});
// Decoy tools whose descriptions would make the regex heuristics ambiguous.
const decoyRepeatOrder = tool('repeat_order', 'Add all items from previous order to current cart');
const decoyGetCheckout = tool('get_checkout', 'Get complete checkout form data and totals');

const knusprSearchPayload = {
  success: true, total_queries: 1, successful: 1, failed: 0,
  results: [{
    query: 'Kartoffeln', total_found: 3, success: true,
    products: [
      { productId: 13603, productName: "Angermeir's Kartoffeln Drillinge", brand: 'Angermeir', inStock: true, textualAmount: '0,75 kg', price: 2.69, pricePerUnit: { full: 3.59, currency: '€' }, currency: '€', badges: ['local-brand'], salePercents: 0, originalPricePerUnit: 0 },
      { productId: 40, productName: 'Kartoffel-Snack 6er', brand: null, inStock: false, textualAmount: '6 Stück', price: 1.99, pricePerUnit: { full: 0.33 }, badges: [], salePercents: 10, originalPricePerUnit: 2.49 },
      { productName: 'Kaputt ohne ID', price: 1.0 },
    ],
  }],
};

const knusprCartPayload = {
  status: 200, messages: [], success: true,
  data: {
    cartId: 1, totalPrice: 5.07,
    items: {
      2947: { productId: 2947, productName: 'Kühne Gewürzgurken', quantity: 1, unit: 'kg', price: 2.39, textualAmount: '0,67 kg', brand: 'Kühne' },
      12192: { productId: 12192, productName: 'Butter', quantity: 2, price: 1.34 },
    },
  },
};

test('adapter discovers the real Knuspr tools by exact name despite regex-ambiguous decoys', async () => {
  const client = fakeClient([decoyRepeatOrder, knusprSearchTool, knusprCartTool, knusprAddTool, decoyGetCheckout]);
  const adapter = createKnusprAdapter({ client });
  assert.deepEqual(await adapter.capabilities(), { searchProducts: true, readCart: true, addCartItems: true });
});

test('searchProducts parses the real batch_search_products payload from text, not the structuredContent envelope', async () => {
  const client = fakeClient([knusprSearchTool], { batch_search_products: knusprText(knusprSearchPayload) });
  const adapter = createKnusprAdapter({ client });
  const products = await adapter.searchProducts('Kartoffeln');
  assert.deepEqual(client.calls[client.calls.length - 1].args, { queries: [{ keyword: 'Kartoffeln' }] });
  assert.equal(products.length, 2);
  assert.deepEqual(products[0], {
    id: '13603', name: "Angermeir's Kartoffeln Drillinge", brand: 'Angermeir',
    url: null, imageUrl: null, available: true,
    package: { amount: 0.75, unit: 'kg', label: '0,75 kg' },
    price: { current: 2.69, regular: null, unit: 3.59, unitLabel: null, offer: null },
    qualityTags: ['local-brand'],
  });
  assert.equal(products[1].available, false);
  assert.deepEqual(products[1].package, { amount: 6, unit: 'stück', label: '6 Stück' });
  assert.equal(products[1].price.offer, true);
  assert.equal(products[1].price.regular, 2.49);
});

test('getCart parses the real get_cart items map into normalized lines', async () => {
  const client = fakeClient([knusprCartTool], { get_cart: knusprText(knusprCartPayload) });
  const adapter = createKnusprAdapter({ client });
  const lines = await adapter.getCart();
  assert.deepEqual(client.calls[client.calls.length - 1], { name: 'get_cart', args: {} });
  assert.deepEqual(lines, [
    { productId: '2947', name: 'Kühne Gewürzgurken', quantity: 1, unitPrice: 2.39, totalPrice: 2.39 },
    { productId: '12192', name: 'Butter', quantity: 2, unitPrice: 1.34, totalPrice: 2.68 },
  ]);
});

test('getDiscountedItems normalizes the discounted-items payload (sale vs original price)', async () => {
  const discountTool = tool('get_discounted_items', 'Get currently discounted items');
  const payload = {
    success: true, sale_type: 'sales', page: 1,
    products: [
      { productId: 32746, name: 'Freilandeier 10er', prices: { originalPrice: 3.99, salePrice: 3.39, saleId: 20309124, currency: 'EUR' } },
      { productId: 500, name: 'Ohne gültigen Preis', prices: { salePrice: null } },
    ],
  };
  const client = fakeClient([discountTool], { get_discounted_items: knusprText(payload) });
  const adapter = createKnusprAdapter({ client });
  const offers = await adapter.getDiscountedItems({ limit: 5 });
  assert.deepEqual(offers, [{ id: '32746', current: 3.39, regular: 3.99, saleId: 20309124 }]);
});

test('addCartItems maps string product ids to the integer productId Knuspr requires', async () => {
  const client = fakeClient([knusprAddTool], { add_items_to_cart: knusprText({ status: 200, success: true }) });
  const adapter = createKnusprAdapter({ client });
  await adapter.addCartItems([{ productId: '26531', quantity: 2 }]);
  assert.deepEqual(client.calls[client.calls.length - 1].args, { items: [{ productId: 26531, quantity: 2 }] });
});

test('addCartItems rejects a non-integer product id instead of sending it', async () => {
  const client = fakeClient([knusprAddTool], { add_items_to_cart: knusprText({ status: 200 }) });
  const adapter = createKnusprAdapter({ client });
  await assert.rejects(adapter.addCartItems([{ productId: 'abc', quantity: 1 }]), /Produkt-ID/);
  assert.equal(client.calls.length, 0);
});
