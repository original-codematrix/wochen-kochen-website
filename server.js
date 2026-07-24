'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/current-plan') {
      return sendJson(res, 200, loadPlan());
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const plan = loadPlan();
      return sendJson(res, 200, { generatedAt: plan.generatedAt, sources: plan.sources || [] });
    }
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (refreshToken ? supplied !== refreshToken : !local) {
        return sendJson(res, 403, { error: 'Aktualisierung nicht erlaubt' });
      }
      try {
        return sendJson(res, 200, await refresh(await readJson(req)));
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/import-offers') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (refreshToken ? supplied !== refreshToken : !local) {
        return sendJson(res, 403, { error: 'Import nicht erlaubt' });
      }
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
      const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (refreshToken ? supplied !== refreshToken : !local) {
        return sendJson(res, 403, { error: 'Neuberechnung nicht erlaubt' });
      }
      try {
        return sendJson(res, 200, await regenerate(await readJson(req)));
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Methode nicht erlaubt' });
    }

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
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

module.exports = { createServer, resolvePlanFile };
