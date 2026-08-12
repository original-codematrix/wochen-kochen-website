'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { applyPreview } = require('./server/knuspr/cart');
const { validateAdditionalItems } = require('./server/knuspr/contracts');
const { createRuntime } = require('./server/knuspr-service');

const ROOT = __dirname;
const DEFAULT_PLAN = path.join(ROOT, 'server', 'current-plan.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};
const TRUSTED_DOMAIN_ERRORS = {
  KNUSPR_CART_INPUT_INVALID: { status: 400, message: 'Warenkorbanfrage ist ungültig' },
  KNUSPR_PREVIEW_CONFLICT: { status: 409, message: 'Vorschau ist veraltet' },
  // Business-validation errors thrown by server/knuspr-service.js for plan
  // generation and preview editing. These are the app's own German
  // validation messages (not upstream/provider text), so they are safe to
  // surface verbatim to the guided-flow UI.
  KNUSPR_PLAN_TOO_FEW_RECIPES: {
    status: 400,
    message: 'Für den Knuspr-Wochenplan werden sieben unterschiedliche Gerichte benötigt',
  },
  KNUSPR_PREVIEW_LINE_NOT_FOUND: { status: 404, message: 'Vorschauposition nicht gefunden' },
  KNUSPR_PREVIEW_PRODUCT_INVALID: { status: 400, message: 'Produktalternative ist ungültig' },
  KNUSPR_PREVIEW_PRODUCT_UNAVAILABLE: { status: 400, message: 'Produktalternative ist nicht verfügbar' },
  KNUSPR_PREVIEW_QUANTITY_INVALID: { status: 400, message: 'Packungsmenge ist ungültig' },
};

class TrustedHttpError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendRedirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function mutationAllowed(req, refreshToken, appOrigin = 'http://localhost:8080') {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.match(/^Bearer ([^\s]+)$/i);
  const originAllowed = () => {
    if (!req.headers.origin) return true;
    try {
      return req.headers.origin === new URL(appOrigin).origin;
    } catch {
      return false;
    }
  };
  if (refreshToken) return Boolean(bearer && bearer[1] === refreshToken && originAllowed());
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  return originAllowed();
}

function sendDomainError(res, error) {
  if (error instanceof TrustedHttpError) {
    return sendJson(res, error.statusCode, { error: error.message, code: error.code });
  }
  const trusted = TRUSTED_DOMAIN_ERRORS[error && error.code];
  if (trusted) return sendJson(res, trusted.status, { error: trusted.message, code: error.code });
  return sendJson(res, 502, { error: 'Knuspr-Anfrage fehlgeschlagen' });
}

function readJson(req, limit = 20 * 1024 * 1024, res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    // Oversized bodies must not just stop being buffered: the socket has to
    // be torn down, otherwise a client can keep streaming data the server
    // silently discards forever (resource exhaustion / slow-drip attack).
    // When a response object is available we still owe the caller its 4xx
    // JSON error, so the teardown is deferred until that response finishes
    // writing; without one (e.g. direct/unit usage) the socket is cut
    // immediately.
    const teardown = () => {
      if (typeof req.pause === 'function') req.pause();
      if (typeof req.destroy !== 'function') return;
      if (res && typeof res.once === 'function') res.once('finish', () => req.destroy());
      else req.destroy();
    };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        fail(new TrustedHttpError('HTTP_BODY_TOO_LARGE', 'Anfrage ist zu groß'));
        teardown();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const body = Buffer.concat(chunks).toString('utf8').trim();
        resolve(body ? JSON.parse(body) : {});
      }
      catch { fail(new TrustedHttpError('HTTP_INVALID_JSON', 'Ungültiges JSON')); }
    });
    req.on('error', error => fail(error));
  });
}

function trustedAdditionalItems(value) {
  try {
    return validateAdditionalItems(value);
  } catch (error) {
    throw new TrustedHttpError('KNUSPR_INPUT_INVALID', error.message);
  }
}

function authorizationUrl(value) {
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error('missing URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('unsafe URL');
    return url.toString();
  } catch {
    throw new TrustedHttpError(
      'KNUSPR_AUTHORIZATION_URL_INVALID',
      'Knuspr-Autorisierungsadresse ist ungültig',
      502,
    );
  }
}

function resolvePlanFile(options = {}) {
  if (options.planFile || process.env.PLAN_FILE) return options.planFile || process.env.PLAN_FILE;
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.join(ROOT, 'runtime-data');
  const persistent = dataDir ? path.join(dataDir, 'current-plan.json') : null;
  const exists = options.exists || fs.existsSync;
  return persistent && exists(persistent) ? persistent : DEFAULT_PLAN;
}

