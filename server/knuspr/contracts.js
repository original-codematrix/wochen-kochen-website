const ADDITIONAL_CATEGORIES = new Set(['getraenke', 'vorrat', 'haushalt']);

function validateAdditionalItems(items) {
  if (!Array.isArray(items)) throw new Error('Zusatzliste muss ein Array sein');
  return items.map((item) => {
    if (!item || !ADDITIONAL_CATEGORIES.has(item.category)) throw new Error('Ungültige Kategorie');
    if (!String(item.id || '').trim() || !String(item.label || '').trim() || !String(item.searchTerm || '').trim()) {
      throw new Error('Eintrag ist unvollständig');
    }
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Menge muss positiv sein');
    return {
      id: String(item.id),
      label: String(item.label).trim(),
      searchTerm: String(item.searchTerm).trim(),
      quantity,
      category: item.category,
      enabled: item.enabled !== false,
      pinnedProductId: item.pinnedProductId ? String(item.pinnedProductId) : null,
    };
  });
}

function validatePreview(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) throw new Error('Vorschau muss ein Objekt sein');
  if (preview.generatedAt !== undefined && typeof preview.generatedAt !== 'string') throw new Error('Vorschau ist ungültig');
  if (preview.days !== undefined && !Array.isArray(preview.days)) throw new Error('Vorschau ist ungültig');
  return preview;
}

module.exports = { validateAdditionalItems, validatePreview };
