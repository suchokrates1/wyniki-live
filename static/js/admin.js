const initial = window.ADMIN_INITIAL || {};

const state = {
  authenticated: Boolean(initial.authenticated),
  hasPassword: typeof initial.hasPassword === 'boolean' ? initial.hasPassword : Boolean(window.ADMIN_INITIAL && window.ADMIN_INITIAL.hasPassword),
  defaultPhase: typeof initial.defaultPhase === 'string' && initial.defaultPhase.trim() ? initial.defaultPhase : 'Grupowa',
  history: Array.isArray(initial.history) ? initial.history : [],
  courts: Array.isArray(initial.courts) ? initial.courts : []
};

const loginSection = document.getElementById('login-section');
const adminSection = document.getElementById('admin-section');
const courtsSection = document.getElementById('courts-section');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const passwordMissing = document.getElementById('password-missing');
const historyRows = document.getElementById('history-rows');
const historyStatus = document.getElementById('history-status');
const logoutBtn = document.getElementById('logout-btn');
const courtList = document.getElementById('court-list');
const courtForm = document.getElementById('court-form');
const courtsStatus = document.getElementById('courts-status');

function setStatus(el, message, type = '') {
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('success', 'error');
  if (type) {
    el.classList.add(type);
  }
}

function applyPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (typeof payload.hasPassword === 'boolean') {
    state.hasPassword = payload.hasPassword;
  }
  if (typeof payload.defaultPhase === 'string' && payload.defaultPhase.trim()) {
    state.defaultPhase = payload.defaultPhase.trim();
  }
  if (Array.isArray(payload.history)) {
    state.history = payload.history;
  }
  if (Array.isArray(payload.courts)) {
    state.courts = payload.courts;
  }
  if (typeof payload.authenticated === 'boolean') {
    state.authenticated = payload.authenticated;
  }
}

function updateUI() {
  if (state.authenticated) {
    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    courtsSection.classList.remove('hidden');
    renderHistory();
    renderCourts();
  } else {
    adminSection.classList.add('hidden');
    courtsSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    historyRows.innerHTML = '<tr class="history-empty"><td colspan="6">Zaloguj się, aby zobaczyć historię meczów.</td></tr>';
    courtList.innerHTML = '';
  }
  if (passwordMissing) {
    if (!state.hasPassword) {
      passwordMissing.classList.remove('hidden');
    } else {
      passwordMissing.classList.add('hidden');
    }
  }
}

