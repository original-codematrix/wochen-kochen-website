const CAPABILITIES = {
  searchProducts: [/search.*product/i, /product.*search/i, /produkt.*such/i],
  readCart: [/(get|read|show).*cart/i, /cart.*(get|read|show)/i, /warenkorb.*(lesen|anzeigen)/i],
  addCartItems: [/add.*cart/i, /cart.*add/i, /warenkorb.*hinzu/i],
};

// Exact Knuspr MCP tool names observed live against https://mcp.knuspr.de/mcp.
// These take precedence over the regex heuristics above so capability discovery
// stays deterministic even though the live toolset has 50+ tools whose
// descriptions overlap the generic patterns (e.g. `repeat_order` mentions
// "add … to … cart"). The regex list remains a fallback for any tenant that
// exposes differently named tools.
const KNOWN_TOOL_NAMES = {
  searchProducts: 'batch_search_products',
  readCart: 'get_cart',
  addCartItems: 'add_items_to_cart',
};

function isKnusprTool(tool, capability) {
  return isRecord(tool) && tool.name === KNOWN_TOOL_NAMES[capability];
}

function error(code, detail) {
  return Object.assign(new Error(`${code}: ${detail}`), { code });
}

function unsupported(detail) {
  return error('KNUSPR_TOOLSET_UNSUPPORTED', detail);
}

function invalidResponse(detail) {
  return error('KNUSPR_RESPONSE_INVALID', detail);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readAlias(record, aliases) {
  const found = aliases.filter((key) => own(record, key));
  if (found.length === 0) return undefined;
  const value = record[found[0]];
  if (found.some((key) => !sameValue(value, record[key]))) throw invalidResponse(`widersprüchliche Felder: ${aliases.join(', ')}`);
  return value;
}

function requiredString(value, detail) {
  if (typeof value !== 'string' || !value.trim()) throw invalidResponse(detail);
  return value.trim();
}

function optionalString(value, detail) {
  if (value === undefined || value === null) return null;
  return requiredString(value, detail);
}

function requiredNumber(value, detail, { positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw invalidResponse(detail);
  }
  return value;
}

function optionalNumber(value, detail, options) {
  if (value === undefined || value === null) return null;
  return requiredNumber(value, detail, options);
}

function optionalBoolean(value, detail) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw invalidResponse(detail);
  return value;
}

function toolLabel(tool) {
  return `${tool.name || ''} ${tool.title || ''} ${tool.description || ''}`;
}

function resolveTool(tools, capability) {
  const known = tools.find((tool) => isKnusprTool(tool, capability));
  if (known) return known;
  const matches = tools.filter((tool) => isRecord(tool)
    && typeof tool.name === 'string'
    && tool.name.trim()
    && CAPABILITIES[capability].some((pattern) => pattern.test(toolLabel(tool))));
  if (matches.length !== 1) throw unsupported(capability);
  return matches[0];
}

function toolsFrom(result) {
  if (Array.isArray(result)) return result;
  if (isRecord(result) && Array.isArray(result.tools)) return result.tools;
  throw unsupported('Werkzeugliste');
}

function objectSchema(tool, detail = `${tool.name}: Eingabeschema`) {
  if (!isRecord(tool.inputSchema) || tool.inputSchema.type !== 'object' || !isRecord(tool.inputSchema.properties)) {
    throw unsupported(detail);
  }
  validateSchemaValue(undefined, tool.inputSchema, detail);
  return tool.inputSchema;
}

function schemaKey(properties, candidates, detail) {
  const keys = candidates.filter((candidate) => own(properties, candidate));
  if (keys.length !== 1) throw unsupported(detail);
  return keys[0];
}

function assertRequiredFields(schema, allowed, detail) {
  if (schema.required === undefined) return;
  if (!Array.isArray(schema.required)
    || schema.required.some((key) => typeof key !== 'string' || !allowed.includes(key))) {
    throw unsupported(detail);
  }
}

