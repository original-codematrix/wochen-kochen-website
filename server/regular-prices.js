'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 35 * 24 * 60 * 60 * 1000;
const FORBIDDEN = /\b(fisch|lachs|forelle|thun|kabeljau|seelachs|hering|matjes|makrele|sardine|dorade|zander|karpfen|pangasius|garnel|shrimp|scampi|hummer|muschel|auster|tintenfisch|calamari|oktopus|seafood|meeresfr|krabbe|surimi|anchovis|sardelle)\b/i;
const OWN_BRAND = /\b(ja!|rewe beste wahl|rewe bio|gut\s*&\s*günstig|edeka herzstücke|edeka bio|k-classic|k-bio|k-purland)\b/i;
const QUERY_RULES = [
  ['Hähnchenbrust', /\b(hähnchenbrust|hähnchen-brust|putenbrust)\b/i],
  ['Hähnchen', /\b(hähnchen|chicken|geflügel|pute)\b/i],
  ['Hackfleisch', /\b(rinderhack|hackfleisch|hack)\b/i],
  ['Rindfleisch', /\b(rind|rinder)\b/i],
  ['Schweinefleisch', /\b(schwein|nacken|medaillon|schnitzel)\b/i],
  ['Leberkäse', /\b(leberkäse|leberkas)\b/i],
  ['Bratwurst', /\b(bratwurst|würstchen)\b/i],
  ['Schinken', /\b(schinken)\b/i],
  ['Pizza', /\b(pizza|pizzen|flammkuchen)\b/i],
  ['Gnocchi', /\bgnocchi\b/i],
  ['Nudeln', /\b(pasta|nudeln?|penne|fusilli|rigatoni|spaghetti|mie|spätzle|lasagneplatten)\b/i],
  ['Reis', /\b(reis|basmati)\b/i],
  ['Kartoffeln', /\b(kartoffel|pommes)\b/i],
  ['Brokkoli', /\bbrokkoli\b/i],
  ['Spinat', /\bspinat\b/i],
  ['Eier', /\b(eier?|spiegelei)\b/i],
  ['Wraps', /\b(wrap|burgerbrötchen)\b/i],
  ['Parmesan', /\bparmesan\b/i],
  ['Feta', /\bfeta\b/i],
  ['Mozzarella', /\bmozzarella\b/i],
  ['Käse', /\bkäse\b/i],
  ['Joghurt', /\bjoghurt\b/i],
  ['Kochsahne', /\b(kochsahne|sahne|frischkäse|béchamel)\b/i],
  ['Gurke', /\bgurke\b/i],
  ['Tomaten', /\btomat/i],
  ['Zwiebeln', /\bzwiebel/i],
  ['Erbsen', /\berbse/i],
  ['Linsen', /\blinse/i],
  ['Möhren', /\b(möhre|karotte)\b/i],
  ['Paprika', /\bpaprika\b/i],
  ['Kokosmilch', /\bkokosmilch\b/i]
];
const PUBLIC_MARKETS = [
  {
    market: 'REWE Eching',
    searchUrl: query => `https://www.rewe.de/shop/suche?search=${encodeURIComponent(query)}`
  },
  {
    market: 'EDEKA Morsestraße',
    searchUrl: query => `https://www.edeka.de/suche.jsp?searchstring=${encodeURIComponent(query)}`
  },
  {
    market: 'Kaufland Lohhof',
    searchUrl: query => `https://filiale.kaufland.de/suche.html?q=${encodeURIComponent(query)}`
  }
];

function decodeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  const match = String(value || '').match(/\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function queryFor(value) {
  return QUERY_RULES.find(([, pattern]) => pattern.test(String(value)))?.[0] || null;
}

function collectNeededQueries(plan, recipes) {
  const visibleIds = new Set([...(plan?.weekend || []), ...(plan?.nextWeek || [])].map(day => day.recipeId));
  const queries = recipes
    .filter(recipe => visibleIds.has(recipe.id))
    .flatMap(recipe => recipe.ingredients || [])
    .filter(ingredient => !/\boptional\b/i.test(ingredient) && !FORBIDDEN.test(ingredient))
    .map(queryFor)
    .filter(Boolean);
  return [...new Set(queries)].sort((a, b) => a.localeCompare(b, 'de'));
}

function walkJson(value, visit) {
  if (Array.isArray(value)) {
    value.forEach(item => walkJson(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach(item => walkJson(item, visit));
}

function productFromJson(value, market, sourceUrl) {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (!types.some(type => String(type).toLowerCase() === 'product')) return null;
  const offers = Array.isArray(value.offers) ? value.offers[0] : value.offers;
  const currency = String(offers?.priceCurrency || 'EUR').toUpperCase();
  const price = number(offers?.price ?? offers?.lowPrice);
  const name = decodeText(value.name);
  if (!name || price === null || currency !== 'EUR' || FORBIDDEN.test(name)) return null;
  return {
    market,
    query: null,
    name,
    package: decodeText(value.size || value.weight || value.description),
    price,
    priceType: 'regular',
    sourceUrl
  };
}

function parsePublicProducts(html, market, sourceUrl) {
  const products = [];
  for (const script of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkJson(JSON.parse(script[1]), value => {
        const product = productFromJson(value, market, sourceUrl);
        if (product) products.push(product);
      });
    } catch {
      // Ungültiges optionales JSON-LD darf andere sichtbare Produktkarten nicht blockieren.
    }
  }
  for (const card of String(html || '').matchAll(/<(?:article|li|div)\b([^>]*\bdata-product-name=["'][^"']+["'][^>]*)>/gi)) {
    const attributes = card[1];
    const name = decodeText((attributes.match(/\bdata-product-name=["']([^"']+)["']/i) || [])[1]);
    const price = number((attributes.match(/\bdata-product-price=["']([^"']+)["']/i) || [])[1]);
    const priceType = decodeText((attributes.match(/\bdata-price-type=["']([^"']+)["']/i) || [])[1]).toLowerCase();
    const packageText = decodeText((attributes.match(/\bdata-product-package=["']([^"']+)["']/i) || [])[1]);
    if (!name || price === null || FORBIDDEN.test(name) || /30-day|previous|old|app/.test(priceType)) continue;
    products.push({ market, query: null, name, package: packageText, price, priceType: 'regular', sourceUrl });
  }
  return [...new Map(products.map(product => [`${product.name}|${product.package}|${product.price}`, product])).values()];
}

function chooseMatchingPrice(query, records) {
  const expected = queryFor(query) || query;
  const matches = (records || []).filter(record => (
    !FORBIDDEN.test(record.name)
    && (queryFor(record.name) || record.query) === expected
    && Number(record.price) > 0
  ));
  return matches.sort((a, b) => {
    const freshness = Number(a.priceType === 'stale-regular') - Number(b.priceType === 'stale-regular');
    if (freshness) return freshness;
    const brand = Number(OWN_BRAND.test(b.name)) - Number(OWN_BRAND.test(a.name));
    return brand || Number(a.price) - Number(b.price);
  })[0] || null;
}

function readCache(file, supplied) {
  if (supplied) return supplied;
  if (!file || !fs.existsSync(file)) return { updatedAt: null, records: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { updatedAt: parsed.updatedAt || null, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { updatedAt: null, records: [] };
  }
}

function ageAt(record, now) {
  return now.getTime() - new Date(record.capturedAt).getTime();
}

async function defaultFetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'de-DE,de;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; Feierabend-Kochbuch/1.0)'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchTargetedRegularPrices(options = {}) {
  const queries = [...new Set((options.queries || []).map(String).filter(Boolean))].slice(0, 24);
  const markets = options.markets || PUBLIC_MARKETS;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const dataDir = options.dataDir || (!options.cache ? process.env.DATA_DIR || path.join(ROOT, 'runtime-data') : null);
  const cacheFile = dataDir ? path.join(dataDir, 'regular-price-cache.json') : null;
  const cache = readCache(cacheFile, options.cache);
  const fetchHtml = options.fetchHtml || defaultFetchHtml;
  const work = markets.flatMap(market => queries.map(query => ({ ...market, query })));
  const outcomes = await mapConcurrent(work, 3, async item => {
    const cached = (cache.records || [])
      .filter(record => record.market === item.market && record.query === item.query)
      .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))[0];
    const age = cached ? ageAt(cached, now) : Infinity;
    if (age >= 0 && age <= FRESH_MS) {
      return { item, record: { ...cached, priceType: 'regular' }, state: 'cached-current', error: null };
    }
    try {
      const sourceUrl = item.searchUrl(item.query);
      const parsed = parsePublicProducts(await fetchHtml(sourceUrl), item.market, sourceUrl)
        .map(record => ({ ...record, query: item.query, capturedAt: now.toISOString() }));
      const record = chooseMatchingPrice(item.query, parsed);
      if (record) return { item, record, state: 'current', error: null };
      if (cached && age >= 0 && age <= STALE_MS) {
        return { item, record: { ...cached, priceType: 'stale-regular' }, state: 'cached-stale', error: null };
      }
      return { item, record: null, state: 'limited', error: null };
    } catch (error) {
      if (cached && age >= 0 && age <= STALE_MS) {
        return { item, record: { ...cached, priceType: 'stale-regular' }, state: 'cached-stale', error: error.message };
      }
      return { item, record: null, state: 'error', error: error.message };
    }
  });
  const records = outcomes.flatMap(outcome => outcome.record ? [outcome.record] : []);
  const coverage = markets.map(({ market }) => {
    const relevant = outcomes.filter(outcome => outcome.item.market === market);
    const states = new Set(relevant.map(outcome => outcome.state));
    const status = states.has('current')
      ? 'current'
      : states.has('cached-current')
        ? 'cached-current'
        : states.has('cached-stale')
          ? 'cached-stale'
          : states.has('limited')
            ? 'limited'
            : 'error';
    return {
      market,
      requested: relevant.length,
      confirmed: relevant.filter(outcome => outcome.record).length,
      stale: relevant.filter(outcome => outcome.record?.priceType === 'stale-regular').length,
      status,
      errors: relevant.filter(outcome => outcome.error).map(outcome => outcome.error)
    };
  });
  if (cacheFile) {
    const retained = (cache.records || []).filter(record => (
      !work.some(item => item.market === record.market && item.query === record.query)
      && ageAt(record, now) <= STALE_MS
    ));
    const storedRecords = records.map(record => (
      record.priceType === 'stale-regular' ? { ...record, priceType: 'regular' } : record
    ));
    const payload = { updatedAt: now.toISOString(), records: retained.concat(storedRecords) };
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${cacheFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(payload, null, 2));
    fs.renameSync(temporary, cacheFile);
  }
  return { records, coverage };
}

module.exports = {
  collectNeededQueries,
  parsePublicProducts,
  chooseMatchingPrice,
  queryFor,
  fetchTargetedRegularPrices,
  PUBLIC_MARKETS
};
