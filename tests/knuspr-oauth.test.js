const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createKnusprStore } = require('../server/knuspr/store');
const { createOAuthProvider } = require('../server/knuspr/oauth-provider');
const { createKnusprClient } = require('../server/knuspr/client');

const redirectUrl = 'http://localhost:8080/api/knuspr/callback';

async function createStore() {
  return createKnusprStore({ dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'knuspr-oauth-')) });
}

function createFakeSdk({
  authorizationRedirectThrows = false,
  finishAuthError,
  connectWithTokenError,
  throwClientCloseAt = [],
  throwTransportCloseAt = [],
} = {}) {
  const records = { transports: [], clients: [], finishAuthCalls: 0 };

  class UnauthorizedError extends Error {
    constructor(message) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  }

  class StreamableHTTPClientTransport {
    constructor(endpoint, { authProvider }) {
      this.endpoint = endpoint;
      this.authProvider = authProvider;
      records.transports.push(this);
    }

    async finishAuth(params) {
      records.finishAuthCalls += 1;
      records.callbackParams = new URLSearchParams(params);
      if (finishAuthError) throw finishAuthError;
      await this.authProvider.saveTokens(
        { access_token: 'exchanged-token', token_type: 'bearer' },
        { issuer: 'https://auth.example' },
      );
    }

    async close() {
      this.closeAttempts = (this.closeAttempts || 0) + 1;
      this.closed = true;
      if (throwTransportCloseAt.includes(records.transports.indexOf(this))) {
        throw new Error(`Transport close ${records.transports.indexOf(this)} failed`);
      }
    }
  }

  class Client {
    constructor(info) {
      this.info = info;
      records.clients.push(this);
    }

    async connect(transport) {
      this.transport = transport;
      records.connects = (records.connects || 0) + 1;
      if (await transport.authProvider.tokens()) {
        if (connectWithTokenError) throw connectWithTokenError;
      } else {
        await transport.authProvider.saveCodeVerifier('fake-verifier');
        const state = await transport.authProvider.state();
        await transport.authProvider.redirectToAuthorization(
          new URL(`https://auth.example/authorize?state=${encodeURIComponent(state)}`),
        );
        if (authorizationRedirectThrows) throw new UnauthorizedError('Authentication requires user authorization - redirect initiated');
      }
    }

    async close() {
      this.closeAttempts = (this.closeAttempts || 0) + 1;
      this.closed = true;
      if (throwClientCloseAt.includes(records.clients.indexOf(this))) {
        throw new Error(`Client close ${records.clients.indexOf(this)} failed`);
      }
    }

    async listTools() {
      return { tools: [{ name: 'search-products' }] };
    }

    async callTool(request) {
      return { content: [{ type: 'text', text: JSON.stringify(request) }] };
    }
  }

  return { records, sdkLoader: async () => ({ Client, StreamableHTTPClientTransport, UnauthorizedError }) };
}

test('provider persists PKCE, state, client registration, discovery and tokens server-side', async () => {
  const store = await createStore();
  const provider = createOAuthProvider({ store, redirectUrl, stateFactory: () => 'state-123' });

  await provider.saveCodeVerifier('verifier');
  await provider.saveClientInformation({ client_id: 'client-123' }, { issuer: 'https://auth.example' });
  await provider.saveTokens({ access_token: 'token', token_type: 'bearer' }, { issuer: 'https://auth.example' });
  await provider.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example' });

  assert.equal(await provider.codeVerifier(), 'verifier');
  assert.equal((await provider.tokens()).access_token, 'token');
  assert.equal((await provider.clientInformation({ issuer: 'https://auth.example' })).client_id, 'client-123');
  assert.deepEqual(await provider.discoveryState(), { authorizationServerUrl: 'https://auth.example' });
  assert.equal(await provider.state(), 'state-123');
  assert.deepEqual(await store.read('knuspr-auth.json', null), {
    codeVerifier: 'verifier',
    state: 'state-123',
    clientInformation: { 'https://auth.example': { client_id: 'client-123' } },
    tokens: { 'https://auth.example': { access_token: 'token', token_type: 'bearer' } },
    latestIssuer: 'https://auth.example',
    discoveryState: { authorizationServerUrl: 'https://auth.example' },
  });
});

test('finishAuthorization rejects a mismatched state before token exchange', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk();
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });

  await client.beginAuthorization();
  await assert.rejects(client.finishAuthorization(`${redirectUrl}?code=abc&state=wrong`), /OAuth-State/);
  assert.equal(fakeSdk.records.finishAuthCalls, 0);
});

test('beginAuthorization returns the callback target after the SDK reports its OAuth redirect', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk({ authorizationRedirectThrows: true });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });

  const result = await client.beginAuthorization();

  assert.match(result.authorizationUrl, /^https:\/\/auth\.example\/authorize\?state=/);
  assert.deepEqual(await client.status(), { connected: false, authorizationPending: true });
});

test('beginAuthorization reconnects an existing server-side token session without requiring a redirect', async () => {
  const store = await createStore();
  await store.write('knuspr-auth.json', {
    tokens: { 'https://auth.example': { access_token: 'persisted-token', token_type: 'bearer' } },
    latestIssuer: 'https://auth.example',
  }, { sensitive: true });
  const fakeSdk = createFakeSdk();
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });

  assert.deepEqual(await client.beginAuthorization(), { connected: true });
  assert.deepEqual(await client.status(), { connected: true, authorizationPending: false });
});