function assertSchemaType(schema, acceptedTypes, detail) {
  if (!isRecord(schema) || !acceptedTypes.includes(schema.type)) throw unsupported(detail);
}

const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else', '$ref', '$dynamicRef', '$recursiveRef',
]);

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type', 'required', 'properties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
  'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'additionalProperties',
  'title', 'description', 'default', 'examples', '$schema', '$id', 'deprecated', 'readOnly', 'writeOnly',
]);

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schemaNumber(value, detail, { positive = false, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0) || (integer && (!Number.isInteger(value) || value < 0))) {
    throw unsupported(detail);
  }
  return value;
}

function schemaTypeMatches(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  throw unsupported(`Schema-Typ: ${String(type)}`);
}

function validateSchemaValue(value, schema, detail) {
  if (!isRecord(schema)) throw unsupported(detail);
  for (const key of Object.keys(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key) || !SUPPORTED_SCHEMA_KEYWORDS.has(key)) throw unsupported(detail);
  }

  if (schema.type !== undefined && typeof schema.type !== 'string') throw unsupported(detail);
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string'))) {
    throw unsupported(detail);
  }
  if (schema.properties !== undefined && !isRecord(schema.properties)) throw unsupported(detail);
  if (schema.items !== undefined && !isRecord(schema.items)) throw unsupported(detail);
  if (schema.additionalProperties !== undefined
    && typeof schema.additionalProperties !== 'boolean'
    && !isRecord(schema.additionalProperties)) throw unsupported(detail);
  if (isRecord(schema.additionalProperties)) validateSchemaValue(undefined, schema.additionalProperties, detail);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) throw unsupported(detail);
  if (schema.minLength !== undefined) schemaNumber(schema.minLength, detail, { integer: true });
  if (schema.maxLength !== undefined) schemaNumber(schema.maxLength, detail, { integer: true });
  if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) throw unsupported(detail);
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') throw unsupported(detail);
    try {
      new RegExp(schema.pattern);
    } catch (caught) {
      throw unsupported(detail);
    }
  }
  if (schema.minItems !== undefined) schemaNumber(schema.minItems, detail, { integer: true });
  if (schema.maxItems !== undefined) schemaNumber(schema.maxItems, detail, { integer: true });
  if (schema.minItems !== undefined && schema.maxItems !== undefined && schema.minItems > schema.maxItems) throw unsupported(detail);
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
    if (schema[key] !== undefined) schemaNumber(schema[key], detail);
  }
  if (schema.multipleOf !== undefined) schemaNumber(schema.multipleOf, detail, { positive: true });
  const lower = Math.max(schema.minimum === undefined ? -Infinity : schema.minimum, schema.exclusiveMinimum === undefined ? -Infinity : schema.exclusiveMinimum);
  const upper = Math.min(schema.maximum === undefined ? Infinity : schema.maximum, schema.exclusiveMaximum === undefined ? Infinity : schema.exclusiveMaximum);
  if (lower > upper || (lower === upper && (schema.exclusiveMinimum !== undefined || schema.exclusiveMaximum !== undefined))) throw unsupported(detail);

  if (value === undefined) return;
  if (schema.type !== undefined && !schemaTypeMatches(value, schema.type)) throw invalidResponse(detail);
  if (schema.const !== undefined && !sameJsonValue(value, schema.const)) throw invalidResponse(detail);
  if (schema.enum !== undefined && !schema.enum.some((candidate) => sameJsonValue(value, candidate))) throw invalidResponse(detail);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) throw invalidResponse(detail);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw invalidResponse(detail);
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern)).test(value)) throw invalidResponse(detail);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) throw invalidResponse(detail);
    if (schema.maximum !== undefined && value > schema.maximum) throw invalidResponse(detail);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) throw invalidResponse(detail);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) throw invalidResponse(detail);
    if (schema.multipleOf !== undefined) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8) throw invalidResponse(detail);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw invalidResponse(detail);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw invalidResponse(detail);
    if (schema.items !== undefined) value.forEach((item) => validateSchemaValue(item, schema.items, detail));
  }
  if (isRecord(value)) {
    for (const key of schema.required || []) if (!own(value, key)) throw invalidResponse(detail);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties && own(schema.properties, key)) {
        validateSchemaValue(item, schema.properties[key], detail);
      } else if (schema.additionalProperties === false) {
        throw invalidResponse(detail);
      } else if (isRecord(schema.additionalProperties)) {
        validateSchemaValue(item, schema.additionalProperties, detail);
      }
    }
  }
}

