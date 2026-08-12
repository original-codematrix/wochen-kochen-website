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
    let firstError;
    if (session.client && typeof session.client.close === 'function') {
      try {
        await session.client.close();
      } catch (error) {
        firstError = error;
      }
    }
    if (session.transport && typeof session.transport.close === 'function') {
      try {
        await session.transport.close();
      } catch (error) {
        firstError ||= error;
      }
    }
    if (firstError) throw firstError;
  }

  async function closeTransport(transport) {
    if (transport && typeof transport.close === 'function') await transport.close();
  }

  async function attemptAll(tasks) {
    let firstError;
    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        firstError ||= error;
      }
    }
    return firstError;
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
    async reconnect() {
      // Silently restore a session from previously stored tokens (e.g. after a
      // server restart). No onAuthorizationUrl is passed, so if the tokens are
      // missing or expired the SDK's auth attempt no-ops and connect() rejects
      // with UnauthorizedError — we report {connected:false} without leaving the
      // client in a pending-authorization state or requiring re-login here.
      if (activeSession) return { connected: true };
      if (authorizingSession || pendingAuthorizationUrl) return { connected: false };
      const session = await createUnconnectedSession();
      try {
        await session.client.connect(session.transport);
      } catch (error) {
        await attemptAll([() => closeSession(session)]);
        return { connected: false };
      }
      activeSession = session;
      return { connected: true };
    },
    async beginAuthorization() {
      if (activeSession) throw new Error('Knuspr ist bereits verbunden');
      if (authorizingSession) {
        const previousSession = authorizingSession;
        authorizingSession = undefined;
        pendingAuthorizationUrl = undefined;
        const cleanupError = await attemptAll([() => closeSession(previousSession)]);
        if (cleanupError) throw cleanupError;
      }
      const stateProvider = createOAuthProvider({ store, redirectUrl });
      await stateProvider.rotateAuthorization();
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
          pendingAuthorizationUrl = undefined;
          await attemptAll([() => closeSession(session)]);
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

      const previousSession = authorizingSession;
      let session;
      let freshTransport;
      let previousSessionCloseAttempted = false;
      try {
        session = await createUnconnectedSession();
        await session.transport.finishAuth(callback.searchParams);
        freshTransport = await createFreshTransport(session.provider, session.sdk);
        await session.client.connect(freshTransport);
        previousSessionCloseAttempted = true;
        await closeSession(previousSession);
        authorizingSession = undefined;
        pendingAuthorizationUrl = undefined;
        activeSession = { ...session, transport: freshTransport };
        return { connected: true };
      } catch (error) {
        activeSession = undefined;
        authorizingSession = undefined;
        pendingAuthorizationUrl = undefined;
        await attemptAll([
          () => closeSession(session),
          () => closeTransport(freshTransport),
          ...(previousSessionCloseAttempted ? [] : [() => closeSession(previousSession)]),
        ]);
        throw error;
      }
    },
    async disconnect() {
      const currentActiveSession = activeSession;
      const currentAuthorizingSession = authorizingSession;
      activeSession = undefined;
      authorizingSession = undefined;
      pendingAuthorizationUrl = undefined;
      const cleanupError = await attemptAll([
        () => closeSession(currentActiveSession),
        () => closeSession(currentAuthorizingSession),
        () => store.remove('knuspr-auth.json'),
      ]);
      if (cleanupError) throw cleanupError;
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
