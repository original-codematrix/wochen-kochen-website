const { randomBytes, timingSafeEqual } = require('node:crypto');

const AUTH_FILE = 'knuspr-auth.json';
const DEFAULT_ISSUER = '__default__';

function defaultStateFactory() {
  return randomBytes(32).toString('base64url');
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function createOAuthProvider({ store, redirectUrl, onAuthorizationUrl, stateFactory = defaultStateFactory }) {
  if (!store) throw new Error('Knuspr-Speicher fehlt');
  if (!redirectUrl) throw new Error('OAuth-Rücksprung-URL fehlt');

  async function readAuth() {
    const auth = await store.read(AUTH_FILE, {});
    return isRecord(auth) ? auth : {};
  }

  async function writeAuth(auth) {
    await store.write(AUTH_FILE, auth, { sensitive: true });
  }

  function issuerKey(context) {
    return context && typeof context.issuer === 'string' && context.issuer ? context.issuer : DEFAULT_ISSUER;
  }

  async function state() {
    const auth = await readAuth();
    if (typeof auth.state === 'string' && auth.state) return auth.state;
    const value = stateFactory();
    if (typeof value !== 'string' || !value) throw new Error('OAuth-State fehlt');
    await writeAuth({ ...auth, state: value });
    return value;
  }

  async function consumeState(receivedState) {
    const auth = await readAuth();
    if (typeof receivedState !== 'string' || !auth.state || !sameValue(auth.state, receivedState)) {
      throw new Error('OAuth-State ungültig');
    }
    const { state: ignored, ...withoutState } = auth;
    await writeAuth(withoutState);
  }

  async function rotateAuthorization() {
    const auth = await readAuth();
    const value = stateFactory();
    if (typeof value !== 'string' || !value) throw new Error('OAuth-State fehlt');
    const {
      state: ignoredState,
      codeVerifier: ignoredCodeVerifier,
      discoveryState: ignoredDiscoveryState,
      ...retainedAuth
    } = auth;
    await writeAuth({ ...retainedAuth, state: value });
    return value;
  }

  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return {
        client_name: 'Feierabend-Kochbuch',
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };
    },
    state,
    consumeState,
    rotateAuthorization,
    async clientInformation(context) {
      const auth = await readAuth();
      return auth.clientInformation && auth.clientInformation[issuerKey(context)];
    },
    async saveClientInformation(clientInformation, context) {
      const auth = await readAuth();
      await writeAuth({
        ...auth,
        clientInformation: { ...(isRecord(auth.clientInformation) ? auth.clientInformation : {}), [issuerKey(context)]: clientInformation },
      });
    },
    async tokens(context) {
      const auth = await readAuth();
      if (!isRecord(auth.tokens)) return undefined;
      if (typeof auth.tokens.access_token === 'string') return auth.tokens;
      const key = context ? issuerKey(context) : auth.latestIssuer;
      return typeof key === 'string' ? auth.tokens[key] : undefined;
    },
    async saveTokens(tokens, context) {
      const auth = await readAuth();
      const key = issuerKey(context);
      await writeAuth({
        ...auth,
        tokens: { ...(isRecord(auth.tokens) ? auth.tokens : {}), [key]: tokens },
        latestIssuer: key,
      });
    },
    async redirectToAuthorization(authorizationUrl) {
      if (typeof onAuthorizationUrl === 'function') await onAuthorizationUrl(String(authorizationUrl));
    },
    async saveCodeVerifier(codeVerifier) {
      const auth = await readAuth();
      await writeAuth({ ...auth, codeVerifier });
    },
    async codeVerifier() {
      return (await readAuth()).codeVerifier;
    },
    async saveDiscoveryState(discoveryState) {
      const auth = await readAuth();
      await writeAuth({ ...auth, discoveryState });
    },
    async discoveryState() {
      return (await readAuth()).discoveryState;
    },
    async invalidateCredentials(scope) {
      if (scope === 'all') {
        await store.remove(AUTH_FILE);
        return;
      }
      const auth = await readAuth();
      if (scope === 'client') delete auth.clientInformation;
      if (scope === 'tokens') {
        delete auth.tokens;
        delete auth.latestIssuer;
      }
      if (scope === 'verifier') delete auth.codeVerifier;
      if (scope === 'discovery') delete auth.discoveryState;
      await writeAuth(auth);
    },
  };
}

module.exports = { createOAuthProvider };
