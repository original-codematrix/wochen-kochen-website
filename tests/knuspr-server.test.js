'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createServer } = require('../server');

const root = path.resolve(__dirname, '..');
const auth = { authorization: 'Bearer secret' };
const PLAN = { schemaVersion: 5, planRevision: 'plan-1', days: [] };
const PREVIEW = { generatedAt: '2026-08-11T10:00:00.000Z', days: [], revision: 'preview-1', lines: [] };
const ADDITIONAL_ITEMS = [{
  id: 'water', label: 'Wasser', searchTerm: 'Mineralwasser', quantity: 2,
  category: 'getraenke', enabled: true, pinnedProductId: null,
}];

async function withServer(run, overrides = {}) {
  const calls = [];
  const client = {
    async status() {
      calls.push(['status']);
      return { connected: false, authorizationPending: true, tokens: { access_token: 'secret' } };
    },
    async beginAuthorization() {
      calls.push(['connect']);
      return { authorizationUrl: 'https://auth.knuspr.example/authorize?state=state-1', tokens: { access_token: 'secret' } };
    },
    async finishAuthorization(url) {
      calls.push(['callback', url]);
      if (url.includes('code=bad')) throw new Error('provider secret failure');
      return { connected: true };
    },
    async disconnect() {
      calls.push(['disconnect']);
      return { tokens: { access_token: 'secret' } };
    },
  };
  const service = {
    async getAdditionalItems() { calls.push(['getAdditionalItems']); return ADDITIONAL_ITEMS; },
    async saveAdditionalItems(items) { calls.push(['saveAdditionalItems', items]); return items; },
    async generatePlan(input) { calls.push(['generatePlan', input]); return PLAN; },
    async regeneratePlan(input) { calls.push(['regeneratePlan', input]); return { ...PLAN, planRevision: 'plan-2' }; },
    async getPlan() { calls.push(['getPlan']); return PLAN; },
    async getPreview() { calls.push(['getPreview']); return PREVIEW; },
    async updatePreviewLine(input) { calls.push(['updatePreviewLine', input]); return { ...PREVIEW, revision: 'preview-2' }; },
  };
  const cart = {
    async applyPreview(input) {
      calls.push(['applyPreview', input]);
      if (input.previewRevision === 'old') {
        throw Object.assign(new Error('Vorschau ist veraltet'), { code: 'KNUSPR_PREVIEW_CONFLICT', statusCode: 409 });
      }
      return { status: 'complete', receipt: { previewRevision: input.previewRevision, lines: [] } };
    },
  };
  const server = createServer({
    refreshToken: 'secret',
    loadPlan: () => PLAN,
    knuspr: { client, service, cart },
    ...overrides,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`, calls);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function json(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  return { response, body: await response.json() };
}

test('Knuspr status and connection expose only safe connection data', async () => {
  await withServer(async (base) => {
    const status = await json(base, '/api/knuspr/status');
    assert.equal(status.response.status, 200);
    assert.deepEqual(status.body, { connected: false, authorizationPending: true });

    const rejected = await fetch(`${base}/api/knuspr/connect`, { method: 'POST' });
    assert.equal(rejected.status, 403);

    const connected = await json(base, '/api/knuspr/connect', { method: 'POST', headers: auth });
    assert.equal(connected.response.status, 200);
    assert.deepEqual(connected.body, { authorizationUrl: 'https://auth.knuspr.example/authorize?state=state-1' });
    assert.doesNotMatch(JSON.stringify(connected.body), /access_token|refresh_token/i);
  });
});

test('OAuth callback redirects without disclosing provider errors', async () => {
  await withServer(async (base, calls) => {
    const success = await fetch(`${base}/api/knuspr/callback?code=ok&state=state-1`, { redirect: 'manual' });
    assert.equal(success.status, 302);
    assert.equal(success.headers.get('location'), '/?knuspr=connected');
    assert.match(calls.find(call => call[0] === 'callback')[1], /^http:\/\//);

    const failure = await fetch(`${base}/api/knuspr/callback?code=bad&state=state-1`, { redirect: 'manual' });
    assert.equal(failure.status, 302);
    assert.equal(failure.headers.get('location'), '/?knuspr=error');
    assert.doesNotMatch(await failure.text(), /provider secret failure/i);
  });
});

test('Knuspr plan, additional list, preview and disconnect routes delegate after mutation authorization', async () => {
  await withServer(async (base, calls) => {
    const additional = await json(base, '/api/additional-items');
    assert.deepEqual(additional.body, ADDITIONAL_ITEMS);

    const denied = await fetch(`${base}/api/additional-items`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify([]) });
    assert.equal(denied.status, 403);

    const saved = await json(base, '/api/additional-items', {
      method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(ADDITIONAL_ITEMS),
    });
    assert.deepEqual(saved.body, ADDITIONAL_ITEMS);

    const generated = await json(base, '/api/plan/generate', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ excludedIngredients: ['Fisch'] }),
    });
    assert.equal(generated.body.planRevision, 'plan-1');

    const regenerated = await json(base, '/api/plan/regenerate', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ variation: 2 }),
    });
    assert.equal(regenerated.body.planRevision, 'plan-2');

    assert.deepEqual((await json(base, '/api/current-plan')).body, PLAN);
    assert.deepEqual((await json(base, '/api/preview')).body, PREVIEW);

    const preview = await json(base, '/api/preview', {
      method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ lineId: 'milk', changes: { removed: true } }),
    });
    assert.equal(preview.body.revision, 'preview-2');

    const disconnected = await json(base, '/api/knuspr/disconnect', { method: 'POST', headers: auth });
    assert.deepEqual(disconnected.body, { connected: false });
    assert.deepEqual(calls.filter(call => ['saveAdditionalItems', 'generatePlan', 'regeneratePlan', 'updatePreviewLine', 'disconnect'].includes(call[0])).map(call => call[0]), [
      'saveAdditionalItems', 'generatePlan', 'regeneratePlan', 'updatePreviewLine', 'disconnect',
    ]);
  });
});

test('cart apply rejects missing authorization and reports stale previews without cart mutation', async () => {
  await withServer(async (base, calls) => {
    const denied = await fetch(`${base}/api/knuspr/cart/apply`, { method: 'POST' });
    assert.equal(denied.status, 403);

    const stale = await json(base, '/api/knuspr/cart/apply', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ previewRevision: 'old', acceptedLineIds: [] }),
    });
    assert.equal(stale.response.status, 409);
    assert.deepEqual(stale.body, { error: 'Vorschau ist veraltet', code: 'KNUSPR_PREVIEW_CONFLICT' });
    assert.equal(calls.filter(call => call[0] === 'applyPreview').length, 1);
  });
});

test('tokenless local mutations reject cross-site browser origins', async () => {
  await withServer(async (base, calls) => {
    for (const pathname of ['/api/knuspr/connect', '/api/knuspr/disconnect']) {
      const response = await fetch(`${base}${pathname}`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      });
      assert.equal(response.status, 403, pathname);
    }
    assert.equal(calls.some(call => call[0] === 'connect' || call[0] === 'disconnect'), false);
  }, { refreshToken: '' });
});

test('configured mutation authorization requires an exact bearer token and trusted browser origin', async () => {
  await withServer(async (base, calls) => {
    for (const authorization of ['secret', 'Basic secret', 'Bearer secret trailing']) {
      const response = await fetch(`${base}/api/knuspr/connect`, {
        method: 'POST',
        headers: { authorization },
      });
      assert.equal(response.status, 403, authorization);
    }

    const foreign = await fetch(`${base}/api/knuspr/connect`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret', origin: 'https://evil.example' },
    });
    assert.equal(foreign.status, 403);

    const sameOrigin = await json(base, '/api/knuspr/connect', {
      method: 'POST',
      headers: { authorization: 'Bearer secret', origin: 'http://localhost:8080' },
    });
    assert.equal(sameOrigin.response.status, 200);
    assert.equal(calls.filter(call => call[0] === 'connect').length, 1);
  });
});

test('malformed and oversized request bodies plus local validation errors return safe client errors', async () => {
  await withServer(async (base) => {
    const malformed = await json(base, '/api/plan/generate', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.response.status, 400);
    assert.deepEqual(malformed.body, { error: 'Ungültiges JSON', code: 'HTTP_INVALID_JSON' });

    const invalidItems = await json(base, '/api/additional-items', {
      method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify([{ ...ADDITIONAL_ITEMS[0], category: 'sonstiges' }]),
    });
    assert.equal(invalidItems.response.status, 400);
    assert.deepEqual(invalidItems.body, { error: 'Ungültige Kategorie', code: 'KNUSPR_INPUT_INVALID' });
  });

  await withServer(async (base) => {
    const oversized = await json(base, '/api/plan/generate', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ excludedIngredients: ['zu-langer-Testwert'] }),
    });
    assert.equal(oversized.response.status, 400);
    assert.deepEqual(oversized.body, { error: 'Anfrage ist zu groß', code: 'HTTP_BODY_TOO_LARGE' });
  }, { jsonLimit: 10 });
});

test('untrusted provider errors never disclose their raw 4xx messages', async () => {
  await withServer(async (base) => {
    const response = await json(base, '/api/knuspr/status');
    assert.equal(response.response.status, 502);
    assert.deepEqual(response.body, { error: 'Knuspr-Anfrage fehlgeschlagen' });
    assert.doesNotMatch(JSON.stringify(response.body), /mcp provider secret/i);
  }, {
    knuspr: {
      client: {
        async status() {
          throw Object.assign(new Error('MCP provider secret'), { statusCode: 401, code: 'MCP_UNAUTHORIZED' });
        },
      },
    },
  });
});

test('connect rejects a non-HTTPS authorization URL from the upstream client', async () => {
  await withServer(async (base) => {
    const response = await json(base, '/api/knuspr/connect', { method: 'POST', headers: auth });
    assert.equal(response.response.status, 502);
    assert.deepEqual(response.body, {
      error: 'Knuspr-Autorisierungsadresse ist ungültig',
      code: 'KNUSPR_AUTHORIZATION_URL_INVALID',
    });
  }, {
    knuspr: {
      client: {
        async beginAuthorization() {
          return { authorizationUrl: 'http://auth.knuspr.example/authorize?state=state-1' };
        },
      },
    },
  });
});

test('Knuspr runtime configuration names the local origin and fixed MCP endpoint', () => {
  const config = fs.readFileSync(path.join(root, 'config.example.json'), 'utf8');
  const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
  assert.match(config, /"appOrigin"\s*:\s*"http:\/\/localhost:8080"/);
  assert.match(config, /"knusprMcpUrl"\s*:\s*"https:\/\/mcp\.knuspr\.de\/mcp"/);
  assert.match(compose, /APP_ORIGIN:\s*"?\$\{APP_ORIGIN:-http:\/\/localhost:8080\}"?/);
  assert.match(compose, /KNUSPR_MCP_URL:\s*"?\$\{KNUSPR_MCP_URL:-https:\/\/mcp\.knuspr\.de\/mcp\}"?/);
});