function searchMetadata(tool) {
  const schema = objectSchema(tool);
  const properties = schema.properties;
  const key = schemaKey(properties, ['query', 'searchTerm', 'term', 'text'], 'Suchargument');
  assertRequiredFields(schema, [key], 'Suchargument');
  assertSchemaType(properties[key], ['string'], 'Suchargument');
  validateSchemaValue(undefined, properties[key], 'Suchargument');
  return { schema, key };
}

function searchArguments(tool, query) {
  const value = requiredString(query, 'Suchbegriff');
  const { schema, key } = searchMetadata(tool);
  const args = { [key]: value };
  validateSchemaValue(args, schema, 'Suchargument');
  return args;
}

function addMetadata(tool) {
  const schema = objectSchema(tool);
  const properties = schema.properties;
  const collectionKey = schemaKey(properties, ['items', 'lineItems', 'products'], 'Warenkorbargument');
  assertRequiredFields(schema, [collectionKey], 'Warenkorbargument');
  assertSchemaType(properties[collectionKey], ['array'], 'Warenkorbargument');
  const itemSchema = properties[collectionKey] && properties[collectionKey].items;
  if (!isRecord(itemSchema) || itemSchema.type !== 'object' || !isRecord(itemSchema.properties)) throw unsupported('Warenkorbpositionen-Schema');
  const itemProperties = itemSchema.properties;
  const productKey = schemaKey(itemProperties, ['productId', 'product_id', 'id'], 'Produktargument');
  const quantityKey = schemaKey(itemProperties, ['quantity', 'amount'], 'Mengenargument');
  assertRequiredFields(itemSchema, [productKey, quantityKey], 'Warenkorbpositionen-Schema');
  assertSchemaType(itemProperties[productKey], ['string'], 'Produktargument');
  assertSchemaType(itemProperties[quantityKey], ['number', 'integer'], 'Mengenargument');
  validateSchemaValue(undefined, properties[collectionKey], 'Warenkorbargument');
  validateSchemaValue(undefined, itemSchema, 'Warenkorbpositionen-Schema');
  validateSchemaValue(undefined, itemProperties[productKey], 'Produktargument');
  validateSchemaValue(undefined, itemProperties[quantityKey], 'Mengenargument');
  return { schema, collectionKey, productKey, quantityKey };
}

function addArguments(tool, items) {
  if (!Array.isArray(items) || items.length === 0) throw invalidResponse('Warenkorbpositionen');
  const { schema, collectionKey, productKey, quantityKey } = addMetadata(tool);
  const args = {
    [collectionKey]: items.map((item) => {
      if (!isRecord(item)) throw invalidResponse('Warenkorbposition');
      return {
        [productKey]: requiredString(readAlias(item, ['productId', 'product_id', 'id']), 'Produkt-ID'),
        [quantityKey]: requiredNumber(readAlias(item, ['quantity', 'amount']), 'Menge', { positive: true }),
      };
    }),
  };
  validateSchemaValue(args, schema, 'Warenkorbargument');
  return args;
}

function readCartArguments(tool) {
  const schema = objectSchema(tool);
  assertRequiredFields(schema, [], 'Warenkorb-Leseargument');
  const args = {};
  validateSchemaValue(args, schema, 'Warenkorb-Leseargument');
  return args;
}

