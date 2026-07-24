'use strict';

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

module.exports = {
  collectNeededQueries,
  parsePublicProducts,
  chooseMatchingPrice,
  queryFor
};

