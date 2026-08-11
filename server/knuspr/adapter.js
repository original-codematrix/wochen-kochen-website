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

function searchArguments(tool, query) {
  const value = requiredString(query, 'Suchbegriff');
  const schema = objectSchema(tool);
  const properties = schema.properties;
  const key = schemaKey(properties, ['query', 'searchTerm', 'term', 'text'], 'Suchargument');
  assertRequiredFields(schema, [key], 'Suchargument');
  assertSchemaType(properties[key], ['string'], 'Suchargument');
  return { [key]: value };
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
  return { collectionKey, productKey, quantityKey };
}

function addArguments(tool, items) {
  if (!Array.isArray(items) || items.length === 0) throw invalidResponse('Warenkorbpositionen');
  const { collectionKey, productKey, quantityKey } = addMetadata(tool);
  return {
    [collectionKey]: items.map((item) => {
      if (!isRecord(item)) throw invalidResponse('Warenkorbposition');
      return {
        [productKey]: requiredString(readAlias(item, ['productId', 'product_id', 'id']), 'Produkt-ID'),
        [quantityKey]: requiredNumber(readAlias(item, ['quantity', 'amount']), 'Menge', { positive: true }),
      };
    }),
  };
}

function readCartArguments(tool) {
  const schema = objectSchema(tool);
  assertRequiredFields(schema, [], 'Warenkorb-Leseargument');
  return {};
}

function validateCapability(tool, capability) {
  if (capability === 'searchProducts') searchArguments(tool, 'Probe');
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

module.exports = { createKnusprAdapter };
