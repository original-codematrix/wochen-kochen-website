const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer, resolvePlanFile } = require('../server');

test('resolvePlanFile prefers the persistent data directory', () => {
  assert.equal(
    resolvePlanFile({ dataDir: '/srv/kochbuch-data', exists: () => true }),
    '/srv/kochbuch-data/current-plan.json'
  );
});

async function withServer(run, overrides = {}) {
  const server = createServer({
    loadPlan: () => ({ generatedAt: '2026-07-24T12:00:00+02:00', nextWeek: [] }),
    refresh: async () => ({ generatedAt: '2026-07-24T12:01:00+02:00', nextWeek: [] }),
    regenerate: async () => ({ generatedAt: '2026-07-24T12:02:00+02:00', nextWeek: [{ recipeId: 'new' }] }),
    refreshToken: 'secret',
    ...overrides
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/current-plan returns the saved plan', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/current-plan`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).generatedAt, '2026-07-24T12:00:00+02:00');
  });
});

test('POST /api/refresh rejects requests without the configured token', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/refresh`, { method: 'POST' });
    assert.equal(response.status, 403);
  });
});

test('POST /api/refresh runs with the configured token', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/refresh`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret' }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).generatedAt, '2026-07-24T12:01:00+02:00');
  });
});

test('static file traversal is rejected', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/..%2Fserver.js`);
    assert.equal(response.status, 403);
  });
});

test('POST /api/regenerate rerolls recipes without fetching retailer pages', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/regenerate`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret' }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).nextWeek[0].recipeId, 'new');
  });
});

test('POST /api/regenerate forwards ingredient exclusions', async () => {
  let received;
  await withServer(async base => {
    const response = await fetch(`${base}/api/regenerate`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: JSON.stringify({ excludedIngredients: ['Milch', 'Pilze'] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received.excludedIngredients, ['Milch', 'Pilze']);
  }, {
    regenerate: async options => {
      received = options;
      return { generatedAt: '2026-07-24T12:02:00+02:00', nextWeek: [] };
    }
  });
});