function validateCapability(tool, capability) {
  // The live Knuspr tools use argument shapes the generic validators do not
  // model (batch `queries` objects, integer product ids). Resolving them by
  // their exact name is proof enough that the capability exists.
  if (isKnusprTool(tool, capability)) return;
  if (capability === 'searchProducts') searchMetadata(tool);
  if (capability === 'readCart') readCartArguments(tool);
  if (capability === 'addCartItems') addMetadata(tool);
}

// --- Knuspr-specific argument builders and response normalizers ------------
// Built against the real https://mcp.knuspr.de/mcp contract:
//   batch_search_products({ queries:[{ keyword }] })
//     -> { results:[{ query, products:[{ productId, productName, price,
//          brand, inStock, textualAmount, pricePerUnit:{ full }, badges }] }] }
//   get_cart({}) -> { data:{ items:{ <id>:{ productId, productName,
//          quantity, price } } } }
//   add_items_to_cart({ items:[{ productId:int, quantity }] })

const AMOUNT_UNIT_ALIASES = {
  g: 'g', gramm: 'g', gr: 'g', kg: 'kg', kilogramm: 'kg',
  ml: 'ml', l: 'l', liter: 'l',
  stück: 'stück', stueck: 'stück', stk: 'stück', st: 'stück', 'st.': 'stück', piece: 'stück', pieces: 'stück', pcs: 'stück',
};

function normalizeAmountUnit(rawUnit) {
  return AMOUNT_UNIT_ALIASES[String(rawUnit || '').trim().toLowerCase()] || null;
}

function parseTextualAmount(text) {
  const label = typeof text === 'string' && text.trim() ? text.trim() : null;
  const empty = { amount: null, unit: null, label };
  if (!label) return empty;
  const unitGroup = 'kg|kilogramm|g|gramm|gr|ml|l|liter|stück|stueck|stk|st\\.?|pcs|pieces?';
  const multi = label.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${unitGroup})\\b`, 'i'));
  if (multi) {
    const unit = normalizeAmountUnit(multi[3]);
    const amount = Number(multi[1].replace(',', '.')) * Number(multi[2].replace(',', '.'));
    if (unit && Number.isFinite(amount) && amount > 0) return { amount, unit, label };
    return empty;
  }
  const single = label.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${unitGroup})\\b`, 'i'));
  if (single) {
    const unit = normalizeAmountUnit(single[2]);
    const amount = Number(single[1].replace(',', '.'));
    if (unit && Number.isFinite(amount) && amount > 0) return { amount, unit, label };
  }
  return empty;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeKnusprProduct(raw) {
  if (!isRecord(raw)) return null;
  const id = raw.productId === 0 || raw.productId ? String(raw.productId) : null;
  const name = typeof raw.productName === 'string' && raw.productName.trim() ? raw.productName.trim() : null;
  const current = finiteNumber(raw.price);
  if (!id || !name || current === null || current < 0) return null;
  const unitPrice = raw.pricePerUnit && finiteNumber(raw.pricePerUnit.full);
  const original = finiteNumber(raw.originalPricePerUnit);
  const badges = Array.isArray(raw.badges) ? raw.badges.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()) : [];
  return {
    id,
    name,
    brand: typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim() : null,
    url: null,
    imageUrl: typeof raw.imgPath === 'string' && raw.imgPath.trim() ? raw.imgPath.trim() : null,
    available: raw.inStock === true,
    package: parseTextualAmount(raw.textualAmount),
    price: {
      current,
      regular: original !== null && original > current ? original : null,
      unit: unitPrice === undefined ? null : unitPrice,
      unitLabel: null,
      offer: (typeof raw.salePercents === 'number' && raw.salePercents > 0) || badges.some((tag) => /sale|angebot|aktion/i.test(tag)) ? true : null,
    },
    qualityTags: badges,
  };
}

