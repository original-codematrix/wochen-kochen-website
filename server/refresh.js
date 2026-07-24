'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { recipes } = require('../data');
const { generateOfferPlan } = require('./planner');
const { collectNeededQueries, fetchTargetedRegularPrices } = require('./regular-prices');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(__dirname, 'current-plan.json');
const FORBIDDEN = /\b(fisch|lachs|forelle|thun|kabeljau|seelachs|hering|makrele|sardine|dorade|zander|karpfen|pangasius|schlemmer.?filet|garnel|shrimp|scampi|hummer|muschel|auster|tintenfisch|calamari|oktopus|seafood|meeresfr)/i;
const OWN_BRANDS = /\b(ja!|rewe beste wahl|gut\s*&\s*günstig|edeka herzstücke|k-classic|k-bio|k-purland)\b/i;

function text(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  const match = String(value || '').match(/\d+[.,]\d{2}/);
  return match ? Number(match[0].replace(',', '.')) : null;
}

function parseKaufland(html) {
  const offers = [];
  for (const match of html.matchAll(/<a class="k-product-tile[\s\S]*?<\/a>/g)) {
    const block = match[0];
    const grab = className => text((block.match(new RegExp(`class="${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`)) || [])[1]);
    const title = grab('k-product-tile__title');
    const subtitle = grab('k-product-tile__subtitle');
    const price = number(grab('k-price-tag__price'));
    if (!title || price === null) continue;
    const previousPrice = number(grab('k-price-tag__old-price'));
    offers.push({
      name: `${title} ${subtitle}`.trim(),
      package: grab('k-product-tile__unit-price'),
      price,
      previousPrice,
      referencePriceType: previousPrice !== null ? 'regular-price' : null,
      market: 'Kaufland Lohhof',
      status: 'offer'
    });
  }
  return offers;
}

function parseEdeka(html) {
  const offers = [];
  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)];
  for (const article of articles) {
    const block = article[1];
    if (!/data-dialog-action="open"/i.test(block) || !/Angebot:\s*<\/span>/i.test(block)) continue;
    const heading = (block.match(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/i) || [])[1];
    const name = text(heading).replace(/^Angebot:\s*/i, '');
    const appPrice = number((block.match(/App-Preis von\s+(\d+[.,]\d{2})\s*€/i) || [])[1]);
    const fixedPrice = number((block.match(/Festpreis von\s+(\d+[.,]\d{2})\s*€/i) || [])[1]);
    const discountedPrice = number((block.match(/Rabattierter Preis von\s+(\d+[.,]\d{2})\s*€/i) || [])[1]);
    const price = appPrice ?? fixedPrice ?? discountedPrice;
    if (!name || price === null) continue;
    const previousPrice = appPrice !== null ? (discountedPrice ?? fixedPrice) : null;
    offers.push({
      name,
      package: text((block.match(/<p[^>]*class="[^"]*\bline-clamp-2\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]),
      price,
      previousPrice,
      referencePriceType: previousPrice !== null ? 'non-app-offer' : null,
      market: 'EDEKA Morsestraße',
      status: appPrice !== null ? 'app-offer' : 'offer'
    });
  }
  if (offers.length) return offers;
  const cards = [...html.matchAll(/(?:<h3[^>]*>)?\s*Angebot:\s*([^<]+)<\/h3>([\s\S]*?)(?=(?:<h3[^>]*>)?\s*Angebot:|$)/gi)];
  for (const card of cards) {
    const priceMatch = card[2].match(/(?:Festpreis|App-Preis|Rabattierter Preis)\s+von\s+(\d+[.,]\d{2})\s*€/i);
    if (!priceMatch) continue;
    const previousPrice = number((card[2].match(/Niedrigster Gesamtpreis[^:]*:\s*(\d+[.,]\d{2})/i) || [])[1]);
    offers.push({
      name: text(card[1]),
      package: text((card[2].match(/(?:€<\/p>|€)([\s\S]{0,240})/i) || [])[1]),
      price: number(priceMatch[1]),
      previousPrice,
      referencePriceType: previousPrice !== null ? '30-day-low' : null,
      market: 'EDEKA Morsestraße',
      status: 'offer'
    });
  }
  return offers;
}

