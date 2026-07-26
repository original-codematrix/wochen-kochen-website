'use strict';

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function allocateDays(recipeIds, dayNames) {
  if (!Array.isArray(recipeIds) || recipeIds.length === 0) return [];
  return dayNames.map((day, index) => ({
    day,
    recipeId: recipeIds[index % recipeIds.length]
  }));
}

function subtractPantry(items, pantry) {
  const stock = new Map(
    pantry.map(item => [`${item.name.toLowerCase()}|${item.unit}`, Number(item.quantity) || 0])
  );
  return items.flatMap(item => {
    const key = `${item.name.toLowerCase()}|${item.unit}`;
    const remaining = Math.max(0, Number(item.quantity) - (stock.get(key) || 0));
    return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
  });
}

function recommendMarket({ baskets, splitTotal, threshold = 20 }) {
  const eligible = baskets
    .filter(basket => basket.coverage === 1)
    .sort((a, b) => a.total - b.total);
  if (eligible.length === 0) {
    return { mode: 'unavailable', savingsBySplitting: 0 };
  }
  const best = eligible[0];
  const savings = roundMoney(best.total - splitTotal);
  if (savings >= threshold && savings / best.total >= 0.15) {
    return { mode: 'split', market: null, savingsBySplitting: savings };
  }
  return { mode: 'single', market: best.market, savingsBySplitting: Math.max(0, savings) };
}

const FORBIDDEN = /\b(fisch|lachs|forelle|thun|kabeljau|seelachs|hering|matjes|makrele|sardine|dorade|zander|karpfen|pangasius|schlemmer.?filet|garnel|shrimp|scampi|hummer|muschel|auster|tintenfisch|calamari|oktopus|seafood|meeresfr|krabbe|surimi|rollmops|anchovis|sardelle)/i;
const EXCLUSION_GROUPS = {
  milch: /(milch|sahne|käse|joghurt|butter|parmesan|mozzarella|béchamel|frischkäse|quark|schmand|crème fraîche)/i,
  milchprodukte: /(milch|sahne|käse|joghurt|butter|parmesan|mozzarella|béchamel|frischkäse|quark|schmand|crème fraîche)/i,
  laktose: /(milch|sahne|käse|joghurt|butter|parmesan|mozzarella|béchamel|frischkäse|quark|schmand|crème fraîche)/i,
  pilz: /(pilz|champignon)/i,
  pilze: /(pilz|champignon)/i
};
const CATEGORY_RULES = [
  ['nuggets', /\b(nuggets?|wings?|flügel|crispy)\b/i, 8],
  ['chicken', /(hähnchen|chicken|geflügel|pute)/i, 11.99],
  ['beef', /(rind|hackfleisch|rinderhack|hack)/i, 12.99],
  ['pork', /(schwein|nacken|medaillon)/i, 8.99],
  ['leberkaese', /(leberkäse|leberkas)/i, 10],
  ['sausage', /(bratwurst|würstchen)/i, 9],
  ['ham', /(kochschinken|hinterschinken|schinken)/i, 10],
  ['pizza', /\b(pizza(?:s)?|pizzen|pizzies|flammkuchen)\b/i, 8],
  ['pasta', /\b(pasta|nudeln?|penne|fusilli|rigatoni|spaghetti|mie|spätzle|lasagneplatten)\b/i, 2.6],
  ['gnocchi', /\bgnocchi\b/i, 4],
  ['rice', /\b(reis|basmati)\b/i, 3],
  ['fries', /\b(pommes)\b/i, 3],
  ['potato', /(kartoffel)/i, 2],
  ['broccoli', /(brokkoli)/i, 4],
  ['spinach', /(spinat)/i, 3.5],
  ['eggs', /\b(eier?|spiegelei)\b/i, 3],
  ['wraps', /\b(wrap|burgerbrötchen)\b/i, 5],
  ['cheese', /\b(käse|parmesan|feta|mozzarella)\b/i, 10],
  ['yogurt', /\b(joghurt)\b/i, 3],
  ['cream', /\b(kochsahne|sahne|frischkäse|béchamel)\b/i, 5],
  ['cucumber', /(gurke)/i, 1],
  ['tomatoes', /(tomat)/i, 3],
  ['onions', /(zwiebel)/i, 2],
  ['peas', /(erbse)/i, 3],
  ['lentils', /(linse)/i, 4],
  ['carrots', /(möhre|karotte)/i, 2.5],
  ['peppers', /(paprika)/i, 4],
  ['coconut', /\b(kokosmilch)\b/i, 4]
];