test('each explicit authorization start rotates state and replaces stale PKCE and discovery material', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk();
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });

  const first = await client.beginAuthorization();
  const firstState = new URL(first.authorizationUrl).searchParams.get('state');
  const auth = await store.read('knuspr-auth.json', null);
  await store.write('knuspr-auth.json', {
    ...auth,
    codeVerifier: 'stale-verifier',
    discoveryState: { authorizationServerUrl: 'https://stale.example' },
  }, { sensitive: true });

  const second = await client.beginAuthorization();
  const secondState = new URL(second.authorizationUrl).searchParams.get('state');
  const rotated = await store.read('knuspr-auth.json', null);

  assert.notEqual(secondState, firstState);
  assert.notEqual(rotated.codeVerifier, 'stale-verifier');
  assert.equal(rotated.discoveryState, undefined);
});

test('a valid callback exchanges on an unconnected transport and reconnects with a fresh transport', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk();
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });

  const { authorizationUrl } = await client.beginAuthorization();
  const state = new URL(authorizationUrl).searchParams.get('state');
  assert.deepEqual(await client.finishAuthorization(`${redirectUrl}?code=abc&state=${state}`), { connected: true });
  assert.equal(fakeSdk.records.finishAuthCalls, 1);
  assert.equal(fakeSdk.records.transports.length, 3);
  assert.deepEqual(await client.listTools(), { tools: [{ name: 'search-products' }] });
  assert.deepEqual(
    await client.callTool('search-products', { query: 'Tomaten' }),
    { content: [{ type: 'text', text: '{"name":"search-products","arguments":{"query":"Tomaten"}}' }] },
  );
});

test('disconnect closes the active session, removes local credentials and reports disconnected', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk();
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  const { authorizationUrl } = await client.beginAuthorization();
  const state = new URL(authorizationUrl).searchParams.get('state');
  await client.finishAuthorization(`${redirectUrl}?code=abc&state=${state}`);

  await client.disconnect();

  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
  assert.equal(await store.read('knuspr-auth.json', null), null);
  assert.equal(fakeSdk.records.clients.at(-1).closed, true);
});

test('disconnect clears credentials after active-session close failures and still attempts every active resource', async () => {
  const store = await createStore();
  await store.write('knuspr-auth.json', {
    tokens: { 'https://auth.example': { access_token: 'persisted-token', token_type: 'bearer' } },
    latestIssuer: 'https://auth.example',
  }, { sensitive: true });
  const fakeSdk = createFakeSdk({ throwClientCloseAt: [0], throwTransportCloseAt: [0] });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  await client.beginAuthorization();

  await assert.rejects(client.disconnect(), /Client close 0 failed/);

  assert.equal(fakeSdk.records.clients[0].closeAttempts, 1);
  assert.equal(fakeSdk.records.transports[0].closeAttempts, 1);
  assert.equal(await store.read('knuspr-auth.json', null), null);
  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
});

test('disconnect clears credentials after pending-session close failures and still attempts every pending resource', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk({ throwClientCloseAt: [0], throwTransportCloseAt: [0] });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  await client.beginAuthorization();

  await assert.rejects(client.disconnect(), /Client close 0 failed/);

  assert.equal(fakeSdk.records.clients[0].closeAttempts, 1);
  assert.equal(fakeSdk.records.transports[0].closeAttempts, 1);
  assert.equal(await store.read('knuspr-auth.json', null), null);
  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
});

test('finishAuthorization cleans every created resource and preserves a finishAuth failure when cleanup fails', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk({
    finishAuthError: new Error('finishAuth failed'),
    throwClientCloseAt: [0, 1],
    throwTransportCloseAt: [0, 1],
  });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  const { authorizationUrl } = await client.beginAuthorization();
  const state = new URL(authorizationUrl).searchParams.get('state');

  await assert.rejects(client.finishAuthorization(`${redirectUrl}?code=abc&state=${state}`), /finishAuth failed/);

  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
  assert.equal(fakeSdk.records.clients[0].closeAttempts, 1);
  assert.equal(fakeSdk.records.clients[1].closeAttempts, 1);
  assert.equal(fakeSdk.records.transports[0].closeAttempts, 1);
  assert.equal(fakeSdk.records.transports[1].closeAttempts, 1);
});

test('finishAuthorization cleans callback and fresh transports after a fresh connection failure', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk({ connectWithTokenError: new Error('fresh connect failed') });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  const { authorizationUrl } = await client.beginAuthorization();
  const state = new URL(authorizationUrl).searchParams.get('state');

  await assert.rejects(client.finishAuthorization(`${redirectUrl}?code=abc&state=${state}`), /fresh connect failed/);

  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
  assert.equal(fakeSdk.records.clients[0].closed, true);
  assert.equal(fakeSdk.records.clients[1].closed, true);
  assert.equal(fakeSdk.records.transports[0].closed, true);
  assert.equal(fakeSdk.records.transports[1].closed, true);
  assert.equal(fakeSdk.records.transports[2].closed, true);
});

test('finishAuthorization cleans the new session when closing the previous authorization session fails', async () => {
  const store = await createStore();
  const fakeSdk = createFakeSdk({ throwClientCloseAt: [0] });
  const client = createKnusprClient({ store, redirectUrl, sdkLoader: fakeSdk.sdkLoader });
  const { authorizationUrl } = await client.beginAuthorization();
  const state = new URL(authorizationUrl).searchParams.get('state');

  await assert.rejects(client.finishAuthorization(`${redirectUrl}?code=abc&state=${state}`), /Client close 0 failed/);

  assert.deepEqual(await client.status(), { connected: false, authorizationPending: false });
  assert.equal(fakeSdk.records.clients[1].closed, true);
  assert.equal(fakeSdk.records.transports[0].closed, true);
  assert.equal(fakeSdk.records.transports[1].closed, true);
  assert.equal(fakeSdk.records.transports[2].closed, true);
});