function parseRewe(html) {
  const offers = [];
  const tiles = [...html.matchAll(/<article\b[^>]*class="[^"]*\bcor-offer-renderer-tile\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
  for (const tile of tiles) {
    const block = tile[1];
    const titleAttribute = (block.match(/data-offer-title="([^"]+)"/i) || [])[1];
    const titleElement = (block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1];
    const priceElement = (block.match(/class="[^"]*\bcor-offer-price__tag-price\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const name = text(titleAttribute || titleElement);
    const price = number(text(priceElement));
    const oldPriceElement = (block.match(/class="[^"]*\bcor-offer-price__tag-(?:old|original)-price\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const previousPrice = number(text(oldPriceElement));
    const packageParts = [...block.matchAll(/class="[^"]*\bcor-offer-information__additional\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(match => text(match[1]));
    if (!name || price === null) continue;
    offers.push({
      name,
      package: packageParts.join(' '),
      price,
      previousPrice,
      referencePriceType: previousPrice !== null ? 'regular-price' : null,
      market: 'REWE Eching',
      status: 'offer'
    });
  }
  if (offers.length) return offers;
  for (const match of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]{0,600}?)(\d+[.,]\d{2})\s*€/gi)) {
    const name = text(match[1]);
    if (!name || /^Angebot/i.test(name)) continue;
    offers.push({
      name,
      package: text(match[2]),
      price: number(match[3]),
      previousPrice: null,
      referencePriceType: null,
      market: 'REWE Eching',
      status: 'offer'
    });
  }
  return offers;
}

function filterAllowedOffers(offers) {
  return offers.filter(offer => !FORBIDDEN.test(offer.name));
}

function words(value) {
  return new Set(String(value).toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 3));
}

function selectRecipes(recipes, offers, limit = 4) {
  const allowed = recipes.filter(recipe => !FORBIDDEN.test(`${recipe.name} ${(recipe.ingredients || []).join(' ')}`));
  const offerWords = offers.map(offer => words(offer.name));
  return allowed
    .map((recipe, index) => {
      const recipeWords = words(`${recipe.name} ${(recipe.ingredients || []).join(' ')}`);
      let matches = 0;
      for (const set of offerWords) for (const word of recipeWords) if (set.has(word)) matches++;
      return { recipe, score: matches * 10 + (recipe.rating || 0) + (OWN_BRANDS.test(recipe.name) ? 0.25 : 0), index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(entry => entry.recipe);
}

function applyBrowserCache(results, cache, maxAgeMs = 8 * 24 * 60 * 60 * 1000) {
  if (!cache || !Array.isArray(cache.sources)) return results;
  const age = Date.now() - new Date(cache.capturedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return results;
  return results.map(result => {
    const cached = cache.sources.find(source => source.market === result.market);
    if (!cached?.offers?.length) return result;
    const allowedCached = filterAllowedOffers(cached.offers);
    if (result.offers.length >= allowedCached.length) return result;
    return { ...result, offers: allowedCached, status: 'browser-cached', error: null };
  });
}

async function hydrateReweHtml(html, options = {}) {
  const nans = [...new Set([...html.matchAll(/data-offer-nan="(\d+)"/gi)].map(match => match[1]))];
  if (!nans.length) return html;
  const wwIdent = (html.match(/data-offer-wwident="(\d+)"/i) || [])[1] || '440303';
  const fetcher = options.fetch || fetch;
  const pageUrl = 'https://www.rewe.de/angebote/eching/440303/rewe-markt-schlesierstr-4/';
  const batches = [];
  for (let index = 0; index < nans.length; index += 40) batches.push(nans.slice(index, index + 40));
  const hydrated = await Promise.all(batches.map(async (batch, batchIndex) => {
    const payload = batch.map((nan, itemIndex) => ({
      id: `kochbuch-${batchIndex}-${itemIndex}-${nan}`,
      name: 'offer-tile-by-nan',
      namespace: 'cor',
      params: {
        nan,
        wwIdent,
        heroStyles: 'false',
        showDuration: 'auto',
        enableDetailDeeplink: 'true'
      }
    }));
    const response = await fetcher('https://www.rewe.de/api/frontend-includes', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'rd-client-href': pageUrl,
        'user-agent': 'Mozilla/5.0 (compatible; Feierabend-Kochbuch/1.0)'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`REWE-Produktabruf HTTP ${response.status}`);
    return (await response.json()).map(item => item.content || '').join('\n');
  }));
  return `${html}\n${hydrated.join('\n')}`;
}

async function importOfferHtml({ market, html, dataDir = process.env.DATA_DIR || path.join(ROOT, 'runtime-data') }) {
  const parsers = {
    'REWE Eching': parseRewe,
    'EDEKA Morsestraße': parseEdeka,
    'Kaufland Lohhof': parseKaufland
  };
  const parser = parsers[market];
  if (!parser) throw new Error('Unbekannter Markt');
  let importedHtml = html;
  let hydrated = false;
  if (market === 'REWE Eching') {
    try {
      importedHtml = await hydrateReweHtml(html);
      hydrated = importedHtml.length > html.length;
    } catch {
      // The visible Chrome tiles are still useful if the optional full lookup fails.
    }
  }
  const parsedOffers = filterAllowedOffers(parser(importedHtml));
  const offers = [...new Map(parsedOffers.map(offer => [`${offer.name}|${offer.price}`, offer])).values()];
  if (!offers.length) throw new Error('Keine Angebote in der gespeicherten HTML-Datei erkannt');
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'browser-offers.json');
  let cache = { capturedAt: new Date().toISOString(), sources: [] };
  if (fs.existsSync(file)) {
    try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }
  cache.capturedAt = new Date().toISOString();
  cache.sources = (cache.sources || []).filter(source => source.market !== market);
  cache.sources.push({ market, offers });
  fs.writeFileSync(file, JSON.stringify(cache, null, 2));
  return { market, count: offers.length, hydrated };
}

function looksLikeChallenge({ title = '', bodyText = '' }) {
  return /just a moment|einen moment|security verification|verifying you are human|bestätigen.{0,30}mensch/i
    .test(`${title} ${bodyText}`);
}

async function directFetch(url) {
  return fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'de-DE,de;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; Feierabend-Kochbuch/1.0)'
    },
    signal: AbortSignal.timeout(30000)
  });
}

