const CAPABILITIES = {
  searchProducts: [/search.*product/i, /product.*search/i, /produkt.*such/i],
  readCart: [/(get|read|show).*cart/i, /cart.*(get|read|show)/i, /warenkorb.*(lesen|anzeigen)/i],
  addCartItems: [/add.*cart/i, /cart.*add/i, /warenkorb.*hinzu/i],
};

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
  if (capability === 'searchProducts') searchMetadata(tool);
  if (capability === 'readCart') readCartArguments(tool);
  if (capability === 'addCartItems') addMetadata(tool);
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
      const response = decodeResponse(await client.callTool(tool.name, searchArguments(tool, query)));
      return collection(response, [['products'], ['results'], ['data', 'products'], ['data', 'results']], 'Produktliste')
        .map(normalizeProduct);
    },
    async getCart() {
      const tool = await toolFor('readCart');
      const response = decodeResponse(await client.callTool(tool.name, readCartArguments(tool)));
      return collection(response, [['items'], ['lines'], ['cart', 'items'], ['cart', 'lines'], ['data', 'items'], ['data', 'lines']], 'Warenkorb')
        .map(normalizeCartLine);
    },
    async addCartItems(items) {
      const tool = await toolFor('addCartItems');
      return decodeResponse(await client.callTool(tool.name, addArguments(tool, items)));
    },
  };
}

module.exports = { createKnusprAdapter, validateSchemaValue };
