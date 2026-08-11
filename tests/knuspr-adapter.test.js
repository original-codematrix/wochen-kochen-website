const assert = require('node:assert/strict');
const test = require('node:test');

const { createKnusprAdapter } = require('../server/knuspr/adapter');

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