async function browserFetchHtml(url, options = {}) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('Browser-Fallback nicht installiert: npm install und npx playwright install chromium ausführen');
  }
  const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]+/gi, '-');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(ROOT, 'runtime-data');
  const profileDir = path.join(dataDir, 'browser-profiles', hostname);
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options.headless ?? process.env.PLAYWRIGHT_HEADLESS !== 'false',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1440, height: 1000 }
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const visibleState = async () => ({
      title: await page.title(),
      bodyText: await page.locator('body').innerText().catch(() => '')
    });
    let challenged = (response && response.status() === 403) || looksLikeChallenge(await visibleState());
    if (options.manual && challenged) {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        challenged = looksLikeChallenge(await visibleState());
        if (!challenged) break;
        await page.waitForTimeout(2000);
      }
    } else if (challenged) {
      await page.waitForTimeout(10000);
    }
    const html = await page.content();
    if (looksLikeChallenge(await visibleState())) {
      throw new Error('Browserprüfung wartet auf einmalige manuelle Bestätigung');
    }
    return html;
  } finally {
    await context.close();
  }
}

async function fetchWithBrowserFallback(url, options = {}) {
  const fetchDirect = options.directFetch || directFetch;
  const fetchBrowser = options.browserFetch || (target => browserFetchHtml(target, options));
  try {
    const response = await fetchDirect(url);
    if (response.ok) {
      const html = await response.text();
      if (!/access denied|cf-chl-|cf-mitigated/i.test(html)) return html;
    } else if (response.status !== 403 && response.status !== 429) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    if (!/HTTP (403|429)/.test(error.message) && options.browserFetch === undefined) {
      throw error;
    }
  }
  return fetchBrowser(url);
}