function parseKnusprProducts(decoded) {
  const results = isRecord(decoded) && Array.isArray(decoded.results) ? decoded.results : null;
  if (!results) throw invalidResponse('Produktliste');
  const products = [];
  for (const batch of results) {
    const list = isRecord(batch) && Array.isArray(batch.products) ? batch.products : [];
    for (const raw of list) {
      const normalized = normalizeKnusprProduct(raw);
      if (normalized) products.push(normalized);
    }
  }
  return products;
}

function normalizeKnusprCartLine(raw) {
  if (!isRecord(raw)) return null;
  const id = raw.productId === 0 || raw.productId ? String(raw.productId) : null;
  const name = typeof raw.productName === 'string' && raw.productName.trim() ? raw.productName.trim() : null;
  const quantity = finiteNumber(raw.quantity);
  const unitPrice = finiteNumber(raw.price);
  if (!id || !name || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0) return null;
  return {
    productId: id,
    name,
    quantity,
    unitPrice,
    totalPrice: Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100,
  };
}

function parseKnusprCart(decoded) {
  const data = isRecord(decoded) && isRecord(decoded.data) ? decoded.data : (isRecord(decoded) ? decoded : null);
  if (!data) throw invalidResponse('Warenkorb');
  const items = isRecord(data.items) ? Object.values(data.items) : (Array.isArray(data.items) ? data.items : []);
  return items.map(normalizeKnusprCartLine).filter(Boolean);
}

// Knuspr returns the real payload in the text content part; its
// `structuredContent` is a wrapped `{ result: … }` envelope with a different
// shape, so the Knuspr path decodes the text directly rather than deferring to
// the generic `decodeResponse` (which prefers structuredContent).
function decodeKnusprText(response) {
  if (!isRecord(response) || response.isError) throw invalidResponse('Werkzeugantwort');
  if (!Array.isArray(response.content)) throw invalidResponse('Werkzeugantwortinhalt');
  const texts = response.content
    .filter((part) => isRecord(part) && part.type === 'text' && typeof part.text === 'string' && part.text.trim());
  if (texts.length !== 1) throw invalidResponse('Textantwort');
  try {
    const value = JSON.parse(texts[0].text);
    if (!isRecord(value) && !Array.isArray(value)) throw invalidResponse('JSON-Antwort');
    return value;
  } catch (caught) {
    if (caught && caught.code === 'KNUSPR_RESPONSE_INVALID') throw caught;
    throw invalidResponse('JSON-Antwort');
  }
}

function knusprAddArguments(items) {
  if (!Array.isArray(items) || items.length === 0) throw invalidResponse('Warenkorbpositionen');
  return {
    items: items.map((item) => {
      if (!isRecord(item)) throw invalidResponse('Warenkorbposition');
      const productId = Number(readAlias(item, ['productId', 'product_id', 'id']));
      const quantity = requiredNumber(readAlias(item, ['quantity', 'amount']), 'Menge', { positive: true });
      if (!Number.isInteger(productId) || productId <= 0) throw invalidResponse('Produkt-ID');
      return { productId, quantity };
    }),
  };
}

function decodeResponse(response) {
  if (!isRecord(response) || response.isError) throw invalidResponse('Werkzeugantwort');
  if (own(response, 'structuredContent')) {
    if (!isRecord(response.structuredContent) && !Array.isArray(response.structuredContent)) {
      throw invalidResponse('strukturierte Werkzeugantwort');
    }
    return response.structuredContent;
  }
  if (!Array.isArray(response.content)) throw invalidResponse('Werkzeugantwortinhalt');
  const texts = response.content
    .filter((part) => isRecord(part) && part.type === 'text' && typeof part.text === 'string' && part.text.trim());
  if (texts.length !== 1) throw invalidResponse('Textantwort');
  try {
    const value = JSON.parse(texts[0].text);
    if (!isRecord(value) && !Array.isArray(value)) throw invalidResponse('JSON-Antwort');
    return value;
  } catch (caught) {
    if (caught && caught.code === 'KNUSPR_RESPONSE_INVALID') throw caught;
    throw invalidResponse('JSON-Antwort');
  }
}