function readDefaultPlan() {
  return JSON.parse(fs.readFileSync(resolvePlanFile(), 'utf8'));
}

function createServer(options = {}) {
  const loadPlan = options.loadPlan || readDefaultPlan;
  const refreshToken = options.refreshToken ?? process.env.REFRESH_TOKEN ?? '';
  const appOrigin = options.appOrigin || process.env.APP_ORIGIN || 'http://localhost:8080';
  const runtime = options.runtime || createRuntime({
    dataDir: options.dataDir,
    appOrigin,
    redirectUrl: options.redirectUrl,
    endpoint: options.endpoint,
    store: options.store,
    client: options.client,
    adapter: options.adapter,
    recipes: options.recipes,
    sdkLoader: options.sdkLoader,
    now: options.now,
    concurrency: options.concurrency,
  });
  const knuspr = options.knuspr || {};
  const client = knuspr.client || runtime.client;
  const service = knuspr.service || runtime.service;
  const cart = knuspr.cart || {
    applyPreview: input => applyPreview({ ...input, adapter: runtime.adapter, store: runtime.store }),
  };
  const jsonLimit = options.jsonLimit ?? 20 * 1024 * 1024;

  function requestJson(req, res) {
    return readJson(req, jsonLimit, res);
  }

  async function currentPlan() {
    const saved = await service.getPlan();
    return saved || loadPlan();
  }

  function mutationDenied(res, message) {
    return sendJson(res, 403, { error: message });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/knuspr/status') {
      try {
        const status = await client.status();
        return sendJson(res, 200, {
          connected: status && status.connected === true,
          authorizationPending: status && status.authorizationPending === true,
        });
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/knuspr/connect') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Knuspr-Verbindung nicht erlaubt');
      try {
        const result = await client.beginAuthorization();
        return sendJson(res, 200, result && result.authorizationUrl !== undefined
          ? { authorizationUrl: authorizationUrl(result.authorizationUrl) }
          : { connected: result && result.connected === true });
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/knuspr/callback') {
      try {
        await client.finishAuthorization(new URL(req.url, appOrigin).toString());
        return sendRedirect(res, '/?knuspr=connected');
      } catch {
        return sendRedirect(res, '/?knuspr=error');
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/knuspr/disconnect') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Knuspr-Verbindung nicht erlaubt');
      try {
        await client.disconnect();
        return sendJson(res, 200, { connected: false });
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/additional-items') {
      try {
        return sendJson(res, 200, await service.getAdditionalItems());
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'PUT' && url.pathname === '/api/additional-items') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Zusatzliste nicht erlaubt');
      try {
        return sendJson(res, 200, await service.saveAdditionalItems(trustedAdditionalItems(await requestJson(req, res))));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/plan/generate') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Planerstellung nicht erlaubt');
      try {
        return sendJson(res, 200, await service.generatePlan(await requestJson(req, res)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/plan/regenerate') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Planerstellung nicht erlaubt');
      try {
        return sendJson(res, 200, await service.regeneratePlan(await requestJson(req, res)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/current-plan') {
      try {
        return sendJson(res, 200, await currentPlan());
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/preview') {
      try {
        return sendJson(res, 200, await service.getPreview());
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'PATCH' && url.pathname === '/api/preview') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Vorschauänderung nicht erlaubt');
      try {
        return sendJson(res, 200, await service.updatePreviewLine(await requestJson(req, res)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/knuspr/cart/apply') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Warenkorbänderung nicht erlaubt');
      try {
        return sendJson(res, 200, await cart.applyPreview(await requestJson(req, res)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      try {
        const plan = await currentPlan();
        return sendJson(res, 200, { generatedAt: plan.generatedAt, sources: plan.sources || [] });
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Methode nicht erlaubt' });
    }

    let requested;
    try {
      requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    } catch {
      return sendJson(res, 400, { error: 'Ungültiger Pfad' });
    }
    const file = path.resolve(ROOT, `.${requested}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
      return sendJson(res, 403, { error: 'Ungültiger Pfad' });
    }
    fs.readFile(file, (error, content) => {
      if (error) return sendJson(res, 404, { error: 'Nicht gefunden' });
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      if (req.method === 'HEAD') return res.end();
      res.end(content);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Feierabend-Kochbuch läuft auf http://localhost:${port}`);
  });
}

module.exports = {
  TrustedHttpError,
  authorizationUrl,
  createServer,
  mutationAllowed,
  readJson,
  resolvePlanFile,
  sendDomainError,
};