async function refreshPlan(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(ROOT, 'runtime-data');
  const target = path.join(dataDir, 'current-plan.json');
  const sources = [
    {
      market: 'Kaufland Lohhof',
      url: 'https://filiale.kaufland.de/service/filiale.storeName%3DDE1820.html',
      parse: parseKaufland
    },
    {
      market: 'EDEKA Morsestraße',
      url: 'https://www.edeka.de/maerkte/234100/',
      parse: parseEdeka
    },
    {
      market: 'REWE Eching',
      url: 'https://www.rewe.de/angebote/eching/440303/rewe-markt-schlesierstr-4/',
      parse: parseRewe
    }
  ];
  const fetcher = options.fetchHtml || (url => fetchWithBrowserFallback(url, { dataDir }));
  let results = await Promise.all(sources.map(async source => {
    try {
      const offers = filterAllowedOffers(source.parse(await fetcher(source.url)));
      return { ...source, offers, status: offers.length ? 'current' : 'current-limited', error: null };
    } catch (error) {
      return { ...source, offers: [], status: 'error', error: error.message };
    }
  }));
  const browserCacheFile = path.join(dataDir, 'browser-offers.json');
  if (fs.existsSync(browserCacheFile)) {
    try {
      results = applyBrowserCache(results, JSON.parse(fs.readFileSync(browserCacheFile, 'utf8')));
    } catch {
      // A damaged optional browser cache must not block the regular refresh.
    }
  }
  const offers = results.flatMap(result => result.offers);
  const baseSource = options.planFile || process.env.PLAN_FILE || (fs.existsSync(target) ? target : DEFAULT_PLAN);
  const base = JSON.parse(fs.readFileSync(baseSource, 'utf8'));
  const refreshedBase = {
    ...base,
    generatedAt: new Date().toISOString(),
    sources: base.sources.map(source => {
      const result = results.find(item => item.market === source.market);
      return {
        ...source,
        status: result?.status || 'error',
        offerCount: result?.offers.length || 0,
        error: result?.error || null,
        coverage: result?.offers.length
          ? `${result.offers.length} maschinenlesbare Angebote; Eigenmarken und Preisverlauf werden mitberücksichtigt`
          : 'Quelle erreichbar, aber keine vollständige maschinenlesbare Liste'
      };
    }),
    offerSnapshot: offers
  };
  const draft = generateOfferPlan({
    recipes,
    offers,
    basePlan: refreshedBase,
    now: options.now || new Date(),
    variation: options.variation ?? 0,
    excludedIngredients: options.excludedIngredients ?? base.preferences?.excludedIngredients
  });
  const queries = collectNeededQueries(draft, recipes);
  const fetchRegularPrices = options.fetchRegularPrices || fetchTargetedRegularPrices;
  let regularResult = { records: [], coverage: [] };
  try {
    regularResult = await fetchRegularPrices({
      queries,
      dataDir,
      now: options.now || new Date(),
      ...(options.fetchRegularHtml ? { fetchHtml: options.fetchRegularHtml } : {})
    });
  } catch {
    // Öffentliche Normalpreise ergänzen den Angebotslauf, dürfen ihn aber nie blockieren.
  }
  const sourcesWithRegularCoverage = refreshedBase.sources.map(source => {
    const coverage = regularResult.coverage.find(item => item.market === source.market);
    if (!coverage) return { ...source, regularPriceCount: 0, regularPriceStatus: 'not-checked' };
    return {
      ...source,
      regularPriceCount: coverage.confirmed,
      regularPriceStatus: coverage.status,
      coverage: `${source.coverage}; ${coverage.confirmed}/${coverage.requested} benötigte Normalpreise öffentlich gefunden`
    };
  });
  const plan = generateOfferPlan({
    recipes,
    offers,
    regularPrices: regularResult.records,
    basePlan: {
      ...refreshedBase,
      sources: sourcesWithRegularCoverage,
      regularPriceSnapshot: regularResult.records
    },
    now: options.now || new Date(),
    variation: options.variation ?? 0,
    excludedIngredients: options.excludedIngredients ?? base.preferences?.excludedIngredients
  });
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(plan, null, 2));
  fs.renameSync(temporary, target);
  return plan;
}

function regeneratePlan(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(ROOT, 'runtime-data');
  const target = path.join(dataDir, 'current-plan.json');
  const source = fs.existsSync(target) ? target : (options.planFile || process.env.PLAN_FILE || DEFAULT_PLAN);
  const current = JSON.parse(fs.readFileSync(source, 'utf8'));
  const plan = generateOfferPlan({
    recipes,
    offers: current.offerSnapshot || [],
    regularPrices: current.regularPriceSnapshot || [],
    basePlan: current,
    now: options.now || new Date(),
    variation: options.variation ?? (Number(current.planRevision) || 0) + 1,
    excludedIngredients: options.excludedIngredients ?? current.preferences?.excludedIngredients
  });
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(plan, null, 2));
  fs.renameSync(temporary, target);
  return plan;
}

if (require.main === module) {
  refreshPlan()
    .then(plan => console.log(`Wochenlauf fertig: ${plan.offerSnapshot.length} Angebote erfasst.`))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  parseKaufland,
  parseEdeka,
  parseRewe,
  filterAllowedOffers,
  selectRecipes,
  applyBrowserCache,
  hydrateReweHtml,
  importOfferHtml,
  looksLikeChallenge,
  fetchWithBrowserFallback,
  browserFetchHtml,
  refreshPlan,
  regeneratePlan
};