function atPath(value, path) {
  return path.reduce((current, key) => (isRecord(current) && own(current, key) ? current[key] : undefined), value);
}

function collection(value, paths, detail) {
  if (Array.isArray(value)) return value;
  const matches = paths.map((path) => atPath(value, path)).filter(Array.isArray);
  if (matches.length !== 1) throw invalidResponse(detail);
  return matches[0];
}

function available(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') throw invalidResponse('Verfügbarkeit');
  const normalized = value.trim().toLowerCase();
  if (['available', 'in_stock', 'in-stock', 'lieferbar', 'auf lager'].includes(normalized)) return true;
  if (['unavailable', 'out_of_stock', 'out-of-stock', 'sold_out', 'sold-out', 'nicht verfügbar'].includes(normalized)) return false;
  throw invalidResponse('Verfügbarkeit');
}

function normalizePackage(source) {
  const value = readAlias(source, ['package', 'packaging', 'packageInfo']);
  if (value === undefined || value === null) return { amount: null, unit: null, label: null };
  if (!isRecord(value)) throw invalidResponse('Packungsangabe');
  return {
    amount: optionalNumber(readAlias(value, ['amount', 'size', 'quantity']), 'Packungsmenge', { positive: true }),
    unit: optionalString(readAlias(value, ['unit']), 'Packungseinheit'),
    label: optionalString(readAlias(value, ['label', 'description']), 'Packungsbezeichnung'),
  };
}

function normalizePrice(source) {
  const value = readAlias(source, ['price', 'pricing']);
  if (!isRecord(value)) throw invalidResponse('Preis');
  return {
    current: requiredNumber(readAlias(value, ['current', 'amount', 'value']), 'Aktionspreis'),
    regular: optionalNumber(readAlias(value, ['regular', 'original', 'listPrice']), 'Regulärpreis'),
    unit: optionalNumber(readAlias(value, ['unit', 'unitPrice']), 'Grundpreis'),
    unitLabel: optionalString(readAlias(value, ['unitLabel', 'unit_label']), 'Grundpreiseinheit'),
    offer: optionalBoolean(readAlias(value, ['offer', 'onOffer']), 'Angebotskennzeichen'),
  };
}

function normalizeProduct(source) {
  if (!isRecord(source)) throw invalidResponse('Produkt');
  const tags = readAlias(source, ['qualityTags', 'quality_tags', 'tags']);
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || !tag.trim()))) {
    throw invalidResponse('Qualitätsmerkmale');
  }
  return {
    id: requiredString(readAlias(source, ['id', 'productId', 'product_id']), 'Produkt-ID'),
    name: requiredString(readAlias(source, ['name', 'title']), 'Produktname'),
    brand: optionalString(readAlias(source, ['brand']), 'Marke'),
    url: optionalString(readAlias(source, ['url', 'productUrl', 'product_url']), 'Produkt-URL'),
    imageUrl: optionalString(readAlias(source, ['imageUrl', 'image_url']), 'Produktbild-URL'),
    available: available(readAlias(source, ['available', 'availability', 'inStock', 'in_stock'])),
    package: normalizePackage(source),
    price: normalizePrice(source),
    qualityTags: tags === undefined ? [] : tags.map((tag) => tag.trim()),
  };
}

function normalizeCartLine(source) {
  if (!isRecord(source)) throw invalidResponse('Warenkorbposition');
  return {
    productId: requiredString(readAlias(source, ['productId', 'product_id', 'id']), 'Produkt-ID'),
    name: requiredString(readAlias(source, ['name', 'title']), 'Produktname'),
    quantity: requiredNumber(readAlias(source, ['quantity', 'amount']), 'Menge', { positive: true }),
    unitPrice: requiredNumber(readAlias(source, ['unitPrice', 'unit_price']), 'Stückpreis'),
    totalPrice: requiredNumber(readAlias(source, ['totalPrice', 'total_price']), 'Gesamtpreis'),
  };
}