function categoryFor(value) {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(String(value)))?.[0] || null;
}

function normalizeExclusions(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
  const seen = new Set();
  return values.flatMap(raw => {
    const item = String(raw).trim();
    const key = item.toLocaleLowerCase('de-DE');
    if (!item || seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
}

function recipeMatchesExclusion(recipe, exclusion) {
  const text = `${recipe.name} ${(recipe.ingredients || []).join(' ')} ${(recipe.tags || []).join(' ')} ${(recipe.allergens || []).join(' ')}`;
  const key = exclusion.toLocaleLowerCase('de-DE');
  const grouped = EXCLUSION_GROUPS[key];
  if (grouped) return grouped.test(text);
  const escaped = exclusion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(text);
}

function amountForIngredient(value, category, portionScale = 1) {
  const match = String(value).match(/(\d+(?:[.,]\d+)?)\s*(?:TK[- ]*)?(kg|g|ml|l|stück|packungen?|pizzas?|pizzen)/i);
  if (!match) return { amount: 1, unit: ['pizza', 'wraps', 'cucumber'].includes(category) ? 'piece' : 'unknown' };
  const amount = Number(match[1].replace(',', '.')) * portionScale;
  const unit = match[2].toLowerCase();
  if (unit === 'kg' || unit === 'l') return { amount: amount * 1000, unit: 'base' };
  if (unit === 'g' || unit === 'ml') return { amount, unit: 'base' };
  return { amount, unit: 'piece' };
}

function offerCost(offer, ingredient, category, portionScale = 1) {
  const needed = amountForIngredient(ingredient, category, portionScale);
  const packageText = offer.package || '';
  const packageAmount = packageText.match(/(?:je\s*)?(\d+(?:[.,]\d+)?)\s*[- ]?(kg|g|ml|l)\b/i);
  if (packageAmount && needed.unit === 'base') {
    let size = Number(packageAmount[1].replace(',', '.'));
    if (/kg|l/i.test(packageAmount[2])) size *= 1000;
    return roundMoney(Math.max(1, Math.ceil(needed.amount / size)) * Number(offer.price));
  }
  const unitPrice = packageText.match(/1\s*(?:kg|l)\s*=\s*€?\s*(\d+[.,]\d{2})/i);
  if (unitPrice && needed.unit === 'base') {
    return roundMoney((needed.amount / 1000) * Number(unitPrice[1].replace(',', '.')));
  }
  return roundMoney(Math.max(1, needed.unit === 'piece' ? Math.ceil(needed.amount) : 1) * Number(offer.price));
}

function baselineCost(ingredient, category, portionScale = 1) {
  const config = CATEGORY_RULES.find(([name]) => name === category);
  const needed = amountForIngredient(ingredient, category, portionScale);
  if (!config) return 0;
  if (needed.unit === 'base') return roundMoney((needed.amount / 1000) * config[2]);
  return roundMoney(config[2] * Math.max(1, needed.amount));
}

const MEAT_CATEGORIES = new Set(['chicken', 'beef', 'pork']);
const MEAT_CUT_RULES = [
  [/nacken.*steak|steak.*nacken/i, [/nacken/i, /steak/i]],
  [/wings?|flügel/i, [/(wings?|flügel)/i]],
  [/nuggets?/i, [/nuggets?/i]],
  [/brust(?:filet)?/i, [/brust/i]],
  [/keule|schenkel/i, [/(keule|schenkel)/i]],
  [/schnitzel/i, [/schnitzel/i]],
  [/geschnetzel/i, [/geschnetzel/i]],
  [/medaillon/i, [/(medaillon|filet)/i]],
  [/filet/i, [/filet/i]],
  [/hack/i, [/hack/i]],
  [/nacken/i, [/nacken/i]],
  [/steak/i, [/steak/i]],
  [/braten/i, [/braten/i]]
];

function isOfferSuitable(ingredient, category, offerName) {
  const name = String(offerName);
  const broth = /(brühe|fond)/i;
  if (broth.test(String(ingredient)) !== broth.test(name)) return false;
  const cutRule = MEAT_CUT_RULES.find(([ingredientPattern]) => ingredientPattern.test(String(ingredient)));
  if ((MEAT_CATEGORIES.has(category) || category === 'nuggets') && cutRule) {
    if (!cutRule[1].every(offerPattern => offerPattern.test(name))) return false;
  }
  if (category === 'chicken') {
    if (/(salat|aufschnitt|wurst|suppe|fertiggericht|ramen)/i.test(name)) return false;
    if (!cutRule && /(wing|flügel|nugget|schenkel|keule)/i.test(name)) return false;
    if (/(burger|pattie)/i.test(ingredient) && !/(burger|pattie)/i.test(name)) return false;
  }
  if (category === 'cucumber') {
    const pickled = /(gewürz|essig|cornichon|eingelegt)/i;
    if (pickled.test(ingredient)) return pickled.test(name);
    if (pickled.test(name)) return false;
  }
  if (category === 'rice' && /(milch\s*reis|pudding|dessert|waffel)/i.test(name)) return false;
  if (category === 'cheese' && /(chips|snack|soße|sauce)/i.test(name)) return false;
  if (category === 'pasta' && /(salat|fertiggericht|terrine|soße|sauce|spaghetteria|spinaci|ramen)/i.test(name)) return false;
  if (/spätzle/i.test(ingredient) && !/spätzle/i.test(name)) return false;
  if (/lasagne/i.test(ingredient) && !/lasagne/i.test(name)) return false;
  if (/\bmie\b/i.test(ingredient) && !/\bmie\b/i.test(name)) return false;
  if (category === 'potato' && /kartoffel/i.test(ingredient) && /pommes/i.test(name)) return false;
  if (/parmesan/i.test(ingredient) && !/parmesan/i.test(name)) return false;
  if (/feta/i.test(ingredient)) return /feta/i.test(name);
  if (/mozzarella/i.test(ingredient)) return /mozzarella/i.test(name);
  if (category === 'cheese' && /\b(blu|weichkäse|camembert|feta|mozzarella)\b/i.test(name)) return false;
  return true;
}

function evaluateRecipe(recipe, marketOffers, marketRegularPrices = []) {
  const portionScale = 2 / (Number(recipe.servings) || 4);
  const ingredients = (recipe.ingredients || [])
    .map((raw, index) => ({ id: `${recipe.id}:${index}`, raw, category: categoryFor(raw) }))
    .filter(ingredient => !/\boptional\b/i.test(ingredient.raw));
  const matches = [];
  for (const ingredient of ingredients) {
    if (!ingredient.category) continue;
    const offerCandidates = marketOffers
      .filter(offer => categoryFor(offer.name) === ingredient.category)
      .filter(offer => isOfferSuitable(ingredient.raw, ingredient.category, `${offer.name} ${offer.package || ''}`))
      .map(offer => ({
        offer,
        ingredient,
        sourceType: offer.status === 'app-offer' ? 'app-offer' : 'offer',
        cost: offerCost(offer, ingredient.raw, ingredient.category, portionScale),
        regularCost: Number(offer.previousPrice) > 0
          ? offerCost({ ...offer, price: offer.previousPrice }, ingredient.raw, ingredient.category, portionScale)
          : null
      }));
    const regularCandidates = marketRegularPrices
      .filter(record => categoryFor(`${record.query || ''} ${record.name || ''}`) === ingredient.category)
      .filter(record => isOfferSuitable(ingredient.raw, ingredient.category, `${record.name} ${record.package || ''}`))
      .map(record => ({
        offer: record,
        ingredient,
        sourceType: record.priceType === 'stale-regular' ? 'stale-regular' : 'regular',
        cost: offerCost(record, ingredient.raw, ingredient.category, portionScale),
        regularCost: null
      }));
    const candidates = offerCandidates.concat(regularCandidates)
      .sort((a, b) => a.cost - b.cost || Number(!/offer/.test(a.sourceType)) - Number(!/offer/.test(b.sourceType)));
    if (candidates[0]) matches.push(candidates[0]);
  }
  const savings = matches.reduce((sum, match) => (
    sum + Math.max(0, baselineCost(match.ingredient.raw, match.ingredient.category, portionScale) - match.cost)
  ), 0);
  const scaledRecipeCost = Number(recipe.cost) * portionScale;
  const estimatedCost = roundMoney(Math.max(scaledRecipeCost * 0.55, scaledRecipeCost - savings));
  return {
    recipe,
    ingredients,
    matches,
    estimatedCost,
    rank: estimatedCost - matches.length * 8 - (Number(recipe.rating) || 4) * 0.4
  };
}

function rotatedSelection(evaluations, variation, limit = 4) {
  const sorted = evaluations.slice().sort((a, b) => a.rank - b.rank || a.recipe.id.localeCompare(b.recipe.id));
  const pool = sorted.slice(0, Math.min(8, sorted.length));
  if (!pool.length) return [];
  const offset = Math.abs(Number(variation) || 0) % pool.length;
  const rotated = pool.slice(offset).concat(pool.slice(0, offset));
  const ordered = rotated.concat(sorted.slice(pool.length));
  const target = Math.min(limit, sorted.length);
  if (target < 4) return ordered.slice(0, target);
  const meatPattern = /(hähnchen|chicken|geflügel|pute|rind|hack|schwein|nacken|medaillon|leberkäse|leberkas|schinken|bratwurst|schnitzel|steak|wings?|nuggets?|gyros|fleisch)/i;
  const isMeat = candidate => meatPattern.test(`${candidate.recipe.name} ${(candidate.recipe.ingredients || []).join(' ')}`);
  const selected = [];
  const canAdd = (candidate, allowCategoryRepeat = false) => (
    !selected.some(item => item.recipe.id === candidate.recipe.id)
    && (allowCategoryRepeat || !selected.some(item => item.recipe.cat === candidate.recipe.cat))
  );
  const add = (candidate, allowCategoryRepeat = false) => {
    if (!candidate || !canAdd(candidate, allowCategoryRepeat)) return false;
    selected.push(candidate);
    return true;
  };
  const minimumMeatFree = Math.ceil(target / 2);
  const maximumMeat = Math.floor(target / 2);
  add(ordered.find(candidate => candidate.recipe.cat === 'Nudeln'));
  for (const candidate of ordered) {
    if (selected.filter(item => !isMeat(item)).length >= minimumMeatFree) break;
    if (!isMeat(candidate)) add(candidate);
  }
  for (const candidate of ordered) {
    if (isMeat(candidate) && selected.filter(isMeat).length >= maximumMeat) continue;
    add(candidate);
    if (selected.length === target) break;
  }
  for (const candidate of ordered) {
    if (selected.length === target) break;
    if (isMeat(candidate) && selected.filter(isMeat).length >= maximumMeat) continue;
    add(candidate, true);
  }
  for (const candidate of ordered) {
    if (selected.length === target) break;
    add(candidate, true);
  }
  return selected;
}

function dateLabel(date, prefix) {
  return `${prefix} ${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date)}`;
}

function nextMonday(now) {
  const date = new Date(now);
  const days = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

function reasonFor(evaluation, market, repeated = false) {
  if (repeated) return `Restetag: Die zweite Hälfte der vier Portionen wird aufgebraucht.`;
  const names = evaluation.matches.slice(0, 2).map(match => `${match.offer.name} für ${match.offer.price.toFixed(2).replace('.', ',')} €`);
  return names.length
    ? `${names.join(' und ')} sind passende Angebote bei ${market}.`
    : `Geschmacklich starke Auswahl; fehlende Normalpreise werden transparent als Schätzung geführt.`;
}

const SHOPPING_DEPARTMENTS = [
  'Fleisch & Frischetheke',
  'Obst & Gemüse',
  'Kühlregal & Tiefkühl',
  'Nudeln, Reis & Beilagen',
  'Soßen, Gewürze & Vorrat',
  'Weitere Zutaten'
];

function shoppingDepartment(item) {
  const name = String(item.name || '').toLocaleLowerCase('de-DE');
  const category = item.category || '';
  if (
    /(?:brühe|fond|öl|senf|stärke|soße|sauce|dip|dressing|gewürze?|paprikapulver|curry(?:pulver)?|pfeffer|kräuter?|rosmarin|hoisin|pesto|honig|sesam)(?!\p{L})/iu.test(name)
  ) {
    return 'Soßen, Gewürze & Vorrat';
  }
  if (['chicken', 'beef', 'pork', 'nuggets', 'leberkaese', 'sausage', 'ham'].includes(category)) {
    return 'Fleisch & Frischetheke';
  }
  if (/\b(?:tk|tiefkühl)/i.test(name)) return 'Kühlregal & Tiefkühl';
  if (
    ['pizza', 'cheese', 'eggs', 'yogurt', 'cream'].includes(category)
    || /\b(?:milch|butter|quark|ei(?:er)?|käsetortellini|frosta|fertiggericht)\b/i.test(name)
  ) {
    return 'Kühlregal & Tiefkühl';
  }
  if (
    ['cucumber', 'tomatoes', 'onions', 'broccoli', 'spinach', 'carrots', 'peppers'].includes(category)
    || /\b(?:gurke|zwiebeln?|knoblauch(?:zehen?)?|zucchini|zitrone|paprika|brokkoli|spinat|karotten?|möhren?|salat|asia-gemüse|champignons?)\b/i.test(name)
  ) return 'Obst & Gemüse';
  if (
    ['pasta', 'gnocchi', 'rice', 'potato', 'fries', 'lentils', 'peas', 'wraps'].includes(category)
    || /\b(?:couscous|paniermehl|basmatireis|bandnudeln|wraps?)\b/i.test(name)
  ) return 'Nudeln, Reis & Beilagen';
  if (category === 'coconut') return 'Soßen, Gewürze & Vorrat';
  return 'Weitere Zutaten';
}

function buildShopping(selected, market) {
  const pricedItems = new Map();
  const estimatedItems = new Map();
  for (const [batchIndex, evaluation] of selected.entries()) {
    const coverageId = ingredient => `${batchIndex}|${ingredient.id}`;
    for (const match of evaluation.matches) {
      const key = `${match.offer.name}|${match.offer.price}|${match.sourceType}`;
      const existing = pricedItems.get(key) || {
        offer: match.offer,
        sourceType: match.sourceType,
        ingredientIds: [],
        count: 0,
        total: 0,
        regularTotal: 0,
        regularCount: 0,
        category: match.ingredient.category
      };
      existing.ingredientIds.push(coverageId(match.ingredient));
      existing.count += 1;
      existing.total = roundMoney(existing.total + match.cost);
      if (match.regularCost !== null) {
        existing.regularTotal = roundMoney(existing.regularTotal + match.regularCost);
        existing.regularCount += 1;
      }
      pricedItems.set(key, existing);
    }
    const matchedIngredientIds = new Set(evaluation.matches.map(match => coverageId(match.ingredient)));
    for (const ingredient of evaluation.ingredients.filter(item => !matchedIngredientIds.has(coverageId(item)))) {
      const cleanName = ingredient.raw.replace(/^\s*\d+(?:[.,]\d+)?\s*(?:TK[- ]*)?(?:(?:kg|g|ml|l|stück|packungen?)\b)?\s*/i, '') || ingredient.raw;
      const key = `${ingredient.category || 'uncategorized'}|${cleanName.toLocaleLowerCase('de-DE')}`;
      const price = baselineCost(ingredient.raw, ingredient.category, 2 / (Number(evaluation.recipe.servings) || 4));
      const existing = estimatedItems.get(key) || {
        name: cleanName,
        category: ingredient.category,
        ingredientIds: [],
        rawQuantities: [],
        count: 0,
        price: null,
        status: 'estimated',
        note: `Normalpreise bei ${market} am Regal prüfen`
      };
      existing.ingredientIds.push(coverageId(ingredient));
      existing.count += 1;
      existing.rawQuantities.push(ingredient.raw);
      if (price > 0) existing.price = roundMoney((existing.price || 0) + price);
      estimatedItems.set(key, existing);
    }
  }
  const finishedPricedItems = [...pricedItems.values()].map(item => {
    const regularPrice = item.regularCount === item.count ? item.regularTotal : null;
    const savings = regularPrice !== null ? roundMoney(Math.max(0, regularPrice - item.total)) : null;
    const isPublicRegular = item.sourceType === 'regular' || item.sourceType === 'stale-regular';
    const capturedLabel = item.offer.capturedAt
      ? new Intl.DateTimeFormat('de-DE').format(new Date(item.offer.capturedAt))
      : null;
    return {
      name: item.offer.name,
      category: item.category,
      ingredientIds: [...new Set(item.ingredientIds)],
      quantity: `für ${item.count} Gericht${item.count === 1 ? '' : 'e'} · ${item.offer.package || 'Angebotspackung'}`,
      price: item.total,
      regularPrice,
      savings,
      priceType: item.sourceType,
      referencePriceType: item.offer.referencePriceType || null,
      status: item.sourceType,
      sourceUrl: item.offer.sourceUrl || null,
      capturedAt: item.offer.capturedAt || null,
      note: isPublicRegular
        ? item.sourceType === 'stale-regular'
          ? `Öffentlicher Preis bei ${market}, zuletzt gesehen am ${capturedLabel}`
          : `Normalpreis bei ${market} öffentlich geprüft${capturedLabel ? ` am ${capturedLabel}` : ''}`
        : regularPrice !== null
          ? `${item.sourceType === 'app-offer' ? 'App-Angebot' : 'Angebot'} bei ${market} statt veröffentlichtem Vergleichspreis ${regularPrice.toFixed(2).replace('.', ',')} €`
          : `${item.sourceType === 'app-offer' ? 'App-Angebot' : 'Angebot'} bei ${market}`
    };
  });
  const finishedEstimatedItems = [...estimatedItems.values()].map(item => ({
    ...item,
    ingredientIds: [...new Set(item.ingredientIds)],
    quantity: `${[...new Set(item.rawQuantities)].join(' + ')} · ${item.count} Kochblock${item.count === 1 ? '' : 'e'}`
  }));
  const allItems = [...finishedPricedItems, ...finishedEstimatedItems];
  return SHOPPING_DEPARTMENTS.flatMap(department => {
    const items = allItems.filter(item => shoppingDepartment(item) === department);
    return items.length ? [{ department, items }] : [];
  });
}

function assertCompleteShopping(selected, shopping) {
  const expected = selected.flatMap((evaluation, batchIndex) => (
    evaluation.ingredients.map(ingredient => `${batchIndex}|${ingredient.id}`)
  ));
  const covered = shopping.flatMap(group => group.items).flatMap(item => item.ingredientIds || []);
  if (
    covered.length !== expected.length
    || new Set(covered).size !== expected.length
    || expected.some(id => !covered.includes(id))
  ) {
    throw new Error('Einkaufsliste unvollständig: Pflichtzutaten konnten nicht eindeutig zugeordnet werden');
  }
}

function buildMealPrepPlan({ recipes, nextWeek }) {
  const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const cookingDays = (nextWeek || []).filter((day, index, days) => (
    index === 0 || day.recipeId !== days[index - 1].recipeId
  ));
  const batches = cookingDays.flatMap((day, index) => {
    const recipe = recipeMap.get(day.recipeId);
    if (!recipe) return [];
    const freezeNote = String(recipe.freeze || 'Nicht angegeben');
    const cannotFreeze = /\b(nein|nicht einfrieren)\b/i.test(freezeNote);
    const hasFreshPart = /\bfrisch\b/i.test(freezeNote);
    const alreadyFrozen = /\b(bereits\s+(?:tiefgekühlt|tk)|tiefgekühlt lassen)\b/i.test(freezeNote);
    const rawFreezable = /\broh\b.*\beinfrier/i.test(freezeNote);
    const storage = alreadyFrozen
      ? 'Tiefgekühlt lassen'
      : rawFreezable || (index > 0 && hasFreshPart)
        ? 'Teilweise einfrieren'
        : index === 0
          ? 'Kühlschrank'
          : cannotFreeze
            ? 'Frisch zubereiten'
            : 'Gefrierschrank';
    const prepActions = (recipe.steps || [])
      .filter(step => !hasFreshPart || !/(spiegelei|röstzwiebel|soße)/i.test(step))
      .slice(0, 3)
      .join(' ');
    let instruction;
    if (alreadyFrozen) {
      instruction = `Tiefkühlware bis zum ${day.day} im Gefrierschrank lassen; Beilage und frische Bestandteile erst am Esstag vorbereiten.`;
    } else if (rawFreezable) {
      instruction = `Fleisch am Einkaufstag roh portionieren und einfrieren. Am Vorabend von ${day.day} im Kühlschrank auftauen; Kartoffeln und frische Beilagen am Esstag zubereiten.`;
    } else if (storage === 'Kühlschrank') {
      instruction = `${prepActions} Zwei Portionen rasch abkühlen und bis ${day.day} kalt stellen.`;
    } else if (storage === 'Teilweise einfrieren') {
      instruction = `Die laut Rezept einfrierbaren Komponenten am Einkaufstag portionieren und einfrieren. Am Vorabend von ${day.day} im Kühlschrank auftauen; alle übrigen Bestandteile am Esstag zubereiten.`;
    } else if (storage === 'Gefrierschrank') {
      instruction = `${prepActions} Zwei Portionen vollständig abkühlen, einfrieren und am Vorabend von ${day.day} im Kühlschrank auftauen.`;
    } else {
      instruction = `${prepActions} Zutaten portionieren und am ${day.day} frisch fertig garen.`;
    }
    if (hasFreshPart) instruction += ` Rezept-Hinweis: ${freezeNote}.`;
    return [{
      recipeId: recipe.id,
      name: recipe.name,
      day: day.day,
      storage,
      instruction,
      cookTime: alreadyFrozen ? 8 : rawFreezable ? 12 : Number(recipe.time) || 30,
      firstSteps: (recipe.steps || []).slice(0, 2)
    }];
  });
  let elapsed = 0;
  const timedSteps = batches.map(batch => {
    const duration = Math.max(10, Math.min(30, Math.round(batch.cookTime * 0.65)));
    const start = elapsed;
    elapsed += duration;
    return {
      time: `${start}–${elapsed} Min.`,
      title: batch.name,
      instruction: batch.instruction,
      storage: batch.storage,
      recipeId: batch.recipeId
    };
  });
  const finishStart = elapsed;
  elapsed += 10;
  const steps = [
    ...timedSteps,
    {
      time: `${finishStart}–${elapsed} Min.`,
      title: 'Portionieren & beschriften',
      instruction: 'Behälter mit Gericht, Portionenzahl und Esstag beschriften; Gefrierportionen erst vollständig abgekühlt einräumen.',
      storage: 'Organisation'
    }
  ];
  return {
    title: `Meal-Prep für ${batches.length} Kochblöcke`,
    summary: `${batches.length} Gerichte in sinnvoller Reihenfolge vorbereiten; spätere Mahlzeiten werden eingefroren, empfindliche Bestandteile frisch ergänzt.`,
    totalMinutes: elapsed,
    freezeCount: batches.filter(batch => /einfrieren|Gefrierschrank/i.test(batch.storage)).length,
    freshCount: batches.filter(batch => batch.storage === 'Frisch zubereiten' || /frisch/i.test(batch.instruction)).length,
    batches,
    steps
  };
}

function generateOfferPlan({ recipes, offers, regularPrices = [], basePlan, now = new Date(), variation = 0, excludedIngredients }) {
  const exclusions = normalizeExclusions(excludedIngredients ?? basePlan?.preferences?.excludedIngredients);
  const preferences = { ...(basePlan?.preferences || {}), excludedIngredients: exclusions };
  const allowedRecipes = recipes.filter(recipe => (
    !FORBIDDEN.test(`${recipe.name} ${(recipe.ingredients || []).join(' ')}`.replace(/\bohne\s+fisch\b/gi, ''))
    && !exclusions.some(exclusion => recipeMatchesExclusion(recipe, exclusion))
  ));
  const allowedOffers = offers.filter(offer => !FORBIDDEN.test(offer.name));
  const allowedRegularPrices = regularPrices.filter(record => !FORBIDDEN.test(record.name));
  const markets = [...new Set(allowedOffers.map(offer => offer.market))];
  if (!allowedRecipes.length || !markets.length) return { ...basePlan, preferences, computedFromOffers: false };
  const sundayDistance = (7 - now.getDay()) % 7;
  const weekendDayCount = sundayDistance + 1;
  const visibleDayCount = weekendDayCount + 7;
  const marketPlans = markets.map(market => {
    const marketOffers = allowedOffers.filter(offer => offer.market === market);
    const marketRegularPrices = allowedRegularPrices.filter(record => record.market === market);
    const selected = rotatedSelection(
      allowedRecipes.map(recipe => evaluateRecipe(recipe, marketOffers, marketRegularPrices)),
      variation,
      visibleDayCount
    );
    const total = roundMoney(selected.reduce((sum, item) => {
      const confirmed = item.matches.reduce((matchSum, match) => matchSum + match.cost, 0);
      return sum + Math.max(item.estimatedCost, confirmed);
    }, 0));
    return { market, selected, total };
  }).sort((a, b) => a.total - b.total || b.selected.reduce((sum, x) => sum + x.matches.length, 0) - a.selected.reduce((sum, x) => sum + x.matches.length, 0));
  const best = marketPlans[0];
  const selectedIds = best.selected.map(item => item.recipe.id);
  const monday = nextMonday(now);
  const weekdayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const nextWeekIds = selectedIds.slice(weekendDayCount, weekendDayCount + 7);
  const nextWeek = allocateDays(nextWeekIds.length ? nextWeekIds : selectedIds, weekdayNames.map((day, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dateLabel(date, day);
  })).map((day, index) => {
    const evaluation = best.selected.find(item => item.recipe.id === day.recipeId);
    return { ...day, reason: reasonFor(evaluation, best.market, false) };
  });
  const weekendNames = [];
  for (let index = 0; index <= sundayDistance; index++) {
    const date = new Date(now);
    date.setDate(now.getDate() + index);
    weekendNames.push(dateLabel(date, index === 0 ? 'Heute ·' : new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(date)));
  }
  const weekendIds = selectedIds.slice(0, weekendDayCount);
  const weekend = allocateDays(weekendIds.length ? weekendIds : selectedIds, weekendNames).map(day => {
    const evaluation = best.selected.find(item => item.recipe.id === day.recipeId);
    return { ...day, reason: reasonFor(evaluation, best.market, false) };
  });
  const timeline = weekend.concat(nextWeek);
  const batches = timeline
    .filter((day, index) => index === 0 || day.recipeId !== timeline[index - 1].recipeId)
    .map(day => best.selected.find(item => item.recipe.id === day.recipeId))
    .filter(Boolean);
  const confirmedOfferTotal = roundMoney(batches.reduce((sum, item) => (
    sum + item.matches
      .filter(match => match.sourceType === 'offer' || match.sourceType === 'app-offer')
      .reduce((matchSum, match) => matchSum + match.cost, 0)
  ), 0));
  const confirmedRegularTotal = roundMoney(batches.reduce((sum, item) => (
    sum + item.matches
      .filter(match => match.sourceType === 'regular' || match.sourceType === 'stale-regular')
      .reduce((matchSum, match) => matchSum + match.cost, 0)
  ), 0));
  const comparableMatches = batches.flatMap(item => item.matches)
    .filter(match => (match.sourceType === 'offer' || match.sourceType === 'app-offer') && match.regularCost !== null);
  const publishedNormalPriceTotal = roundMoney(comparableMatches.reduce((sum, match) => sum + match.regularCost, 0));
  const comparableOfferTotal = roundMoney(comparableMatches.reduce((sum, match) => sum + match.cost, 0));
  const publishedSavings = roundMoney(Math.max(0, publishedNormalPriceTotal - comparableOfferTotal));
  const allMatches = batches.reduce((sum, item) => sum + item.matches.length, 0);
  const normalPriceCoverage = allMatches ? Math.round(comparableMatches.length / allMatches * 100) : 0;
  const estimatedTotal = roundMoney(batches.reduce((sum, item) => {
    const confirmed = item.matches.reduce((matchSum, match) => matchSum + match.cost, 0);
    return sum + Math.max(item.estimatedCost, confirmed);
  }, 0));
  const shopping = buildShopping(batches, best.market);
  assertCompleteShopping(batches, shopping);
  const mealPrep = buildMealPrepPlan({ recipes: best.selected.map(item => item.recipe), nextWeek });
  const estimatedNormalPriceTotal = roundMoney(Math.max(0, estimatedTotal - confirmedOfferTotal - confirmedRegularTotal));
  return {
    ...basePlan,
    preferences,
    computedFromOffers: true,
    planRevision: Number(variation) || 0,
    generatedAt: new Date().toISOString(),
    title: `Neu berechneter Angebotsplan`,
    notice: `Aus ${allowedOffers.length} erlaubten Angeboten neu berechnet; ${allowedOffers.filter(offer => Number(offer.previousPrice) > 0).length} veröffentlichte Vergleichspreise und ${allowedRegularPrices.length} gezielt geprüfte Produktpreise erkannt.${exclusions.length ? ` Ohne: ${exclusions.join(', ')}.` : ''} App-Preise sind gesondert gekennzeichnet.`,
    weekend,
    nextWeek,
    shopping,
    mealPrep,
    recommendation: {
      mode: 'single',
      market: best.market,
      estimatedTotal,
      confirmedOfferTotal,
      confirmedRegularTotal,
      estimatedNormalPriceTotal,
      publishedNormalPriceTotal,
      publishedSavings,
      normalPriceCoverage,
      summary: `${best.market} bündelt die günstigste bewertete Kombination der neu ausgewählten Rezepte. Berechnet aus ${allowedOffers.length} aktuellen Angeboten; ein zusätzlicher Markt wird erst bei einer belastbaren Ersparnis um 20 € empfohlen.`,
      qualityNote: `Geschmack und Rezeptbewertungen fließen mit ein. Frischetheke bevorzugen, App-Preise nur mit aktivierter Händler-App nutzen; Fisch und Meeresfrüchte bleiben ausgeschlossen.`
    }
  };
}

module.exports = {
  allocateDays,
  subtractPantry,
  recommendMarket,
  generateOfferPlan,
  buildMealPrepPlan,
  shoppingDepartment
};