function formatTimestamp(iso) {
  if (!iso) return 'Nieznany czas';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Nieznany czas';
  return date.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

function summariseSets(entry) {
  if (!entry || !entry.sets) return '—';
  const segments = [];
  ['set1', 'set2'].forEach((key) => {
    const set = entry.sets[key];
    if (!set) return;
    const base = `${set.A ?? 0}:${set.B ?? 0}`;
    if (set.tb && set.tb.played && (set.tb.A || set.tb.B)) {
      segments.push(`${base} (${set.tb.A ?? 0}:${set.tb.B ?? 0})`);
    } else if (set.A || set.B) {
      segments.push(base);
    }
  });
  const tie = entry.sets.tie;
  if (tie && tie.played) {
    segments.push(`Super tie-break ${tie.A ?? 0}:${tie.B ?? 0}`);
  }
  return segments.length ? segments.join(', ') : '—';
}

function resolvePlayer(entry, side) {
  const player = entry?.players?.[side] || {};
  return player.full_name || player.surname || '';
}

function renderHistory() {
  if (!historyRows) return;
  if (!state.history.length) {
    historyRows.innerHTML = '<tr class="history-empty"><td colspan="6">Brak zapisanych meczów.</td></tr>';
    return;
  }
  historyRows.innerHTML = '';
  state.history.forEach((entry) => {
    const row = document.createElement('tr');
    row.dataset.id = entry.id;

    const infoCell = document.createElement('td');
    const playerA = resolvePlayer(entry, 'A') || 'Zawodnik A';
    const playerB = resolvePlayer(entry, 'B') || 'Zawodnik B';
    infoCell.innerHTML = `
      <div><strong>Kort ${entry.kort || '?'}</strong></div>
      <div>${playerA} vs ${playerB}</div>
      <div>Wynik: ${summariseSets(entry)}</div>
      <div>Czas gry: ${entry.duration_text || '—'}</div>
      <div>Zakończono: ${formatTimestamp(entry.ended_at)}</div>
    `;

    const playerACell = document.createElement('td');
    const playerAInput = document.createElement('input');
    playerAInput.type = 'text';
    playerAInput.name = 'player_a';
    playerAInput.value = playerA;
    playerACell.appendChild(playerAInput);

    const playerBCell = document.createElement('td');
    const playerBInput = document.createElement('input');
    playerBInput.type = 'text';
    playerBInput.name = 'player_b';
    playerBInput.value = playerB;
    playerBCell.appendChild(playerBInput);

    const categoryCell = document.createElement('td');
    const categoryInput = document.createElement('input');
    categoryInput.type = 'text';
    categoryInput.name = 'category';
    categoryInput.value = typeof entry.category === 'string' ? entry.category : '';
    categoryCell.appendChild(categoryInput);

    const phaseCell = document.createElement('td');
    const phaseInput = document.createElement('input');
    phaseInput.type = 'text';
    phaseInput.name = 'phase';
    phaseInput.value = typeof entry.phase === 'string' && entry.phase.trim() ? entry.phase : state.defaultPhase;
    phaseCell.appendChild(phaseInput);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.dataset.action = 'save';
    saveBtn.textContent = 'Zapisz';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.textContent = 'Usuń';
    deleteBtn.classList.add('danger');
    actionsCell.appendChild(saveBtn);
    actionsCell.appendChild(deleteBtn);

    row.appendChild(infoCell);
    row.appendChild(playerACell);
    row.appendChild(playerBCell);
    row.appendChild(categoryCell);
    row.appendChild(phaseCell);
    row.appendChild(actionsCell);

    historyRows.appendChild(row);
  });
}

function renderCourts() {
  if (!courtList) return;
  if (!state.courts.length) {
    courtList.innerHTML = '<li class="history-empty">Brak zapisanych kortów. Dodaj pierwszy identyfikator poniżej.</li>';
    return;
  }
  courtList.innerHTML = '';
  state.courts.forEach((item) => {
    const kortId = item.kort;
    const overlay = item.overlay || '';
    const li = document.createElement('li');
    li.className = 'court-item';
    li.dataset.kort = kortId;
    const header = document.createElement('div');
    header.innerHTML = `<strong>Kort ${kortId}</strong>`;
    const field = document.createElement('div');
    field.className = 'inline-field';
    const label = document.createElement('label');
    label.textContent = 'Identyfikator overlay';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = overlay;
    input.name = 'overlay';
    field.appendChild(label);
    field.appendChild(input);
    const buttons = document.createElement('div');
    buttons.className = 'actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.dataset.action = 'save-court';
    saveBtn.textContent = 'Zapisz';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.action = 'delete-court';
    deleteBtn.textContent = 'Usuń';
    deleteBtn.classList.add('danger');
    buttons.appendChild(saveBtn);
    buttons.appendChild(deleteBtn);
    li.appendChild(header);
    li.appendChild(field);
    li.appendChild(buttons);
    courtList.appendChild(li);
  });
}

async function apiRequest(url, options = {}) {
  const opts = { ...options };
  opts.credentials = 'same-origin';
  opts.headers = { 'Accept': 'application/json', ...(options.headers || {}) };
  if (opts.body && !opts.headers['Content-Type']) {
    opts.headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, opts);
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  if (response.status === 401) {
    applyPayload({ authenticated: false });
    updateUI();
    const errorMsg = data && data.error ? data.error : 'Brak autoryzacji';
    throw new Error(errorMsg);
  }
  if (!response.ok || (data && data.ok === false)) {
    const message = data && (data.error || data.message);
    throw new Error(message || `Żądanie nie powiodło się (${response.status})`);
  }
  if (data && typeof data === 'object' && data.ok) {
    applyPayload(data);
  }
  return data;
}

async function handleLogin(event) {
  event.preventDefault();
  setStatus(loginStatus, 'Logowanie…');
  const formData = new FormData(loginForm);
  const password = formData.get('password');
  try {
    await apiRequest('/api/admin/session', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    loginForm.reset();
    setStatus(loginStatus, 'Zalogowano pomyślnie.', 'success');
    updateUI();
  } catch (error) {
    setStatus(loginStatus, error.message || 'Nieprawidłowe hasło.', 'error');
  }
}

async function handleLogout() {
  try {
    await apiRequest('/api/admin/session', { method: 'DELETE' });
  } catch (error) {
    console.error('Logout failed', error);
  } finally {
    applyPayload({ authenticated: false, history: [], courts: [] });
    updateUI();
    setStatus(loginStatus, 'Wylogowano.', 'success');
  }
}

function collectRowPayload(row) {
  const payload = {};
  row.querySelectorAll('input').forEach((input) => {
    const key = input.name;
    if (!key) return;
    const value = input.value.trim();
    payload[key] = value;
  });
  return payload;
}

async function handleHistoryClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr[data-id]');
  if (!row) return;
  const entryId = row.dataset.id;
  if (!entryId) return;
  if (button.dataset.action === 'save') {
    const payload = collectRowPayload(row);
    try {
      setStatus(historyStatus, 'Zapisywanie zmian…');
      await apiRequest(`/api/admin/history/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setStatus(historyStatus, 'Zapisano zmiany.', 'success');
      renderHistory();
    } catch (error) {
      setStatus(historyStatus, error.message || 'Nie udało się zapisać zmian.', 'error');
    }
  } else if (button.dataset.action === 'delete') {
    if (!confirm('Czy na pewno chcesz usunąć ten wpis z historii?')) {
      return;
    }
    try {
      setStatus(historyStatus, 'Usuwanie wpisu…');
      await apiRequest(`/api/admin/history/${entryId}`, { method: 'DELETE' });
      setStatus(historyStatus, 'Usunięto wpis.', 'success');
      renderHistory();
    } catch (error) {
      setStatus(historyStatus, error.message || 'Nie udało się usunąć wpisu.', 'error');
    }
  }
}

async function handleCourtClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const item = button.closest('[data-kort]');
  if (!item) return;
  const kortId = item.dataset.kort;
  const overlayInput = item.querySelector('input[name="overlay"]');
  const overlay = overlayInput ? overlayInput.value.trim() : '';
  if (button.dataset.action === 'save-court') {
    if (!overlay) {
      setStatus(courtsStatus, 'Podaj identyfikator overlay.', 'error');
      return;
    }
    try {
      setStatus(courtsStatus, 'Zapisywanie kortu…');
      await apiRequest(`/api/admin/courts/${encodeURIComponent(kortId)}`, {
        method: 'PUT',
        body: JSON.stringify({ overlay })
      });
      setStatus(courtsStatus, `Kort ${kortId} zapisany.`, 'success');
      renderCourts();
    } catch (error) {
      setStatus(courtsStatus, error.message || 'Nie udało się zapisać kortu.', 'error');
    }
  } else if (button.dataset.action === 'delete-court') {
    if (!confirm(`Czy na pewno usunąć kort ${kortId}?`)) return;
    try {
      setStatus(courtsStatus, 'Usuwanie kortu…');
      await apiRequest(`/api/admin/courts/${encodeURIComponent(kortId)}`, { method: 'DELETE' });
      setStatus(courtsStatus, `Kort ${kortId} usunięty.`, 'success');
      renderCourts();
    } catch (error) {
      setStatus(courtsStatus, error.message || 'Nie udało się usunąć kortu.', 'error');
    }
  }
}

async function handleCourtForm(event) {
  event.preventDefault();
  const formData = new FormData(courtForm);
  const kort = (formData.get('kort') || '').toString().trim();
  const overlay = (formData.get('overlay') || '').toString().trim();
  if (!kort || !overlay) {
    setStatus(courtsStatus, 'Uzupełnij numer kortu i identyfikator overlay.', 'error');
    return;
  }
  try {
    setStatus(courtsStatus, 'Zapisywanie kortu…');
    await apiRequest('/api/admin/courts', {
      method: 'POST',
      body: JSON.stringify({ kort, overlay })
    });
    courtForm.reset();
    setStatus(courtsStatus, `Kort ${kort} zapisany.`, 'success');
    renderCourts();
  } catch (error) {
    setStatus(courtsStatus, error.message || 'Nie udało się zapisać kortu.', 'error');
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}
if (logoutBtn) {
  logoutBtn.addEventListener('click', handleLogout);
}
if (historyRows) {
  historyRows.addEventListener('click', handleHistoryClick);
}
if (courtList) {
  courtList.addEventListener('click', handleCourtClick);
}
if (courtForm) {
  courtForm.addEventListener('submit', handleCourtForm);
}

applyPayload(initial);
updateUI();
