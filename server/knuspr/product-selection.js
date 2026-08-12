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
  [/braten/i, [/braten/i]],
];

const MASS_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'kilogramm', 'kilograms']);
const VOLUME_UNITS = new Set(['ml', 'milliliter', 'l', 'liter']);
const PIECE_UNITS = new Set(['stück', 'stueck', 'piece', 'pieces', 'pcs', 'packung', 'packungen']);

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scaledAmount(value, scale) {
  const result = value * scale;
  return Number.isInteger(result) ? result : Number(result.toFixed(6));
}

function ingredientCategory(ingredient) {
  const text = String(ingredient);
  if (/(hähnchen|chicken|geflügel|pute)/i.test(text)) return 'chicken';
  if (/(rind|rinderhack|hackfleisch)/i.test(text)) return 'beef';
  if (/(schwein|nacken|schnitzel|medaillon)/i.test(text)) return 'pork';
  if (/gurke/i.test(text)) return 'cucumber';
  if (/paprika/i.test(text)) return 'peppers';
  if (/\b(reis|rice)\b/i.test(text)) return 'rice';
  if (/(käse|parmesan|feta|mozzarella)/i.test(text)) return 'cheese';
  if (/\b(pasta|nudeln?|penne|fusilli|rigatoni|spaghetti|mie|spätzle|lasagneplatten)\b/i.test(text)) return 'pasta';
  if (/\b(pommes|frites?|fries)\b/i.test(text)) return 'fries';
  if (/kartoffel/i.test(text)) return 'potato';
  if (/milch/i.test(text)) return 'milk';
  return null;
}

function defaultPieceIngredient(ingredient) {
  return ['cucumber'].includes(ingredientCategory(ingredient));
}

function parseRequiredAmount(ingredient, servingScale = 1) {
  const text = String(ingredient || '').trim();
  const scale = Number(servingScale);
  const multiplier = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const optional = /\boptional\b/i.test(text);
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:TK[- ]*)?(kg|g|ml|l|stück|stueck|packungen?|pcs?|pieces?)\b/i);
  if (!match) {
    const pieceMatch = text.match(/^(\d+(?:[.,]\d+)?)/);
    if (pieceMatch && defaultPieceIngredient(text)) {
      return {
        ingredient: text,
        amount: scaledAmount(Number(pieceMatch[1].replace(',', '.')), multiplier),
        unit: 'piece',
        optional,
      };
    }
    return {
      ingredient: text,
      amount: defaultPieceIngredient(text) ? scaledAmount(1, multiplier) : null,
      unit: defaultPieceIngredient(text) ? 'piece' : null,
      optional,
    };
  }
  const rawAmount = Number(match[1].replace(',', '.'));
  const rawUnit = match[2].toLowerCase();
  let unit = 'piece';
  let amount = rawAmount;
  if (MASS_UNITS.has(rawUnit)) {
    unit = 'mass';
    if (rawUnit === 'kg' || rawUnit === 'kilogramm' || rawUnit === 'kilograms') amount *= 1000;
  } else if (VOLUME_UNITS.has(rawUnit)) {
    unit = 'volume';
    if (rawUnit === 'l' || rawUnit === 'liter') amount *= 1000;
  }
  return { ingredient: text, amount: scaledAmount(amount, multiplier), unit, optional };
}

function normalizePackage(packageInfo) {
  if (!packageInfo || !Number.isFinite(Number(packageInfo.amount)) || Number(packageInfo.amount) <= 0) return null;
  const rawUnit = String(packageInfo.unit || '').trim().toLowerCase();
  let amount = Number(packageInfo.amount);
  let unit = null;
  if (MASS_UNITS.has(rawUnit)) {
    unit = 'mass';
    if (rawUnit === 'kg' || rawUnit === 'kilogramm' || rawUnit === 'kilograms') amount *= 1000;
  } else if (VOLUME_UNITS.has(rawUnit)) {
    unit = 'volume';
    if (rawUnit === 'l' || rawUnit === 'liter') amount *= 1000;
  } else if (PIECE_UNITS.has(rawUnit)) {
    unit = 'piece';
  }
  return unit ? { amount, unit } : null;
}

