
'use strict';
(function (window) {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function additionalItemMarkup(item) {
    return `<li data-additional-id="${escapeAttribute(item.id)}" class="additional-item${item.enabled ? '' : ' paused'}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.searchTerm)} · ${escapeHtml(item.quantity)}</small></span><div class="item-actions"><button type="button" data-action="edit-additional">Bearbeiten</button><button type="button" data-action="toggle-additional">${item.enabled ? 'Pausieren' : 'Aktivieren'}</button><button type="button" data-action="delete-additional">Löschen</button></div></li>`;
  }

  function connectionStatusView(status) {
    if (status && status.connected) return { text: 'Verbunden mit Knuspr', className: 'success' };
    if (status && status.authorizationPending) return { text: 'Anmeldung läuft – Fenster abschließen, danach automatisch verbunden.', className: 'pending' };
    return { text: 'Nicht verbunden – bitte erneut mit Knuspr verbinden.', className: 'error' };
  }

  function cssEscape(value) {
    if (typeof window.CSS !== 'undefined' && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
  }

  function euro(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
  }

  // Preview lines are grouped first by these three sections, then by
  // department within each section, per the approved cart-preview design.
  const SECTION_ORDER = ['Rezepte', 'Getränke', 'Haushalt/Vorrat'];

  function lineSection(line) {
    if (line.source === 'recipe') return 'Rezepte';
    if (line.additionalCategory === 'getraenke') return 'Getränke';
    return 'Haushalt/Vorrat';
  }

  function groupLines(lines) {
    const bySection = new Map(SECTION_ORDER.map(name => [name, new Map()]));
    (lines || []).forEach((line) => {
      const bucket = bySection.get(lineSection(line));
      const department = line.department || 'Sonstiges';
      if (!bucket.has(department)) bucket.set(department, []);
      bucket.get(department).push(line);
    });
    return SECTION_ORDER
      .map(name => ({ name, departments: [...bySection.get(name).entries()].sort((a, b) => a[0].localeCompare(b[0], 'de-DE')) }))
      .filter(section => section.departments.length > 0);
  }

  function computeFlowState(preview) {
    const open = (preview && preview.lines || []).filter(line => !line.removed && line.status !== 'selected');
    return open.length > 0 ? 'needs-review' : 'ready';
  }

  const LINE_STATUS_LABELS = {
    ambiguous: 'Mehrdeutig – bitte eine Alternative wählen',
    missing: 'Kein passendes lieferbares Produkt gefunden',
  };

  const RECEIPT_STATUS_LABELS = {
    added: 'Hinzugefügt',
    failed: 'Fehlgeschlagen',
    uncertain: 'Status unklar',
  };

  function productLineMarkup(line) {
    const product = line.product;
    const needsAttention = line.status !== 'selected';
    const warning = needsAttention
      ? `<p class="line-warning" role="status">${escapeHtml(LINE_STATUS_LABELS[line.status] || 'Bitte prüfen')}</p>`
      : '';
    const image = product && product.imageUrl
      ? `<img src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" width="56" height="56">`
      : '<span class="product-placeholder" aria-hidden="true">🛒</span>';
    const name = product ? escapeHtml(product.name) : 'Kein Produkt ausgewählt';
    const brand = product && product.brand ? ` <small>${escapeHtml(product.brand)}</small>` : '';
    const demand = line.demand || {};
    const demandLabel = [demand.amount, demand.unit].filter(part => part !== undefined && part !== null && part !== '').map(escapeHtml).join(' ');
    const packageLabel = product && product.package && product.package.label ? escapeHtml(product.package.label) : '';
    const quantity = Number.isFinite(line.cartQuantity) ? line.cartQuantity : null;
    const orderedLabel = quantity != null ? `${escapeHtml(quantity)} × ${packageLabel}` : '–';
    const priceLabel = Number.isFinite(line.totalPrice) ? euro(line.totalPrice) : 'Preis offen';
    const offer = product && product.price && product.price.offer ? '<span class="chip">Angebot</span>' : '';
    const reason = line.reason ? `<p class="line-reason">${escapeHtml(line.reason)}</p>` : '';
    const removed = Boolean(line.removed);
    return `<li class="product-line${needsAttention ? ' needs-attention' : ''}${removed ? ' removed' : ''}" data-line-id="${escapeAttribute(line.id)}">${warning}<div class="line-body"><div class="line-media">${image}</div><div class="line-info"><strong>${name}</strong>${brand}<small>Benötigt: ${demandLabel || '–'} · Bestellt: ${orderedLabel}</small>${reason}</div><div class="line-price">${offer}<strong>${priceLabel}</strong></div><div class="line-actions"><button type="button" class="btn subtle touch-target" data-action="alternatives" data-line-id="${escapeAttribute(line.id)}">Alternative wählen</button><button type="button" class="btn ghost touch-target" data-action="toggle-remove" data-line-id="${escapeAttribute(line.id)}">${removed ? 'Wiederherstellen' : 'Entfernen'}</button></div></div></li>`;
  }

  function departmentGroupMarkup(department, lines, groupId) {
    return `<div class="product-group"><button type="button" class="product-group-toggle touch-target" aria-expanded="true" aria-controls="${groupId}"><span>${escapeHtml(department)}</span><span class="group-count">${lines.length}</span></button><ul class="product-lines" id="${groupId}">${lines.map(productLineMarkup).join('')}</ul></div>`;
  }

  function cartSectionMarkup(section, groupIdPrefix) {
    return `<section class="cart-section"><h3>${escapeHtml(section.name)}</h3>${section.departments.map(([department, lines], index) => (
      departmentGroupMarkup(department, lines, `${groupIdPrefix}-${index}`)
    )).join('')}</section>`;
  }

  function receiptListMarkup(receipt) {
    const lines = receipt && receipt.lines || [];
    const heading = lines.length && lines.every(line => line.status === 'added') ? 'Warenkorb aktualisiert' : 'Teilweise übertragen';
    return `<div class="cart-receipt" role="status"><h3>${escapeHtml(heading)}</h3><ul class="receipt-lines">${lines.map(line => (
      `<li>${escapeHtml(RECEIPT_STATUS_LABELS[line.status] || line.status)} · ${escapeHtml(line.requested)} Stück${line.errorCode ? ` (${escapeHtml(line.errorCode)})` : ''}</li>`
    )).join('')}</ul></div>`;
  }

  function planSummaryMarkup(plan, preview) {
    const planDays = (plan && plan.days) || [];
    const openCount = preview ? preview.lines.filter(line => !line.removed && line.status !== 'selected').length : 0;
    return `<div class="plan-summary"><span class="eyebrow">EUER WOCHENPLAN</span><h2>Sieben Abende, ein Warenkorb</h2><ul class="plan-days">${planDays.map(day => (
      `<li class="plan-day-chip"><span class="day-label">${escapeHtml(day.day)}</span><strong>${escapeHtml(day.name)}</strong></li>`
    )).join('')}</ul><div class="summary-grid"><div><span>Abende</span><strong>${escapeHtml(planDays.length)}</strong></div><div><span>Portionen</span><strong>${escapeHtml((plan && plan.servings) || 2)}</strong></div><div><span>Voraussichtlicher Warenwert</span><strong>${preview ? euro(preview.estimatedTotal) : '–'}</strong></div><div><span>Offene Positionen</span><strong>${openCount}</strong></div></div><button type="button" id="reviewKnusprCart" class="btn primary touch-target">Warenkorb prüfen</button></div>`;
  }

  function flowMarkup(flow) {
    if (flow.state === 'idle') {
      return '<p class="muted">Noch kein Wochenplan – „Wochenplan erstellen“ startet die Planung.</p>';
    }
    if (flow.state === 'loading') {
      return '<p class="status pending" role="status">Wochenplan wird erstellt …</p>';
    }
    if (flow.state === 'offline' && !flow.plan) {
      return '<p class="status error" role="status">Keine Verbindung zu Knuspr. Bitte später erneut versuchen.</p>';
    }
    const offlineBanner = flow.state === 'offline'
      ? '<p class="status error" role="status">Keine Verbindung zu Knuspr – zuletzt gespeicherter Plan wird angezeigt.</p>'
      : '';
    if (flow.view !== 'cart') {
      return offlineBanner + planSummaryMarkup(flow.plan, flow.preview);
    }
    const sections = groupLines((flow.preview && flow.preview.lines) || []);
    // Shown whenever the last apply attempt came back changed, independent of
    // whether the refreshed preview also reintroduced an unresolved line (in
    // which case needs-review still wins for the apply button below).
    const reconfirmBanner = flow.priceUpdated
      ? '<p class="status pending" role="status">Preis wurde aktualisiert. Bitte prüfen und erneut bestätigen.</p>'
      : '';
    const needsReviewBanner = flow.state === 'needs-review'
      ? '<p class="status pending" role="status">Bitte offene Positionen klären, bevor ihr übertragt.</p>'
      : '';
    const receiptMarkup = flow.receipt ? receiptListMarkup(flow.receipt) : '';
    return `${offlineBanner}<div class="cart-preview"><span class="eyebrow">WARENKORBVORSCHAU</span><h2>Warenkorbvorschau</h2>${reconfirmBanner}${needsReviewBanner}${sections.map((section, index) => cartSectionMarkup(section, `group-${index}`)).join('') || '<p class="muted">Keine Positionen vorhanden.</p>'}${receiptMarkup}<button type="button" id="backToSummary" class="btn ghost touch-target">Zurück zur Wochenübersicht</button></div>`;
  }

  function cartActionBarView(flow) {
    if (flow.view !== 'cart' || !flow.preview) return { hidden: true, html: '' };
    // Terminal once complete: nothing left to submit, so the button must not
    // invite a resend of an already-applied cart.
    const disabled = flow.applying || flow.state === 'needs-review' || flow.state === 'complete';
    const label = flow.applying ? 'Wird übertragen …' : 'Zu Knuspr übertragen';
    return {
      hidden: false,
      html: `<span class="cart-total">Geschätzt <strong>${euro(flow.preview.estimatedTotal)}</strong></span><button type="button" id="applyKnusprCart" class="btn primary touch-target"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>`,
    };
  }

  function generateId() {
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function init({ api, document: doc } = {}) {
    if (!api) throw new Error('KNUSPR_UI.init benötigt eine api-Instanz');
    const activeDocument = doc || window.document;
    if (!activeDocument) throw new Error('KNUSPR_UI.init benötigt ein document');

    const $ = selector => activeDocument.querySelector(selector);
    const $$ = selector => [...activeDocument.querySelectorAll(selector)];

    let items = [];
    let editingId = null;

    // Guided weekly-plan / cart-preview flow state. `state` is one of:
    // idle, loading, ready, needs-review, reconfirm-required, applying,
    // partial, complete, offline. `view` toggles between the plan-ready
    // summary and the cart preview within the same container.
    const flow = { state: 'idle', view: 'summary', plan: null, preview: null, receipt: null, applying: false, priceUpdated: false };
    let applyInFlight = false;
    let lastAlternativesLineId = null;

    function toast(message) {
      const el = $('#toast');
      if (!el) return;
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    function renderStatus(status) {
      const el = $('#knusprConnectionStatus');
      const connectBtn = $('#connectKnuspr');
      const disconnectBtn = $('#disconnectKnuspr');
      const view = connectionStatusView(status);
      if (el) {
        el.textContent = view.text;
        el.className = `status ${view.className}`;
      }
      if (connectBtn) connectBtn.hidden = Boolean(status && status.connected);
      if (disconnectBtn) disconnectBtn.hidden = !(status && status.connected);
    }

    async function refreshStatus() {
      try {
        const status = await api.getKnusprStatus();
        renderStatus(status);
        return status;
      } catch (error) {
        renderStatus(null);
        return null;
      }
    }

    function resetForm() {
      editingId = null;
      const form = $('#additionalItemForm');
      if (form) form.reset();
      const submitBtn = $('#saveAdditionalItems');
      if (submitBtn) submitBtn.textContent = 'Hinzufügen';
    }

    function fillForm(item) {
      editingId = item.id;
      if ($('#additionalItemLabel')) $('#additionalItemLabel').value = item.label;
      if ($('#additionalItemSearchTerm')) $('#additionalItemSearchTerm').value = item.searchTerm;
      if ($('#additionalItemQuantity')) $('#additionalItemQuantity').value = item.quantity;
      if ($('#additionalItemCategory')) $('#additionalItemCategory').value = item.category;
      const submitBtn = $('#saveAdditionalItems');
      if (submitBtn) submitBtn.textContent = 'Aktualisieren';
    }

    function renderItems() {
      const list = $('#additionalItems');
      if (!list) return;
      list.innerHTML = items.length
        ? items.map(additionalItemMarkup).join('')
        : '<li class="empty">Noch keine zusätzlichen Artikel.</li>';
      bindItemActions();
    }

    // Persists the full next state to the server and only ever stores the
    // server's validated echo back into local view state (never the
    // optimistic client-side array), per the "save only validated server
    // responses" contract. api.saveAdditionalItems() itself throws if the
    // response isn't a validated array, so there is no fallback here to the
    // caller-supplied nextItems.
    async function persist(nextItems) {
      items = await api.saveAdditionalItems(nextItems);
      renderItems();
      return items;
    }

    function bindItemActions() {
      $$('#additionalItems [data-additional-id]').forEach(li => {
        const id = li.dataset.additionalId;
        const item = items.find(candidate => String(candidate.id) === id);
        if (!item) return;
        const editBtn = li.querySelector('[data-action="edit-additional"]');
        const toggleBtn = li.querySelector('[data-action="toggle-additional"]');
        const deleteBtn = li.querySelector('[data-action="delete-additional"]');
        if (editBtn) editBtn.onclick = () => fillForm(item);
        if (toggleBtn) toggleBtn.onclick = async () => {
          try {
            await persist(items.map(candidate => (candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate)));
            toast(item.enabled ? 'Artikel pausiert' : 'Artikel aktiviert');
          } catch (error) {
            toast(error.message || 'Aktualisierung fehlgeschlagen');
          }
        };
        if (deleteBtn) deleteBtn.onclick = async () => {
          try {
            await persist(items.filter(candidate => candidate.id !== item.id));
            if (editingId === item.id) resetForm();
            toast('Artikel gelöscht');
          } catch (error) {
            toast(error.message || 'Löschen fehlgeschlagen');
          }
        };
      });
    }

    async function loadItems() {
      try {
        items = await api.getAdditionalItems();
        renderItems();
      } catch (error) {
        toast('Zusatzliste konnte nicht geladen werden');
      }
    }

    function bindForm() {
      const form = $('#additionalItemForm');
      if (!form) return;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const label = ($('#additionalItemLabel') || {}).value?.trim() || '';
        const searchTerm = ($('#additionalItemSearchTerm') || {}).value?.trim() || '';
        const quantity = Number(($('#additionalItemQuantity') || {}).value);
        const category = ($('#additionalItemCategory') || {}).value;
        if (!label || !searchTerm || !(quantity > 0) || !category) {
          toast('Bitte alle Felder gültig ausfüllen');
          return;
        }
        const nextItems = editingId
          ? items.map(candidate => (candidate.id === editingId ? { ...candidate, label, searchTerm, quantity, category } : candidate))
          : [...items, { id: generateId(), label, searchTerm, quantity, category, enabled: true, pinnedProductId: null }];
        try {
          const wasEditing = Boolean(editingId);
          await persist(nextItems);
          resetForm();
          toast(wasEditing ? 'Artikel aktualisiert' : 'Artikel hinzugefügt');
        } catch (error) {
          toast(error.message || 'Speichern fehlgeschlagen');
        }
      });
    }

    function bindConnection() {
      const connectBtn = $('#connectKnuspr');
      const disconnectBtn = $('#disconnectKnuspr');
      if (connectBtn) connectBtn.onclick = async () => {
        try {
          const result = await api.connectKnuspr();
          if (result && result.authorizationUrl && typeof window.open === 'function') {
            window.open(result.authorizationUrl, '_blank', 'noopener');
          }
          await refreshStatus();
        } catch (error) {
          toast(error.message || 'Verbindung fehlgeschlagen');
        }
      };
      if (disconnectBtn) disconnectBtn.onclick = async () => {
        try {
          await api.disconnectKnuspr();
          await refreshStatus();
          toast('Knuspr-Verbindung getrennt');
        } catch (error) {
          toast(error.message || 'Trennen fehlgeschlagen');
        }
      };
    }

    function currentLine(lineId) {
      return flow.preview && flow.preview.lines.find(line => line.id === lineId);
    }

    function isOfflineError(error) {
      return error instanceof TypeError;
    }

    function renderFlow() {
      const flowEl = $('#knusprFlow');
      if (flowEl) flowEl.innerHTML = flowMarkup(flow);
      const barEl = $('#cartActionBar');
      if (barEl) {
        const bar = cartActionBarView(flow);
        barEl.innerHTML = bar.html;
        barEl.hidden = bar.hidden;
      }
      bindFlowEvents();
    }

    function bindFlowEvents() {
      const reviewBtn = $('#reviewKnusprCart');
      if (reviewBtn) reviewBtn.onclick = () => { flow.view = 'cart'; renderFlow(); };
      const backBtn = $('#backToSummary');
      if (backBtn) backBtn.onclick = () => { flow.view = 'summary'; renderFlow(); };
      const applyBtn = $('#applyKnusprCart');
      if (applyBtn) applyBtn.onclick = () => applyCartHandler();
      $$('.product-group-toggle').forEach((toggle) => {
        toggle.onclick = () => {
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', String(!expanded));
          const list = activeDocument.getElementById(toggle.getAttribute('aria-controls'));
          if (list) list.hidden = expanded;
        };
      });
      $$('[data-action="alternatives"]').forEach((btn) => {
        btn.onclick = () => openAlternativesDialog(btn.dataset.lineId);
      });
      $$('[data-action="toggle-remove"]').forEach((btn) => {
        btn.onclick = () => toggleLineRemoved(btn.dataset.lineId);
      });
    }

    async function toggleLineRemoved(lineId) {
      const line = currentLine(lineId);
      if (!line) return;
      try {
        const updated = await api.patchPreview({ lineId, changes: { removed: !line.removed } });
        flow.preview = updated;
        flow.state = computeFlowState(updated);
        flow.priceUpdated = false;
        renderFlow();
      } catch (error) {
        toast(error.message || 'Aktualisierung fehlgeschlagen');
      }
    }

    function alternativesDialogMarkup(line) {
      const options = [line.product, ...(line.alternatives || [])].filter(Boolean);
      return `<button type="button" id="closeKnusprAlternatives" class="dialog-close" aria-label="Schließen">×</button><div class="dialog-inner"><h2 id="knusprAltTitle">Alternative wählen</h2><ul class="alternatives-list">${
        options.length
          ? options.map(product => (
            `<li><button type="button" class="alternative-option touch-target" data-product-id="${escapeAttribute(product.id)}"${line.product && line.product.id === product.id ? ' aria-pressed="true"' : ''}><strong>${escapeHtml(product.name)}</strong><span>${Number.isFinite(product.price && product.price.current) ? euro(product.price.current) : 'Preis offen'}</span></button></li>`
          )).join('')
          : '<li>Keine Alternativen verfügbar.</li>'
      }</ul></div>`;
    }

    function bindAlternativesDialogEvents(lineId) {
      const dialog = $('#knusprAlternativesDialog');
      $$('#knusprAlternativesDialog [data-product-id]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const updated = await api.patchPreview({ lineId, changes: { productId: btn.dataset.productId } });
            flow.preview = updated;
            flow.state = computeFlowState(updated);
            flow.priceUpdated = false;
            if (dialog) dialog.close();
          } catch (error) {
            toast(error.message || 'Auswahl fehlgeschlagen');
          }
        };
      });
      const closeBtn = $('#closeKnusprAlternatives');
      if (closeBtn) closeBtn.onclick = () => { if (dialog) dialog.close(); };
    }

    function openAlternativesDialog(lineId) {
      const line = currentLine(lineId);
      const dialog = $('#knusprAlternativesDialog');
      if (!line || !dialog) return;
      lastAlternativesLineId = lineId;
      dialog.innerHTML = alternativesDialogMarkup(line);
      bindAlternativesDialogEvents(lineId);
      dialog.showModal();
      const first = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }

    function bindAlternativesDialogChrome() {
      const dialog = $('#knusprAlternativesDialog');
      if (!dialog) return;
      dialog.addEventListener('close', () => {
        const lineId = lastAlternativesLineId;
        lastAlternativesLineId = null;
        renderFlow();
        const trigger = lineId && $(`[data-action="alternatives"][data-line-id="${cssEscape(lineId)}"]`);
        if (trigger && typeof trigger.focus === 'function') trigger.focus();
      });
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }

    async function generatePlanHandler() {
      const btn = $('#generateKnusprPlan');
      if (btn) btn.disabled = true;
      flow.state = 'loading';
      renderFlow();
      try {
        const exclusionsField = $('#dietaryExclusions');
        const excludedIngredients = (exclusionsField ? exclusionsField.value : '')
          .split(/[,;\n]/).map(value => value.trim()).filter(Boolean);
        const plan = await api.generatePlan({ excludedIngredients });
        flow.plan = plan;
        flow.preview = plan.shoppingPreview;
        flow.receipt = null;
        flow.priceUpdated = false;
        flow.view = 'summary';
        flow.state = computeFlowState(flow.preview);
      } catch (error) {
        flow.state = isOfflineError(error) ? 'offline' : (flow.plan ? computeFlowState(flow.preview) : 'idle');
        toast(error.message || 'Wochenplan konnte nicht erstellt werden');
      } finally {
        if (btn) btn.disabled = false;
        renderFlow();
      }
    }

    // A refreshed preview (from either a reconfirm-required or a partial
    // response that also had to re-validate mid-delta) may reintroduce an
    // ambiguous or missing line. needs-review must always win over whatever
    // status the server reported, so the apply button stays disabled until
    // every line is resolved again.
    function stateAfterPreviewRefresh(preview, fallbackState) {
      return computeFlowState(preview) === 'needs-review' ? 'needs-review' : fallbackState;
    }

    function acceptedLineIdsForApply() {
      // A retry after a partial apply must only resend the lines that are
      // still outstanding - lines the last receipt already marked "added"
      // are excluded so a resubmit can never duplicate a successful add.
      const alreadyAdded = new Set((flow.receipt && flow.receipt.lines || [])
        .filter(entry => entry.status === 'added')
        .map(entry => entry.lineId));
      return flow.preview.lines
        .filter(line => !line.removed && line.status === 'selected' && !alreadyAdded.has(line.id))
        .map(line => line.id);
    }

    async function applyCartHandler() {
      if (applyInFlight || !flow.preview || flow.state === 'needs-review' || flow.state === 'complete') return;
      applyInFlight = true;
      flow.applying = true;
      flow.state = 'applying';
      flow.priceUpdated = false;
      renderFlow();
      try {
        const acceptedLineIds = acceptedLineIdsForApply();
        const result = await api.applyCart({ previewRevision: flow.preview.revision, acceptedLineIds });
        if (result && result.status === 'reconfirm-required') {
          flow.preview = result.preview;
          flow.priceUpdated = true;
          flow.state = stateAfterPreviewRefresh(result.preview, 'reconfirm-required');
        } else if (result && result.status === 'partial') {
          flow.receipt = result.receipt;
          if (result.preview) {
            flow.preview = result.preview;
            flow.priceUpdated = true;
            flow.state = stateAfterPreviewRefresh(result.preview, 'partial');
          } else {
            flow.state = 'partial';
          }
        } else if (result && result.status === 'complete') {
          flow.receipt = result.receipt;
          flow.state = 'complete';
        } else {
          flow.state = computeFlowState(flow.preview);
        }
      } catch (error) {
        toast(error.message || 'Übertragung fehlgeschlagen');
        try {
          const fresh = await api.getPreview();
          if (fresh) flow.preview = fresh;
          flow.state = computeFlowState(flow.preview);
        } catch {
          // Resync also failed: fall back to the last known preview so the
          // state never gets stuck on the transient "applying" value.
          flow.state = computeFlowState(flow.preview);
        }
      } finally {
        applyInFlight = false;
        flow.applying = false;
        renderFlow();
      }
    }

    function renderPlan(plan) {
      flow.plan = plan;
      flow.preview = plan && plan.shoppingPreview;
      flow.receipt = null;
      flow.priceUpdated = false;
      flow.state = flow.preview ? computeFlowState(flow.preview) : 'idle';
      renderFlow();
    }

    function bindGenerateButton() {
      const btn = $('#generateKnusprPlan');
      if (btn) btn.onclick = () => generatePlanHandler();
    }

    bindGenerateButton();
    bindAlternativesDialogChrome();
    renderFlow();

    bindForm();
    bindConnection();
    refreshStatus();
    loadItems();

    return { refreshStatus, loadItems, renderItems, renderPlan };
  }

  window.KNUSPR_UI = { init, escapeHtml, escapeAttribute, additionalItemMarkup };
})(typeof window !== 'undefined' ? window : globalThis);