function createKnusprAdapter({ client }) {
  if (!client || typeof client.listTools !== 'function' || typeof client.callTool !== 'function') {
    throw new Error('Knuspr-Client fehlt');
  }

  let discovery;

  async function discovered() {
    discovery ||= Promise.resolve(client.listTools()).then(toolsFrom);
    return discovery;
  }

  async function toolFor(capability) {
    return resolveTool(await discovered(), capability);
  }

  return {
    async capabilities() {
      const tools = await discovered();
      return Object.fromEntries(Object.keys(CAPABILITIES).map((capability) => {
        try {
          validateCapability(resolveTool(tools, capability), capability);
          return [capability, true];
        } catch (caught) {
          if (caught && caught.code === 'KNUSPR_TOOLSET_UNSUPPORTED') return [capability, false];
          throw caught;
        }
      }));
    },
    async searchProducts(query) {
      const tool = await toolFor('searchProducts');
      if (isKnusprTool(tool, 'searchProducts')) {
        const keyword = requiredString(query, 'Suchbegriff');
        const response = decodeKnusprText(await client.callTool(tool.name, { queries: [{ keyword }] }));
        return parseKnusprProducts(response);
      }
      const response = decodeResponse(await client.callTool(tool.name, searchArguments(tool, query)));
      return collection(response, [['products'], ['results'], ['data', 'products'], ['data', 'results']], 'Produktliste')
        .map(normalizeProduct);
    },
    // Knuspr keeps current deals in a separate discounted-items list (product
    // search does not flag sales). Return the on-offer products so the planner
    // can prefer them. Best-effort and paginated; the exact tool name is fixed.
    async getDiscountedItems({ limit = 300 } = {}) {
      const offers = [];
      const seen = new Set();
      for (let page = 1; offers.length < limit && page <= 8; page += 1) {
        let decoded;
        try {
          decoded = decodeKnusprText(await client.callTool('get_discounted_items', { page }));
        } catch (caught) {
          break;
        }
        const products = isRecord(decoded) && Array.isArray(decoded.products) ? decoded.products : [];
        if (products.length === 0) break;
        for (const raw of products) {
          if (!isRecord(raw)) continue;
          const id = raw.productId === 0 || raw.productId ? String(raw.productId) : null;
          const prices = isRecord(raw.prices) ? raw.prices : null;
          const current = prices ? finiteNumber(prices.salePrice) : null;
          const regular = prices ? finiteNumber(prices.originalPrice) : null;
          if (!id || seen.has(id) || current === null || current < 0) continue;
          seen.add(id);
          offers.push({ id, current, regular, saleId: prices && (typeof prices.saleId === 'number' ? prices.saleId : null) });
        }
      }
      return offers;
    },
    async getCart() {
      const tool = await toolFor('readCart');
      if (isKnusprTool(tool, 'readCart')) {
        return parseKnusprCart(decodeKnusprText(await client.callTool(tool.name, {})));
      }
      const response = decodeResponse(await client.callTool(tool.name, readCartArguments(tool)));
      return collection(response, [['items'], ['lines'], ['cart', 'items'], ['cart', 'lines'], ['data', 'items'], ['data', 'lines']], 'Warenkorb')
        .map(normalizeCartLine);
    },
    async addCartItems(items) {
      const tool = await toolFor('addCartItems');
      if (isKnusprTool(tool, 'addCartItems')) {
        return decodeKnusprText(await client.callTool(tool.name, knusprAddArguments(items)));
      }
      return decodeResponse(await client.callTool(tool.name, addArguments(tool, items)));
    },
  };
}

module.exports = { createKnusprAdapter, validateSchemaValue };
