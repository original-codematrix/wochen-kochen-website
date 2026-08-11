const { createOAuthProvider } = require('./oauth-provider');

const DEFAULT_ENDPOINT = 'https://mcp.knuspr.de/mcp';

function defaultSdkLoader() {
  return import('@modelcontextprotocol/client');
}

function createKnusprClient({ store, redirectUrl, endpoint = DEFAULT_ENDPOINT, sdkLoader = defaultSdkLoader }) {
  if (!store) throw new Error('Knuspr-Speicher fehlt');
  if (!redirectUrl) throw new Error('OAuth-Rücksprung-URL fehlt');

  let activeSession;
  let authorizingSession;
  let pendingAuthorizationUrl;

  async function createUnconnectedSession(onAuthorizationUrl) {
    const sdk = await sdkLoader();
    const provider = createOAuthProvider({ store, redirectUrl, onAuthorizationUrl });
    const transport = new sdk.StreamableHTTPClientTransport(new URL(endpoint), { authProvider: provider });
    const client = new sdk.Client({ name: 'feierabend-kochbuch', version: '5.0.0' });
    return { sdk, provider, transport, client };
  }

  async function createFreshTransport(provider, sdk) {
    return new sdk.StreamableHTTPClientTransport(new URL(endpoint), { authProvider: provider });
  }

  async function closeSession(session) {
    if (!session) return;
    await session.client.close();
    if (session.transport && typeof session.transport.close === 'function') await session.transport.close();
  }

  function assertCallbackUrl(callback) {
    const expected = new URL(redirectUrl);
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
      throw new Error('OAuth-Rücksprung-URL ungültig');
    }
  }

  function isAuthorizationRedirect(error, session) {
    const UnauthorizedError = session.sdk.UnauthorizedError;
    return Boolean(pendingAuthorizationUrl) && (
      (typeof UnauthorizedError === 'function' && error instanceof UnauthorizedError)
      || (error && error.name === 'UnauthorizedError')
    );
  }

  return {
    async status() {
      return { connected: Boolean(activeSession), authorizationPending: Boolean(pendingAuthorizationUrl) };
    },
    async beginAuthorization() {
      if (activeSession) throw new Error('Knuspr ist bereits verbunden');
      if (authorizingSession) await closeSession(authorizingSession);
      pendingAuthorizationUrl = undefined;
      const session = await createUnconnectedSession((url) => {
        pendingAuthorizationUrl = String(url);
      });
      authorizingSession = session;
      try {
        await session.client.connect(session.transport);
      } catch (error) {
        if (!isAuthorizationRedirect(error, session)) {
          authorizingSession = undefined;
          await closeSession(session);
          throw error;
        }
      }
      if (pendingAuthorizationUrl) return { authorizationUrl: pendingAuthorizationUrl };
      activeSession = session;
      authorizingSession = undefined;
      return { connected: true };
    },
    async finishAuthorization(callbackUrl) {
      const callback = new URL(callbackUrl);
      assertCallbackUrl(callback);
      const stateProvider = createOAuthProvider({ store, redirectUrl });
      await stateProvider.consumeState(callback.searchParams.get('state'));

      const session = await createUnconnectedSession();
      await session.transport.finishAuth(callback.searchParams);
      const freshTransport = await createFreshTransport(session.provider, session.sdk);
      await session.client.connect(freshTransport);
      await closeSession(authorizingSession);
      authorizingSession = undefined;
      pendingAuthorizationUrl = undefined;
      activeSession = { ...session, transport: freshTransport };
      return { connected: true };
    },
    async disconnect() {
      await closeSession(activeSession);
      await closeSession(authorizingSession);
      activeSession = undefined;
      authorizingSession = undefined;
      pendingAuthorizationUrl = undefined;
      await store.remove('knuspr-auth.json');
    },
    async listTools() {
      if (!activeSession) throw new Error('Knuspr-Verbindung erforderlich');
      return activeSession.client.listTools();
    },
    async callTool(name, args) {
      if (!activeSession) throw new Error('Knuspr-Verbindung erforderlich');
      return activeSession.client.callTool({ name, arguments: args });
    },
  };
}

module.exports = { DEFAULT_ENDPOINT, createKnusprClient };