function currentPrice(product) {
  const value = product && product.price && product.price.current;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function calculatePackChoice(demand, product) {
  const packageSize = normalizePackage(product && product.package);
  const price = currentPrice(product);
  const choice = {
    product,
    packages: null,
    totalAmount: null,
    wasteAmount: null,
    totalPrice: null,
    wasteRatio: null,
    missingAmount: demand && Number.isFinite(demand.amount) ? demand.amount : null,
    packageKnown: false,
  };
  if (!demand || !Number.isFinite(demand.amount) || demand.amount <= 0 || !demand.unit || !packageSize || price === null) return choice;
  if (packageSize.unit !== demand.unit) return choice;
  const packages = Math.max(1, Math.ceil(demand.amount / packageSize.amount));
  const totalAmount = packages * packageSize.amount;
  const wasteAmount = totalAmount - demand.amount;
  return {
    ...choice,
    packages,
    totalAmount,
    wasteAmount,
    totalPrice: roundMoney(packages * price),
    wasteRatio: totalAmount ? wasteAmount / totalAmount : 0,
    missingAmount: 0,
    packageKnown: true,
  };
}

function explicitSpecies(ingredient) {
  const text = String(ingredient);
  if (/(rind|beef)/i.test(text)) return 'beef';
  if (/(schwein|pork)/i.test(text)) return 'pork';
  return null;
}

function hasSpecies(name, species) {
  return species === 'beef' ? /(rind|beef)/i.test(name) : /(schwein|pork)/i.test(name);
}

function isSuitable(demand, product) {
  if (!product || product.available !== true || !String(product.name || '').trim()) return false;
  const ingredient = String(demand.ingredient || '');
  const name = `${product.name || ''} ${product.brand || ''} ${product.package && product.package.label || ''}`;
  const category = ingredientCategory(ingredient);
  const broth = /(brühe|fond)/i;
  if (broth.test(ingredient) !== broth.test(name)) return false;

  const cutRule = MEAT_CUT_RULES.find(([pattern]) => pattern.test(ingredient));
  const species = explicitSpecies(ingredient);
  if (species && !hasSpecies(name, species)) return false;
  if (/\bhack(?:fleisch)?\b/i.test(ingredient) && !species && !/(rind|beef|schwein|pork|gemisch|mixed|halb\s*(?:und|&)\s*halb)/i.test(name)) return false;
  if (['chicken', 'beef', 'pork'].includes(category) && cutRule && !cutRule[1].every((pattern) => pattern.test(name))) return false;
  if (category === 'chicken') {
    if (!/(hähnchen|chicken|geflügel|pute)/i.test(name)) return false;
    if (/(salat|aufschnitt|wurst|suppe|fertiggericht|ramen)/i.test(name)) return false;
    if (!cutRule && /(wing|flügel|nugget|schenkel|keule)/i.test(name)) return false;
    if (/(burger|pattie)/i.test(ingredient) && !/(burger|pattie)/i.test(name)) return false;
  }
  if (category === 'cucumber') {
    const pickled = /(gewürz|essig|cornichon|eingelegt)/i;
    if (!/gurke/i.test(name)) return false;
    if (pickled.test(ingredient) ? !pickled.test(name) : pickled.test(name)) return false;
  }
  if (category === 'peppers' && /paprikapulver/i.test(ingredient) !== /paprikapulver/i.test(name)) return false;
  if (category === 'rice' && (!/(reis|rice)/i.test(name) || /(milch\s*reis|pudding|dessert|waffel)/i.test(name))) return false;
  if (category === 'cheese') {
    if (!/(käse|kaese|parmesan|feta|mozzarella)/i.test(name) || /(chips|snack|soße|sauce)/i.test(name)) return false;
    if (/parmesan/i.test(ingredient) && !/parmesan/i.test(name)) return false;
    if (/feta/i.test(ingredient) && !/feta/i.test(name)) return false;
    if (/mozzarella/i.test(ingredient) && !/mozzarella/i.test(name)) return false;
    if (!/(parmesan|feta|mozzarella)/i.test(ingredient) && /\b(blu|weichkäse|camembert|feta|mozzarella)\b/i.test(name)) return false;
  }
  if (category === 'pasta') {
    if (!/\b(pasta|nudeln?|penne|fusilli|rigatoni|spaghetti|mie|spätzle|lasagneplatten)\b/i.test(name)) return false;
    if (/(salat|fertiggericht|terrine|soße|sauce|spaghetteria|spinaci|ramen)/i.test(name)) return false;
    if (/spätzle/i.test(ingredient) && !/spätzle/i.test(name)) return false;
    if (/lasagne/i.test(ingredient) && !/lasagne/i.test(name)) return false;
    if (/\bmie\b/i.test(ingredient) && !/\bmie\b/i.test(name)) return false;
  }
  if (category === 'fries' && !/\b(pommes|frites?|fries)\b/i.test(name)) return false;
  if (category === 'potato' && (!/kartoffel/i.test(name) || /\b(pommes|frites?|fries)\b|kartoffelsalat/i.test(name))) return false;
  if (category === 'milk' && !/milch/i.test(name)) return false;
  return true;
}

function matchTier(demand, product) {
  const ingredient = String(demand.ingredient || '').toLocaleLowerCase('de-DE');
  const name = String(product.name || '').toLocaleLowerCase('de-DE');
  if (/parmesan/.test(ingredient) && /parmesan/.test(name)) return 0;
  if (/hähnchenbrust|chicken breast/.test(ingredient) && /brust|breast/.test(name)) return 0;
  if (/schweinenackensteak/.test(ingredient) && /nacken/.test(name) && /steak/.test(name)) return 0;
  if (/kartoffel/.test(ingredient) && /kartoffel/.test(name)) return 0;
  if (/milch/.test(ingredient) && /milch/.test(name)) return 0;
  return 1;
}

function rankTuple(choice, preferences) {
  const valueCost = choice.totalPrice + Math.min(0.5, choice.wasteRatio * 0.5);
  return [
    choice.matchTier,
    choice.missingAmount > 0 ? 1 : 0,
    choice.product.id === preferences.pinnedProductId ? 0 : 1,
    -choice.qualitySignals.length,
    valueCost,
    choice.wasteRatio,
    choice.totalPrice,
  ];
}

function compareTuple(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function rankProducts(demand, products, preferences = {}) {
  if (!demand || demand.optional) return [];
  return (Array.isArray(products) ? products : [])
    .filter((product) => isSuitable(demand, product))
    .map((product) => {
      const choice = calculatePackChoice(demand, product);
      const qualitySignals = Array.isArray(product.qualityTags) ? product.qualityTags.filter((tag) => String(tag).trim()) : [];
      const ranked = { ...choice, matchTier: matchTier(demand, product), qualitySignals };
      return { ...ranked, rank: ranked.packageKnown ? rankTuple(ranked, preferences) : null };
    })
    .sort((left, right) => {
      if (!left.rank && !right.rank) return 0;
      if (!left.rank) return 1;
      if (!right.rank) return -1;
      return compareTuple(left.rank, right.rank);
    });
}

function describeChoice(choice) {
  const packageWord = choice.packages === 1 ? 'Packung' : 'Packungen';
  const surplus = choice.wasteAmount > 0 ? `, ${choice.wasteAmount} Überschuss` : '';
  return `${choice.packages} ${packageWord} passend zur benötigten Menge${surplus}`;
}

function chooseProduct(demand, products, preferences = {}) {
  if (!demand || demand.optional) {
    return { selected: null, alternatives: [], packages: null, totalAmount: null, wasteAmount: null, totalPrice: null, reason: 'Optionale Zutat', status: 'missing' };
  }
  const alternatives = rankProducts(demand, products, preferences);
  const calculable = alternatives.filter((choice) => choice.packageKnown);
  if (calculable.length === 0) {
    // When the recipe gives no orderable amount (e.g. "2 Zwiebeln", "etwas Öl")
    // the pack count cannot be computed. Rather than block the cart with an
    // ambiguous line, order a single pack of the cheapest suitable product —
    // the shopper can still swap it via "Alternative wählen" or remove it.
    const unquantified = demand.amount === null || demand.amount === undefined;
    if (unquantified && alternatives.length > 0) {
      const pick = alternatives.reduce((best, choice) => {
        const price = currentPrice(choice.product);
        const bestPrice = currentPrice(best.product);
        if (price === null) return best;
        if (bestPrice === null) return choice;
        return price < bestPrice ? choice : best;
      });
      const price = currentPrice(pick.product) || 0;
      return {
        selected: pick.product,
        alternatives: alternatives.filter((choice) => choice.product.id !== pick.product.id),
        packages: 1,
        totalAmount: null,
        wasteAmount: null,
        totalPrice: roundMoney(price),
        reason: 'Menge nicht angegeben – eine Packung eingeplant',
        status: 'selected',
      };
    }
    const ambiguous = alternatives.length > 0;
    return {
      selected: null,
      alternatives,
      packages: null,
      totalAmount: null,
      wasteAmount: null,
      totalPrice: null,
      reason: ambiguous ? 'Packungsmenge nicht eindeutig' : 'Kein passendes lieferbares Produkt',
      status: ambiguous ? 'ambiguous' : 'missing',
    };
  }
  const winner = calculable[0];
  const tied = calculable.filter((choice) => compareTuple(choice.rank, winner.rank) === 0);
  if (tied.length > 1) {
    return {
      selected: null,
      alternatives,
      packages: null,
      totalAmount: null,
      wasteAmount: null,
      totalPrice: null,
      reason: 'Mehrere gleich passende Produkte',
      status: 'ambiguous',
    };
  }
  return {
    selected: winner.product,
    alternatives: alternatives.filter((choice) => choice.product.id !== winner.product.id),
    packages: winner.packages,
    totalAmount: winner.totalAmount,
    wasteAmount: winner.wasteAmount,
    totalPrice: winner.totalPrice,
    reason: describeChoice(winner),
    status: 'selected',
  };
}

module.exports = { parseRequiredAmount, calculatePackChoice, rankProducts, chooseProduct };
