'use strict';

(function () {
  const configElement = document.getElementById('admin-initial-data');
  const feedbackElement = document.getElementById('admin-feedback');
  const loginSection = document.getElementById('login-section');
  const historySection = document.getElementById('history-section');
  const courtsSection = document.getElementById('courts-section');
  const streamSection = document.getElementById('stream-section');
  const loginForm = document.getElementById('admin-login-form');
  const refreshHistoryButton = document.getElementById('refresh-history');
  const historyTableBody = document.getElementById('history-rows');
  const courtForm = document.getElementById('court-form');
  const refreshCourtsButton = document.getElementById('refresh-courts');
  const courtsTableBody = document.getElementById('courts-rows');
  const youtubeConfigForm = document.getElementById('youtube-config-form');
  const youtubeApiKeyInput = document.getElementById('youtube-api-key');
  const youtubeStreamIdInput = document.getElementById('youtube-stream-id');
  const refreshViewersButton = document.getElementById('refresh-viewers');
  const viewerCountElement = document.getElementById('viewer-count');
  const viewerStatusElement = document.getElementById('viewer-status');
  const bodyElement = document.body;
  const adminDisabledSection = document.getElementById('admin-disabled-section');
  const systemSection = document.getElementById('system-section');
  const unoToggle = document.getElementById('uno-requests-toggle');
  const unoToggleStatus = document.getElementById('uno-toggle-status');
  const pluginToggle = document.getElementById('plugin-toggle');
  const pluginToggleStatus = document.getElementById('plugin-toggle-status');
  const unoStatusCard = document.getElementById('uno-status-card');
  const unoDailySummary = document.getElementById('uno-daily-summary');
  const unoHourlySummary = document.getElementById('uno-hourly-summary');
  const unoStatusLabel = document.getElementById('uno-status-label');
  const unoActivityNote = document.getElementById('uno-activity-note');
  const unoAutoDisabled = document.getElementById('uno-auto-disabled');
  const unoPollerForm = document.getElementById('uno-poller-form');
  const unoHourlyLimitInput = document.getElementById('uno-hourly-limit');
  const unoSlowdownThresholdInput = document.getElementById('uno-slowdown-threshold');
  const unoSlowdownFactorInput = document.getElementById('uno-slowdown-factor');
  const unoSlowdownSleepInput = document.getElementById('uno-slowdown-sleep');
  const unoRateLimitMeta = document.getElementById('uno-rate-limit-meta');
  const unoRateLimitHeader = document.getElementById('uno-rate-limit-header');
  const unoRateLimitUpdated = document.getElementById('uno-rate-limit-updated');
  const unoRateLimitReset = document.getElementById('uno-rate-limit-reset');
  const unoActivityResetButton = document.getElementById('uno-activity-reset');
  const playersSection = document.getElementById('players-section');
  const playerForm = document.getElementById('player-form');
  const playersTableBody = document.getElementById('players-rows');
  const refreshPlayersButton = document.getElementById('refresh-players');
  const playerImportForm = document.getElementById('player-import-form');
  const FLAG_DATALIST_ID = 'flag-code-options';

  if (!configElement) {
    return;
  }

  let initialConfig;
  try {
    initialConfig = JSON.parse(configElement.textContent || '{}');
  } catch (error) {
    console.error('Niepoprawne dane początkowe panelu administratora', error);
    initialConfig = { history: [], is_authenticated: false, int_fields: [] };
  }

  const adminEnabled = initialConfig.admin_enabled !== false;
  const disabledMessage =
    initialConfig.admin_disabled_message ||
    'Panel administracyjny jest wyłączony przez administratora.';
  const intFields = new Set(initialConfig.int_fields || []);
  const initialCourts = Array.isArray(initialConfig.courts) ? initialConfig.courts : [];
  const initialPlayers = Array.isArray(initialConfig.players) ? initialConfig.players : [];
  let unoRequestsEnabled = initialConfig.uno_requests_enabled === true;
  let pluginEnabled = initialConfig.plugin_enabled === true;
  let unoRateLimitInfo = initialConfig.uno_rate_limit && typeof initialConfig.uno_rate_limit === 'object'
    ? initialConfig.uno_rate_limit
    : null;
  let unoHourlyUsage = initialConfig.uno_hourly_usage && typeof initialConfig.uno_hourly_usage === 'object'
    ? initialConfig.uno_hourly_usage
    : {};
  let unoPollerConfig = initialConfig.uno_hourly_config && typeof initialConfig.uno_hourly_config === 'object'
    ? initialConfig.uno_hourly_config
    : null;
  let unoAutoDisabledReason = typeof initialConfig.uno_auto_disabled_reason === 'string'
    ? initialConfig.uno_auto_disabled_reason
    : null;
  let unoActivityStatus = initialConfig.uno_activity_status && typeof initialConfig.uno_activity_status === 'object'
    ? initialConfig.uno_activity_status
    : null;
  let flagCatalog = [];
  const flagCatalogMap = new Map();
  let flagCatalogPromise = null;

  const fieldDefinitions = [
    { name: 'kort_id', type: 'text' },
    { name: 'ended_ts', type: 'text' },
    { name: 'duration_seconds', type: 'number' },
    { name: 'category', type: 'text' },
    { name: 'phase', type: 'text' },
    { name: 'player_a', type: 'text' },
    { name: 'player_b', type: 'text' },
    { name: 'set1_a', type: 'number' },
    { name: 'set1_b', type: 'number' },
    { name: 'set2_a', type: 'number' },
    { name: 'set2_b', type: 'number' },
    { name: 'tie_a', type: 'number' },
    { name: 'tie_b', type: 'number' },
    { name: 'set1_tb_a', type: 'number' },
    { name: 'set1_tb_b', type: 'number' },
    { name: 'set2_tb_a', type: 'number' },
    { name: 'set2_tb_b', type: 'number' }
  ];

  const playerFieldDefinitions = [
    { name: 'name', type: 'text' },
    { name: 'list_name', type: 'text' },
    { name: 'flag_code', type: 'text' },
    { name: 'flag_url', type: 'url' }
  ];

  function setFeedback(message, type = 'info') {
    if (!feedbackElement) {
      return;
    }
    feedbackElement.textContent = message || '';
    feedbackElement.dataset.type = type;
  }

  function setViewerStatus(message, type = 'info') {
    if (!viewerStatusElement) {
      return;
    }
    const text = message || '';
    viewerStatusElement.textContent = text;
    viewerStatusElement.hidden = text === '';
    if (viewerStatusElement.hidden) {
      viewerStatusElement.classList.remove('error');
      return;
    }
    if (type === 'error') {
      viewerStatusElement.classList.add('error');
    } else {
      viewerStatusElement.classList.remove('error');
    }
  }

  function applyFlagCodeAttributes(input) {
    if (!input) {
      return;
    }
    input.setAttribute('list', FLAG_DATALIST_ID);
    input.autocomplete = 'off';
    input.maxLength = 2;
  }

  function initializeFlagInputs(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('input[name="flag_code"]').forEach((input) => {
      applyFlagCodeAttributes(input);
    });
  }

  function updateFlagCatalogMap() {
    flagCatalogMap.clear();
    flagCatalog.forEach((item) => {
      if (!item || typeof item.code !== 'string') {
        return;
      }
      const code = item.code.trim().toLowerCase();
      if (!code) {
        return;
      }
      flagCatalogMap.set(code, {
        code,
        url: typeof item.url === 'string' ? item.url : '',
        label: item.label || code.toUpperCase()
      });
    });
  }

  function renderFlagOptionsList() {
    const datalist = document.getElementById(FLAG_DATALIST_ID);
    if (!datalist) {
      return;
    }
    datalist.innerHTML = '';
    flagCatalog.forEach((item) => {
      if (!item || !item.code) {
        return;
      }
      const option = document.createElement('option');
      option.value = item.code.toLowerCase();
      option.textContent = item.label || item.code.toUpperCase();
      datalist.appendChild(option);
    });
  }

  function setFlagUrlSuggestion(codeInput, urlInput, options = {}) {
    if (!codeInput || !urlInput) {
      return;
    }
    const { force = false } = options;
    const rawCode = String(codeInput.value || '').trim().toLowerCase();
    const suggestion = rawCode ? flagCatalogMap.get(rawCode) : null;
    if (!suggestion) {
      if (!force && urlInput.dataset.suggestedUrl && urlInput.value === urlInput.dataset.suggestedUrl) {
        urlInput.value = '';
      }
      delete urlInput.dataset.suggestedUrl;
      return;
    }
    const current = (urlInput.value || '').trim();
    const suggested = suggestion.url || '';
    if (!suggested) {
      return;
    }
    const previousSuggestion = urlInput.dataset.suggestedUrl || '';
    const shouldApply = force || !current || current === previousSuggestion;
    if (!shouldApply) {
      return;
    }
    urlInput.value = suggested;
    urlInput.dataset.suggestedUrl = suggested;
  }

  function applyFlagSuggestions(scope, options = {}) {
    if (!flagCatalog.length) {
      return;
    }
    const root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('input[name="flag_code"]').forEach((codeInput) => {
      const container = codeInput.closest('tr') || codeInput.closest('form');
      if (!container) {
        return;
      }
      const urlInput = container.querySelector('input[name="flag_url"]');
      if (!urlInput) {
        return;
      }
      const shouldForce = Boolean(options.force) || !(urlInput.value || '').trim();
      setFlagUrlSuggestion(codeInput, urlInput, { force: shouldForce });
    });
  }

  function handleFlagCodeChange(event) {
    const target = event.target;
    if (!target || target.name !== 'flag_code') {
      return;
    }
    const container = target.closest('tr') || target.closest('form');
    if (!container) {
      return;
    }
    const urlInput = container.querySelector('input[name="flag_url"]');
    if (!urlInput) {
      return;
    }
    setFlagUrlSuggestion(target, urlInput, { force: event.type === 'change' });
  }

  async function loadFlagCatalog() {
    try {
      const data = await requestJson('/api/admin/flags', { method: 'GET' });
      if (Array.isArray(data.flags)) {
        flagCatalog = data.flags
          .map((item) => ({
            code: typeof item.code === 'string' ? item.code.trim().toLowerCase() : '',
            url: typeof item.url === 'string' ? item.url : '',
            label: typeof item.label === 'string' ? item.label : undefined
          }))
          .filter((item) => item.code);
        updateFlagCatalogMap();
        renderFlagOptionsList();
        applyFlagSuggestions(document);
      }
    } catch (error) {
      console.warn('Nie udało się pobrać listy flag', error);
      throw error;
    }
  }

  function ensureFlagCatalogLoaded() {
    if (flagCatalogPromise) {
      return flagCatalogPromise;
    }
    flagCatalogPromise = loadFlagCatalog().catch((error) => {
      flagCatalogPromise = null;
      return Promise.reject(error);
    });
    return flagCatalogPromise;
  }

  function reloadFlagCatalog() {
    flagCatalogPromise = null;
    return ensureFlagCatalogLoaded();
  }

  function toggleAuthenticated(isAuthenticated) {
    if (!adminEnabled) {
      if (loginSection) {
        loginSection.hidden = true;
      }
      if (historySection) {
        historySection.hidden = true;
      }
      if (courtsSection) {
        courtsSection.hidden = true;
      }
      if (streamSection) {
        streamSection.hidden = true;
      }
      if (adminDisabledSection) {
        adminDisabledSection.hidden = false;
      }
      if (bodyElement) {
        bodyElement.dataset.authenticated = 'false';
        bodyElement.dataset.adminEnabled = 'false';
      }
      return;
    }
    if (loginSection) {
      loginSection.hidden = Boolean(isAuthenticated);
    }
    if (historySection) {
      historySection.hidden = !isAuthenticated;
    }
    if (courtsSection) {
      courtsSection.hidden = !isAuthenticated;
    }
    if (streamSection) {
      streamSection.hidden = !isAuthenticated;
    }
    if (systemSection) {
      systemSection.hidden = !isAuthenticated;
    }
    if (playersSection) {
      playersSection.hidden = !isAuthenticated;
    }
    if (isAuthenticated) {
      ensureFlagCatalogLoaded().catch(() => {});
    }
    if (bodyElement) {
      bodyElement.dataset.authenticated = isAuthenticated ? 'true' : 'false';
      bodyElement.dataset.adminEnabled = 'true';
    }
  }

  function createInput(field, value) {
    const input = document.createElement('input');
    input.name = field.name;
    input.type = field.type;
    input.value = value ?? '';
    if (field.type === 'number') {
      input.inputMode = 'numeric';
      input.step = '1';
    }
    return input;
  }

  function createRow(entry) {
    const row = document.createElement('tr');
    row.dataset.entryId = String(entry.id);

    const idCell = document.createElement('td');
    idCell.className = 'id';
    idCell.textContent = String(entry.id);
    row.appendChild(idCell);

    fieldDefinitions.forEach((field) => {
      const cell = document.createElement('td');
      const value = entry[field.name];
      const input = createInput(field, value === null ? '' : value);
      cell.appendChild(input);
      row.appendChild(cell);
    });

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'update-entry';
    updateButton.textContent = 'Zapisz';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-entry';
    deleteButton.textContent = 'Usuń';
    actionsCell.appendChild(updateButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
  }

  function renderHistory(entries) {
    if (!historyTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    (entries || []).forEach((entry) => {
      fragment.appendChild(createRow(entry));
    });

    if (typeof historyTableBody.replaceChildren === 'function') {
      historyTableBody.replaceChildren(fragment);
    } else {
      historyTableBody.innerHTML = '';
      historyTableBody.appendChild(fragment);
    }
  }

  function createCourtRow(court) {
    const row = document.createElement('tr');
    row.dataset.kortId = String(court.kort_id);

    const kortCell = document.createElement('td');
    kortCell.className = 'kort-id';
    kortCell.textContent = String(court.kort_id);
    row.appendChild(kortCell);

    const overlayCell = document.createElement('td');
    overlayCell.className = 'overlay-id';
    overlayCell.textContent = court.overlay_id ? String(court.overlay_id) : '';
    row.appendChild(overlayCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'reset-court';
    resetButton.textContent = 'Resetuj';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-court';
    deleteButton.textContent = 'Usuń';
    actionsCell.appendChild(resetButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
  }

  function renderCourts(courts) {
    if (!courtsTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    (courts || []).forEach((court) => {
      fragment.appendChild(createCourtRow(court));
    });

    if (typeof courtsTableBody.replaceChildren === 'function') {
      courtsTableBody.replaceChildren(fragment);
    } else {
      courtsTableBody.innerHTML = '';
      courtsTableBody.appendChild(fragment);
    }
  }


  function applyUnoToggle(enabled) {
    const value = Boolean(enabled);
    unoRequestsEnabled = value;
    if (unoToggle) {
      unoToggle.checked = value;
    }
    if (unoToggleStatus) {
      unoToggleStatus.textContent = value
        ? 'Zapytania do UNO są aktywne.'
        : 'Zapytania do UNO są wyłączone.';
    }
    updateUnoStatusSummary();
  }


  function formatNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '—';
    }
    return value.toLocaleString('pl-PL');
  }


  function getPeakHourlyUsage() {
    if (!unoHourlyUsage || typeof unoHourlyUsage !== 'object') {
      return null;
    }
    let winner = null;
    Object.keys(unoHourlyUsage).forEach((kortId) => {
      const entry = unoHourlyUsage[kortId];
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const ratio = typeof entry.ratio === 'number' ? entry.ratio : 0;
      if (
        !winner ||
        ratio > winner.ratio ||
        (ratio === winner.ratio && String(entry.kort_id || kortId) < String(winner.kort_id || ''))
      ) {
        winner = {
          kort_id: entry.kort_id || kortId,
          count: typeof entry.count === 'number' ? entry.count : 0,
          limit: typeof entry.limit === 'number' ? entry.limit : 0,
          ratio,
        };
      }
    });
    return winner;
  }


  function applyUnoAutoDisabledReason(reason) {
    if (typeof reason === 'string' && reason.trim()) {
      unoAutoDisabledReason = reason.trim();
    } else {
      unoAutoDisabledReason = null;
    }
    updateUnoStatusSummary();
  }


  function applyUnoActivityStatus(status) {
    if (status && typeof status === 'object') {
      const stageValue = Number(status.stage);
      const multiplierValue = Number(status.multiplier);
      unoActivityStatus = {
        stage: Number.isFinite(stageValue) ? stageValue : 0,
        label: typeof status.label === 'string' ? status.label : null,
        description: typeof status.description === 'string' ? status.description : '',
        last_change: typeof status.last_change === 'string' ? status.last_change : null,
        multiplier: Number.isFinite(multiplierValue) ? multiplierValue : 1,
      };
    } else {
      unoActivityStatus = null;
    }
    if (unoActivityNote) {
      const shouldShowNote = Boolean(
        unoActivityStatus &&
        Number.isFinite(Number(unoActivityStatus.stage)) &&
        Number(unoActivityStatus.stage) > 0 &&
        unoActivityStatus.description
      );
      if (shouldShowNote) {
        unoActivityNote.textContent = unoActivityStatus.description;
        unoActivityNote.hidden = false;
      } else {
        unoActivityNote.textContent = '';
        unoActivityNote.hidden = true;
      }
    }
    updateUnoStatusSummary();
  }


  function applyUnoHourlyUsage(usage) {
    if (usage && typeof usage === 'object') {
      unoHourlyUsage = usage;
    } else {
      unoHourlyUsage = {};
    }
    updateUnoStatusSummary();
  }


  function applyUnoPollerConfig(config) {
    if (!config || typeof config !== 'object') {
      config = null;
    }
    unoPollerConfig = config;
    if (!unoPollerForm || !config) {
      updateUnoStatusSummary();
      return;
    }
    const limitValue = Number(config.limit);
    const thresholdPercent = typeof config.threshold_percent === 'number'
      ? config.threshold_percent
      : typeof config.threshold === 'number'
        ? config.threshold * 100
        : NaN;
    const factorValue = Number(config.slowdown_factor);
    const sleepValue = Number(config.slowdown_sleep);

    if (unoHourlyLimitInput) {
      unoHourlyLimitInput.value = Number.isFinite(limitValue) ? String(Math.round(limitValue)) : '';
    }
    if (unoSlowdownThresholdInput) {
      unoSlowdownThresholdInput.value = Number.isFinite(thresholdPercent)
        ? String(Math.round(thresholdPercent))
        : '';
    }
    if (unoSlowdownFactorInput) {
      unoSlowdownFactorInput.value = Number.isFinite(factorValue) ? String(Math.round(factorValue)) : '';
    }
    if (unoSlowdownSleepInput) {
      unoSlowdownSleepInput.value = Number.isFinite(sleepValue)
        ? sleepValue.toFixed(2)
        : '';
    }
    updateUnoStatusSummary();
  }


  function updateUnoStatusSummary() {
    if (unoDailySummary) {
      let dailyText = '—';
      if (unoRateLimitInfo && typeof unoRateLimitInfo === 'object') {
        const limitValue = Number(unoRateLimitInfo.limit);
        const remainingValue = Number(unoRateLimitInfo.remaining);
        if (Number.isFinite(limitValue) && Number.isFinite(remainingValue)) {
          const normalizedRemaining = Math.max(0, Math.min(limitValue, remainingValue));
          dailyText = `${formatNumber(normalizedRemaining)}/${formatNumber(limitValue)}`;
        } else if (Number.isFinite(remainingValue)) {
          dailyText = formatNumber(Math.max(0, remainingValue));
        } else if (Number.isFinite(limitValue)) {
          dailyText = `${formatNumber(limitValue)}`;
        } else if (unoRateLimitInfo.raw) {
          dailyText = String(unoRateLimitInfo.raw);
        }
      }
      unoDailySummary.textContent = dailyText;
    }

    const peak = getPeakHourlyUsage();
    const configLimit = unoPollerConfig && Number.isFinite(Number(unoPollerConfig.limit))
      ? Number(unoPollerConfig.limit)
      : null;
    if (unoHourlySummary) {
      let hourlyText = '—';
      if (peak && Number.isFinite(peak.limit) && peak.limit > 0) {
        const remainingValue = Number.isFinite(Number(peak.remaining))
          ? Number(peak.remaining)
          : peak.limit - Number(peak.count || 0);
        const normalized = Math.max(0, Math.min(peak.limit, remainingValue));
        hourlyText = `${formatNumber(normalized)}/${formatNumber(peak.limit)}`;
        if (peak.kort_id) {
          hourlyText += ` (kort ${peak.kort_id})`;
        }
      } else if (peak && (!Number.isFinite(peak.limit) || peak.limit <= 0)) {
        const remainingValue = Number.isFinite(Number(peak.remaining))
          ? Number(peak.remaining)
          : 0;
        hourlyText = formatNumber(Math.max(0, remainingValue));
        if (peak.kort_id) {
          hourlyText += ` (kort ${peak.kort_id})`;
        }
      } else if (configLimit !== null) {
        hourlyText = `${formatNumber(configLimit)}/${formatNumber(configLimit)}`;
      }
      unoHourlySummary.textContent = hourlyText;
    }

    let status = 'normalny';
    let limitKort = null;
    let slowdownKort = null;
    if (unoHourlyUsage && typeof unoHourlyUsage === 'object') {
      Object.values(unoHourlyUsage).forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        if ((entry.mode === 'limit' || entry.mode === 'disabled') && !limitKort) {
          limitKort = entry.kort_id || null;
        } else if (entry.mode === 'slowdown' && !slowdownKort) {
          slowdownKort = entry.kort_id || null;
        }
      });
    }

    if (!unoRequestsEnabled) {
      status = 'zatrzymany';
    } else if (unoAutoDisabledReason) {
      status = 'zatrzymany';
    } else if (limitKort) {
      status = limitKort ? `limit (kort ${limitKort})` : 'limit';
    } else if (slowdownKort) {
      status = slowdownKort ? `spowolniony (kort ${slowdownKort})` : 'spowolniony';
    } else if (unoActivityStatus && Number.isFinite(Number(unoActivityStatus.stage)) && Number(unoActivityStatus.stage) > 0) {
      status = unoActivityStatus.label || 'tryb czuwania';
    }

    if (unoStatusLabel) {
      unoStatusLabel.textContent = status;
    }

    if (unoAutoDisabled) {
      if (unoAutoDisabledReason) {
        unoAutoDisabled.textContent = `Automatycznie wyłączono: ${unoAutoDisabledReason}`;
        unoAutoDisabled.hidden = false;
      } else if (!unoRequestsEnabled) {
        unoAutoDisabled.textContent = 'Zapytania wyłączone ręcznie.';
        unoAutoDisabled.hidden = false;
      } else {
        unoAutoDisabled.textContent = '';
        unoAutoDisabled.hidden = true;
      }
    }
  }


  function applyPluginToggle(enabled) {
    const value = Boolean(enabled);
    pluginEnabled = value;
    if (pluginToggle) {
      pluginToggle.checked = value;
    }
    if (pluginToggleStatus) {
      pluginToggleStatus.textContent = value
        ? 'Wtyczka jest używana i jej komunikaty są akceptowane.'
        : 'Komunikaty od wtyczki są ignorowane.';
    }
  }


  function applyUnoSystemData(data) {
    if (!data || typeof data !== 'object') {
      return;
    }
    if (typeof data.uno_hourly_config !== 'undefined') {
      applyUnoPollerConfig(data.uno_hourly_config);
    }
    if (typeof data.uno_hourly_usage !== 'undefined') {
      applyUnoHourlyUsage(data.uno_hourly_usage);
    }
    if (typeof data.uno_activity_status !== 'undefined') {
      applyUnoActivityStatus(data.uno_activity_status);
    }
    if (typeof data.uno_rate_limit !== 'undefined') {
      applyUnoRateLimit(data.uno_rate_limit);
    }
    if (typeof data.uno_auto_disabled_reason !== 'undefined') {
      applyUnoAutoDisabledReason(data.uno_auto_disabled_reason);
    }
    if (typeof data.uno_requests_enabled !== 'undefined') {
      applyUnoToggle(data.uno_requests_enabled);
    }
  }


  function applyUnoRateLimit(info) {
    if (!unoStatusCard) {
      return;
    }
    if (!info || typeof info !== 'object') {
      unoRateLimitInfo = null;
      if (unoRateLimitHeader) {
        unoRateLimitHeader.textContent = '—';
        unoRateLimitHeader.hidden = true;
      }
      if (unoRateLimitUpdated) {
        unoRateLimitUpdated.textContent = '—';
      }
      if (unoRateLimitReset) {
        unoRateLimitReset.textContent = '—';
      }
      if (unoRateLimitMeta) {
        unoRateLimitMeta.hidden = true;
      }
      updateUnoStatusSummary();
      return;
    }
    const rateLimit = {
      limit: Number.isFinite(Number(info.limit)) ? Number(info.limit) : undefined,
      remaining: Number.isFinite(Number(info.remaining)) ? Number(info.remaining) : undefined,
      header: info.header ? String(info.header) : undefined,
      updated: info.updated ? String(info.updated) : undefined,
      reset: Number.isFinite(Number(info.reset)) ? Number(info.reset) : undefined,
      raw: info.raw
    };
    unoRateLimitInfo = rateLimit;

    if (unoRateLimitHeader) {
      if (rateLimit.header) {
        unoRateLimitHeader.textContent = rateLimit.header;
        unoRateLimitHeader.hidden = false;
      } else {
        unoRateLimitHeader.textContent = '—';
        unoRateLimitHeader.hidden = true;
      }
    }
    if (unoRateLimitUpdated) {
      unoRateLimitUpdated.textContent = rateLimit.updated || '—';
    }
    if (unoRateLimitReset) {
      let resetLabel = '—';
      if (Number.isFinite(rateLimit.reset)) {
        const resetDate = new Date(rateLimit.reset * 1000);
        if (!Number.isNaN(resetDate.getTime())) {
          resetLabel = resetDate.toLocaleString('pl-PL');
        }
      }
      unoRateLimitReset.textContent = resetLabel;
    }
    if (unoRateLimitMeta) {
      const hasMeta = Boolean(rateLimit.header || rateLimit.updated || Number.isFinite(rateLimit.reset));
      unoRateLimitMeta.hidden = !hasMeta;
    }
    updateUnoStatusSummary();
  }


  async function loadSystemSettings(options = {}) {
    if (!adminEnabled) {
      return;
    }
    const { successMessage } = options;
    try {
      const data = await requestJson('/api/admin/system', { method: 'GET' });
      applyUnoSystemData(data);
      if (typeof data.plugin_enabled !== 'undefined') {
        applyPluginToggle(data.plugin_enabled);
      }
      if (successMessage) {
        setFeedback(successMessage, 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function handleUnoToggleChange() {
    if (!unoToggle) {
      return;
    }
    const desired = unoToggle.checked;
    try {
      const data = await requestJson('/api/admin/system', {
        method: 'PUT',
        body: JSON.stringify({ uno_requests_enabled: desired })
      });
        applyUnoSystemData(data);
        if (typeof data.plugin_enabled !== 'undefined') {
          applyPluginToggle(data.plugin_enabled);
        }
      setFeedback('Ustawienia UNO zapisane.', 'success');
    } catch (error) {
      applyUnoToggle(unoRequestsEnabled);
      setFeedback(error.message, 'error');
    }
  }


  async function handlePluginToggleChange() {
    if (!pluginToggle) return;
    const desired = pluginToggle.checked;
    try {
      const data = await requestJson('/api/admin/system', {
        method: 'PUT',
        body: JSON.stringify({ plugin_enabled: desired })
      });
        applyPluginToggle(data.plugin_enabled === true);
        applyUnoSystemData(data);
      setFeedback('Ustawienia wtyczki zapisane.', 'success');
    } catch (error) {
      applyPluginToggle(pluginEnabled);
      setFeedback(error.message, 'error');
    }
  }


  async function handleUnoActivityReset(event) {
    if (event) {
      event.preventDefault();
    }
    try {
      const data = await requestJson('/api/admin/system', {
        method: 'PUT',
        body: JSON.stringify({ uno_activity_reset: true })
      });
      applyUnoSystemData(data);
      setFeedback('Przywrócono normalny tryb zapytań UNO.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function handleUnoPollerFormSubmit(event) {
    event.preventDefault();
    if (!unoPollerForm) {
      return;
    }
    const limitValue = unoHourlyLimitInput ? unoHourlyLimitInput.valueAsNumber : NaN;
    if (!Number.isFinite(limitValue) || limitValue < 0 || !Number.isInteger(limitValue)) {
      setFeedback('Limit na godzinę musi być liczbą całkowitą ≥ 0.', 'error');
      return;
    }
    const thresholdValue = unoSlowdownThresholdInput ? unoSlowdownThresholdInput.valueAsNumber : NaN;
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 100) {
      setFeedback('Próg spowolnienia musi być liczbą z zakresu 0-100.', 'error');
      return;
    }
    const factorValue = unoSlowdownFactorInput ? unoSlowdownFactorInput.valueAsNumber : NaN;
    if (!Number.isFinite(factorValue) || factorValue < 1 || !Number.isInteger(factorValue)) {
      setFeedback('Współczynnik spowolnienia musi być liczbą całkowitą ≥ 1.', 'error');
      return;
    }
    const sleepValue = unoSlowdownSleepInput ? unoSlowdownSleepInput.valueAsNumber : NaN;
    if (!Number.isFinite(sleepValue) || sleepValue < 0) {
      setFeedback('Dodatkowa pauza musi być liczbą nieujemną.', 'error');
      return;
    }

    const payload = {
      uno_hourly_config: {
        limit: Math.round(limitValue),
        threshold_percent: Number(thresholdValue.toFixed(2)),
        slowdown_factor: Math.round(factorValue),
        slowdown_sleep: Number(sleepValue.toFixed(2)),
      }
    };

    try {
      const data = await requestJson('/api/admin/system', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      applyUnoSystemData(data);
      setFeedback('Konfiguracja limitów UNO zapisana.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  function createPlayerRow(player) {
    const row = document.createElement('tr');
    row.dataset.playerId = String(player.id);

    playerFieldDefinitions.forEach((field) => {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = field.type;
      input.name = field.name;
      input.autocomplete = 'off';
      let value = player[field.name];
      if (field.name === 'list_name' && (!value || value === 'default')) {
        value = '';
      }
      if (field.name === 'flag_code' && typeof value === 'string') {
        value = value.toLowerCase();
      }
      input.value = value ?? '';
      if (field.name === 'flag_code') {
        applyFlagCodeAttributes(input);
      }
      if (field.name === 'flag_url') {
        input.placeholder = 'https://';
      }
      cell.appendChild(input);
      row.appendChild(cell);
    });

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'update-player';
    updateButton.textContent = 'Zapisz';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-player';
    deleteButton.textContent = 'Usuń';
    actionsCell.appendChild(updateButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
  }


  function renderPlayers(players) {
    if (!playersTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    (players || []).forEach((player) => {
      fragment.appendChild(createPlayerRow(player));
    });

    if (typeof playersTableBody.replaceChildren === 'function') {
      playersTableBody.replaceChildren(fragment);
    } else {
      playersTableBody.innerHTML = '';
      playersTableBody.appendChild(fragment);
    }
    initializeFlagInputs(playersTableBody);
    applyFlagSuggestions(playersTableBody);
  }


  function updatePlayerRowInputs(row, player) {
    if (!row || !player) {
      return;
    }
    playerFieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (!input) {
        return;
      }
      let value = player[field.name];
      if (field.name === 'list_name' && (!value || value === 'default')) {
        value = '';
      }
      if (field.name === 'flag_code' && typeof value === 'string') {
        value = value.toLowerCase();
      }
      input.value = value ?? '';
      if (field.name === 'flag_code') {
        applyFlagCodeAttributes(input);
      }
      if (field.name === 'flag_url') {
        input.placeholder = 'https://';
      }
    });
    const codeInput = row.querySelector('input[name="flag_code"]');
    const urlInput = row.querySelector('input[name="flag_url"]');
    if (codeInput && urlInput) {
      setFlagUrlSuggestion(codeInput, urlInput);
    }
  }


  function parsePlayerRow(row) {
    const payload = {};
    playerFieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (!input) {
        return;
      }
      const value = input.value.trim();
      if (field.name === 'name') {
        if (!value) {
          throw new Error('Podaj imię i nazwisko zawodnika.');
        }
        payload.name = value;
        return;
      }
      if (field.name === 'list_name') {
        payload.list_name = value === '' ? null : value;
        return;
      }
      if (field.name === 'flag_code') {
        if (!value) {
          payload.flag_code = null;
          return;
        }
        const normalized = value.toLowerCase();
        if (!/^[a-z]{2}$/.test(normalized)) {
          throw new Error('Kod kraju musi składać się z dwóch liter.');
        }
        payload.flag_code = normalized;
        return;
      }
      if (field.name === 'flag_url') {
        payload.flag_url = value === '' ? null : value;
      }
    });
    if (!payload.name) {
      throw new Error('Podaj imię i nazwisko zawodnika.');
    }
    return payload;
  }


  async function refreshPlayers() {
    try {
      const data = await requestJson('/api/admin/players', { method: 'GET' });
      if (Array.isArray(data.players)) {
        renderPlayers(data.players);
      }
      setFeedback('Lista zawodników zaktualizowana.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function handlePlayerFormSubmit(event) {
    event.preventDefault();
    if (!playerForm) {
      return;
    }
    const formData = new FormData(playerForm);
    const name = String(formData.get('name') || '').trim();
    if (!name) {
      setFeedback('Podaj imię i nazwisko zawodnika.', 'error');
      return;
    }
    const listName = String(formData.get('list_name') || '').trim();
    const rawFlag = String(formData.get('flag_code') || '').trim().toLowerCase();
    if (rawFlag && !/^[a-z]{2}$/.test(rawFlag)) {
      setFeedback('Kod kraju musi składać się z dwóch liter.', 'error');
      return;
    }
    const flagUrl = String(formData.get('flag_url') || '').trim();
    const payload = { name };
    if (listName) {
      payload.list_name = listName;
    }
    if (rawFlag) {
      payload.flag_code = rawFlag;
    }
    if (flagUrl) {
      payload.flag_url = flagUrl;
    }
    try {
      const data = await requestJson('/api/admin/players', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (Array.isArray(data.players)) {
        renderPlayers(data.players);
      }
      playerForm.reset();
      setFeedback('Zawodnik dodany.', 'success');
      reloadFlagCatalog().catch(() => {});
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function handlePlayerImportSubmit(event) {
    event.preventDefault();
    if (!playerImportForm) {
      return;
    }
    const fileInput = playerImportForm.querySelector('input[name="file"]');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setFeedback('Wybierz plik do importu.', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const data = await requestJson('/api/admin/players/import', {
        method: 'POST',
        body: formData
      });
      if (Array.isArray(data.players)) {
        renderPlayers(data.players);
      }
      const imported = Number(data.imported || 0);
      const skipped = Number(data.skipped || 0);
      let message = imported > 0
        ? `Zaimportowano ${imported} graczy.`
        : 'Brak nowych graczy do zaimportowania.';
      if (skipped > 0) {
        message += ` Pominięto ${skipped} linii.`;
      }
      setFeedback(message, imported > 0 ? 'success' : 'info');
      playerImportForm.reset();
      reloadFlagCatalog().catch(() => {});
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function updatePlayerRow(row) {
    const playerId = row.dataset.playerId;
    if (!playerId) {
      setFeedback('Nie udało się odczytać identyfikatora zawodnika.', 'error');
      return;
    }
    let payload;
    try {
      payload = parsePlayerRow(row);
    } catch (error) {
      setFeedback(error.message, 'error');
      return;
    }
    try {
      const data = await requestJson(`/api/admin/players/${playerId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (data.player) {
        updatePlayerRowInputs(row, data.player);
      }
      if (payload.flag_code || payload.flag_url) {
        reloadFlagCatalog().catch(() => {});
      }
      setFeedback('Zawodnik zapisany.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  async function deletePlayerRow(row) {
    const playerId = row.dataset.playerId;
    if (!playerId) {
      setFeedback('Nie udało się odczytać identyfikatora zawodnika.', 'error');
      return;
    }
    if (!window.confirm('Czy na pewno usunąć tego zawodnika?')) {
      return;
    }
    try {
      const data = await requestJson(`/api/admin/players/${playerId}`, {
        method: 'DELETE'
      });
      if (Array.isArray(data.players)) {
        renderPlayers(data.players);
      } else {
        row.remove();
      }
      setFeedback('Zawodnik został usunięty.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }


  function handlePlayersTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('tr[data-player-id]');
    if (!row) {
      return;
    }
    if (target.classList.contains('update-player')) {
      updatePlayerRow(row);
    } else if (target.classList.contains('delete-player')) {
      deletePlayerRow(row);
    }
  }

  function applyYoutubeConfig(data, options = {}) {
    const updateInputs = options.updateInputs !== false;
    if (updateInputs && youtubeApiKeyInput) {
      youtubeApiKeyInput.value =
        data && typeof data.api_key === 'string' ? data.api_key : '';
    }
    if (updateInputs && youtubeStreamIdInput) {
      youtubeStreamIdInput.value =
        data && typeof data.stream_id === 'string' ? data.stream_id : '';
    }
    if (viewerCountElement) {
      const countValue = Number(data && typeof data.viewers !== 'undefined' ? data.viewers : 0);
      viewerCountElement.textContent = Number.isFinite(countValue)
        ? String(Math.max(0, Math.trunc(countValue)))
        : '0';
    }
    const errorMessage =
      data && typeof data.viewers_error === 'string' ? data.viewers_error : '';
    setViewerStatus(errorMessage, errorMessage ? 'error' : 'info');
  }

  async function loadYoutubeConfig(options = {}) {
    if (!adminEnabled) {
      return;
    }
    const { updateInputs = true, successMessage } = options;
    try {
      const data = await requestJson('/api/admin/youtube', { method: 'GET' });
      applyYoutubeConfig(data, { updateInputs });
      if (successMessage) {
        setFeedback(successMessage, 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleYoutubeConfigSubmit(event) {
    event.preventDefault();
    if (!youtubeConfigForm) {
      return;
    }
    const formData = new FormData(youtubeConfigForm);
    const apiKey = String(formData.get('api_key') || '').trim();
    const streamId = String(formData.get('stream_id') || '').trim();
    const payload = { api_key: apiKey, stream_id: streamId };
    try {
      const data = await requestJson('/api/admin/youtube', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      applyYoutubeConfig(data, { updateInputs: true });
      setFeedback('Konfiguracja YouTube zapisana.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleRefreshViewers() {
    await loadYoutubeConfig({
      updateInputs: false,
      successMessage: 'Liczba widzów odświeżona.'
    });
  }

  function updateRowFromEntry(row, entry) {
    fieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (input) {
        const value = entry[field.name];
        input.value = value === null || typeof value === 'undefined' ? '' : value;
      }
    });
  }

  function parseRow(row) {
    const payload = {};
    fieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (!input) {
        return;
      }
      const value = input.value.trim();
      if (value === '') {
        payload[field.name] = null;
        return;
      }
      if (intFields.has(field.name) || field.type === 'number') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
          throw new Error(`Pole ${field.name} musi być liczbą.`);
        }
        payload[field.name] = parsed;
      } else {
        payload[field.name] = value;
      }
    });
    return payload;
  }

  async function requestJson(url, options) {
    const requestOptions = { credentials: 'same-origin', ...(options || {}) };
    const isFormData = requestOptions.body instanceof FormData;
    const headers = {
      Accept: 'application/json',
      ...(options && options.headers)
    };
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    requestOptions.headers = headers;
    const response = await fetch(url, requestOptions);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Nie udało się odczytać odpowiedzi serwera.');
    }
    if (!response.ok || !data || data.ok === false) {
      const message = (data && (data.message || data.error)) || 'Wystąpił błąd serwera.';
      throw new Error(message);
    }
    return data;
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!loginForm) {
      return;
    }
    const formData = new FormData(loginForm);
    const password = formData.get('password');
    if (!password || String(password).trim() === '') {
      setFeedback('Podaj hasło administratora.', 'error');
      return;
    }
    try {
      await requestJson('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: String(password).trim() })
      });
      setFeedback('Zalogowano pomyślnie.', 'success');
      toggleAuthenticated(true);
      await refreshHistory();
      await refreshCourts();
      await loadYoutubeConfig();
      await refreshPlayers();
      await loadSystemSettings();
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function refreshHistory() {
    try {
      const data = await requestJson('/api/admin/history', { method: 'GET' });
      if (Array.isArray(data.history)) {
        renderHistory(data.history);
        setFeedback('Historia zaktualizowana.', 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function refreshCourts() {
    try {
      const data = await requestJson('/api/admin/courts', { method: 'GET' });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
        setFeedback('Lista kortów zaktualizowana.', 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function updateEntry(row) {
    const entryId = row.dataset.entryId;
    if (!entryId) {
      setFeedback('Nie udało się odczytać identyfikatora rekordu.', 'error');
      return;
    }
    let payload;
    try {
      payload = parseRow(row);
    } catch (error) {
      setFeedback(error.message, 'error');
      return;
    }
    try {
      const data = await requestJson(`/api/admin/history/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (data.entry) {
        updateRowFromEntry(row, data.entry);
      }
      setFeedback('Rekord zapisany.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleCourtFormSubmit(event) {
    event.preventDefault();
    if (!courtForm) {
      return;
    }
    const formData = new FormData(courtForm);
    const kortId = String(formData.get('kort_id') || '').trim();
    const overlayValueRaw = formData.get('overlay_id');
    const overlayId = overlayValueRaw === null ? '' : String(overlayValueRaw).trim();
    if (!kortId) {
      setFeedback('Podaj identyfikator kortu.', 'error');
      return;
    }
    const payload = { kort_id: kortId };
    if (overlayId !== '') {
      payload.overlay_id = overlayId;
    }
    try {
      const data = await requestJson('/api/admin/courts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
      }
      if (courtForm) {
        courtForm.reset();
      }
      setFeedback(data.created ? 'Kort dodany.' : 'Kort zaktualizowany.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function deleteCourtRow(row) {
    const kortId = row.dataset.kortId;
    if (!kortId) {
      setFeedback('Nie udało się odczytać identyfikatora kortu.', 'error');
      return;
    }
    if (!window.confirm('Czy na pewno usunąć ten kort?')) {
      return;
    }
    try {
      const data = await requestJson(`/api/admin/courts/${encodeURIComponent(kortId)}`, {
        method: 'DELETE'
      });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
      } else {
        row.remove();
      }
      setFeedback('Kort został usunięty.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function resetCourtState(kortId) {
    if (!kortId) {
      setFeedback('Nie udało się odczytać identyfikatora kortu.', 'error');
      return;
    }
    if (!window.confirm(`Czy na pewno wyzerować stan kortu ${kortId}?`)) {
      return;
    }
    try {
      const data = await requestJson(`/api/admin/courts/${encodeURIComponent(kortId)}/reset`, {
        method: 'POST'
      });
      const message = (data && (data.message || data.detail)) || `Kort ${kortId} został wyzerowany.`;
      setFeedback(message, 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function deleteEntry(row) {
    const entryId = row.dataset.entryId;
    if (!entryId) {
      setFeedback('Nie udało się odczytać identyfikatora rekordu.', 'error');
      return;
    }
    if (!window.confirm('Czy na pewno usunąć ten rekord?')) {
      return;
    }
    try {
      await requestJson(`/api/admin/history/${entryId}`, { method: 'DELETE' });
      row.remove();
      setFeedback('Rekord został usunięty.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  function handleTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('tr[data-entry-id]');
    if (!row) {
      return;
    }
    if (target.classList.contains('update-entry')) {
      updateEntry(row);
    } else if (target.classList.contains('delete-entry')) {
      deleteEntry(row);
    }
  }

  function handleCourtsTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('tr[data-kort-id]');
    if (!row) {
      return;
    }
    if (target.classList.contains('reset-court')) {
      resetCourtState(row.dataset.kortId || '');
    } else if (target.classList.contains('delete-court')) {
      deleteCourtRow(row);
    }
  }

  if (bodyElement) {
    bodyElement.dataset.adminEnabled = adminEnabled ? 'true' : 'false';
  }

  initializeFlagInputs(document);

  if (!adminEnabled) {
    setFeedback(disabledMessage, 'info');
  }

  if (loginForm && adminEnabled) {
    loginForm.addEventListener('submit', handleLogin);
  }
  if (refreshHistoryButton && adminEnabled) {
    refreshHistoryButton.addEventListener('click', refreshHistory);
  }
  if (historyTableBody && adminEnabled) {
    historyTableBody.addEventListener('click', handleTableClick);
  }
  if (courtForm && adminEnabled) {
    courtForm.addEventListener('submit', handleCourtFormSubmit);
  }
  if (refreshCourtsButton && adminEnabled) {
    refreshCourtsButton.addEventListener('click', refreshCourts);
  }
  if (courtsTableBody && adminEnabled) {
    courtsTableBody.addEventListener('click', handleCourtsTableClick);
  }
  if (playerForm && adminEnabled) {
    playerForm.addEventListener('submit', handlePlayerFormSubmit);
    playerForm.addEventListener('input', handleFlagCodeChange);
    playerForm.addEventListener('change', handleFlagCodeChange);
  }
  if (refreshPlayersButton && adminEnabled) {
    refreshPlayersButton.addEventListener('click', refreshPlayers);
  }
  if (playersTableBody && adminEnabled) {
    playersTableBody.addEventListener('click', handlePlayersTableClick);
    playersTableBody.addEventListener('input', handleFlagCodeChange);
    playersTableBody.addEventListener('change', handleFlagCodeChange);
  }
  if (playerImportForm && adminEnabled) {
    playerImportForm.addEventListener('submit', handlePlayerImportSubmit);
  }
  if (youtubeConfigForm && adminEnabled) {
    youtubeConfigForm.addEventListener('submit', handleYoutubeConfigSubmit);
  }
  if (refreshViewersButton && adminEnabled) {
    refreshViewersButton.addEventListener('click', handleRefreshViewers);
  }
  if (unoToggle && adminEnabled) {
    unoToggle.addEventListener('change', handleUnoToggleChange);
  }
  if (unoActivityResetButton && adminEnabled) {
    unoActivityResetButton.addEventListener('click', handleUnoActivityReset);
  }
  if (pluginToggle && adminEnabled) {
    pluginToggle.addEventListener('change', handlePluginToggleChange);
  }
  if (unoPollerForm && adminEnabled) {
    unoPollerForm.addEventListener('submit', handleUnoPollerFormSubmit);
  }

  applyUnoPollerConfig(unoPollerConfig);
  applyUnoHourlyUsage(unoHourlyUsage);
  applyUnoActivityStatus(unoActivityStatus);
  applyUnoAutoDisabledReason(unoAutoDisabledReason);
  applyUnoToggle(unoRequestsEnabled);
  applyPluginToggle(pluginEnabled);
  applyUnoRateLimit(unoRateLimitInfo);

  toggleAuthenticated(Boolean(initialConfig.is_authenticated));
  if (adminEnabled) {
    if (Array.isArray(initialConfig.history) && initialConfig.history.length > 0) {
      renderHistory(initialConfig.history);
    }
    if (Boolean(initialConfig.is_authenticated)) {
      renderCourts(initialCourts);
      renderPlayers(initialPlayers);
      loadYoutubeConfig().catch((error) => {
        if (error && error.message) {
          setFeedback(error.message, 'error');
        }
      });
    }
  }
})();
