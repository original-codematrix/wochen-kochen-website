'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { applyPreview } = require('./server/knuspr/cart');
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

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendRedirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function mutationAllowed(req, refreshToken, appOrigin = 'http://localhost:8080') {
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (refreshToken) return supplied === refreshToken;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if (!req.headers.origin) return true;
  try {
    return req.headers.origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

function sendDomainError(res, error) {
  const status = Number.isInteger(error && error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
    ? error.statusCode
    : 502;
  const code = typeof (error && error.code) === 'string' && error.code.startsWith('KNUSPR_')
    ? error.code
    : null;
  const message = status < 500 && error && typeof error.message === 'string' && error.message
    ? error.message
    : 'Knuspr-Anfrage fehlgeschlagen';
  return sendJson(res, status, { error: message, ...(code ? { code } : {}) });
}

function readJson(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Datei ist zu groß'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8').trim();
        resolve(body ? JSON.parse(body) : {});
      }
      catch { reject(new Error('Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
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
  const refresh = options.refresh || (async params => require('./server/refresh').refreshPlan(params));
  const regenerate = options.regenerate || (async params => require('./server/refresh').regeneratePlan(params));
  const importOffers = options.importOffers || (payload => require('./server/refresh').importOfferHtml(payload));
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
        return sendJson(res, 200, typeof result.authorizationUrl === 'string'
          ? { authorizationUrl: result.authorizationUrl }
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
        return sendJson(res, 200, await service.saveAdditionalItems(await readJson(req)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/plan/generate') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Planerstellung nicht erlaubt');
      try {
        return sendJson(res, 200, await service.generatePlan(await readJson(req)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/plan/regenerate') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Planerstellung nicht erlaubt');
      try {
        return sendJson(res, 200, await service.regeneratePlan(await readJson(req)));
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
        return sendJson(res, 200, await service.updatePreviewLine(await readJson(req)));
      } catch (error) {
        return sendDomainError(res, error);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/knuspr/cart/apply') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Warenkorbänderung nicht erlaubt');
      try {
        return sendJson(res, 200, await cart.applyPreview(await readJson(req)));
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
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Aktualisierung nicht erlaubt');
      try {
        return sendJson(res, 200, await refresh(await readJson(req)));
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/import-offers') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Import nicht erlaubt');
      try {
        const payload = await readJson(req);
        const imported = await importOffers(payload);
        const current = loadPlan();
        const plan = await refresh({
          variation: (Number(current.planRevision) || 0) + 1,
          excludedIngredients: payload.excludedIngredients
        });
        return sendJson(res, 200, { ...imported, plan });
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/regenerate') {
      if (!mutationAllowed(req, refreshToken, appOrigin)) return mutationDenied(res, 'Neuberechnung nicht erlaubt');
      try {
        return sendJson(res, 200, await regenerate(await readJson(req)));
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
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

module.exports = { createServer, mutationAllowed, resolvePlanFile, sendDomainError };
