import Alpine from 'alpinejs';
import './main.css';

window.Alpine = Alpine;

Alpine.data('adminApp', () => ({
  activeTab: 'courts',
  
  // Courts
  courts: [],
  newCourtId: '',
  newCourtPin: '',
  editingCourt: null,
  editCourtId: '',
  
  // Tournaments
  tournaments: [],
  selectedTournament: null,
  newTournament: {
    name: '',
    start_date: '',
    end_date: '',
  },
  
  // Players
  players: [],
  newPlayer: {
    name: '',
    category: '',
    country: '',
  },
  importText: '',
  
  // Overlay settings (new preset-based model)
  overlaySettings: {
    tournament_logo: null,
    tournament_name: '',
    overlays: {},
  },
  currentOverlayId: '1',
  selectedElIdx: -1,
  selectedElIdxSet: [],   // multi-select: array of indices

  // Canvas scale
  canvasScale: 1,

  // Ruler / distance guides
  hoveredElIdx: -1,

  // Drag & resize state
  dragging: null,
  resizing: null,
  keepAspectRatio: false,
  
  // Court live data from SSE
  courtData: {},
  _settingsSSE: null,

  // Demo mode
  demoPreview: false,       // admin is showing demo data in preview
  demoOverlayActive: false,  // demo pushed to production overlays

  // Add element defaults
  addElCourtId: '1',

  // Snap & alignment
  snapEnabled: true,
  snapThreshold: 10,  // px snap distance

  // Logo crop state
  cropImgSrc: '',
  cropZoom: 100,
  _cropDragging: false,
  _cropStart: { x: 0, y: 0 },
  _cropOffset: { x: 0, y: 0 },
  
  // UI State
  loading: {
    courts: false,
    tournaments: false,
    players: false,
  },
  
  toast: {
    show: false,
    message: '',
    type: 'info', // info, success, warning, error
  },
  
  // Computed
  get filteredPlayers() {
    return this.players;
  },
  
  init() {
    this.loadCourts();
    this.loadTournaments();
    this.loadOverlaySettings();
    this._loadDemoStatus();
    // Recalc canvas scale on resize
    window.addEventListener('resize', () => this.updateCanvasScale());
    this.$nextTick(() => this.updateCanvasScale());
    // Keyboard nudge for selected element(s)
    window.addEventListener('keydown', (e) => this._handleKeyNudge(e));
  },
  
  // ===== TOAST =====
  showToast(message, type = 'info') {
    this.toast = { show: true, message, type };
    setTimeout(() => {
      this.toast.show = false;
    }, 3000);
  },
  
  // ===== COURTS =====
  async loadCourts() {
    this.loading.courts = true;
    try {
      const response = await fetch('/admin/api/courts');
      if (!response.ok) throw new Error('Failed to load courts');
      this.courts = await response.json();
    } catch (err) {
      console.error('Failed to load courts:', err);
      this.showToast('Błąd ładowania kortów', 'error');
    } finally {
      this.loading.courts = false;
    }
  },
  
  async refreshCourts() {
    await this.loadCourts();
    this.showToast('Korty odświeżone', 'success');
  },
  
  async updateCourtPin(kortId, pin) {
    try {
      // Validate PIN format
      if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
        this.showToast('PIN musi mieć 4 cyfry', 'warning');
        await this.loadCourts(); // Reload to reset invalid input
        return;
      }
      
      const response = await fetch(`/admin/api/courts/${kortId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || null }),
      });
      
      if (!response.ok) throw new Error('Failed to update PIN');
      
      this.showToast(`PIN dla kortu ${kortId} zaktualizowany`, 'success');
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to update PIN:', err);
      this.showToast('Błąd aktualizacji PIN', 'error');
    }
  },
  
  async addCourt() {
    if (!this.newCourtId) {
      this.showToast('Wprowadź ID kortu', 'warning');
      return;
    }
    
    // Validate PIN if provided
    if (this.newCourtPin && (this.newCourtPin.length !== 4 || !/^\d{4}$/.test(this.newCourtPin))) {
      this.showToast('PIN musi mieć 4 cyfry', 'warning');
      return;
    }
    
    try {
      const response = await fetch('/admin/api/courts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kort_id: this.newCourtId,
          pin: this.newCourtPin || null,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to add court');
      
      this.showToast(`Kort ${this.newCourtId} dodany`, 'success');
      this.newCourtId = '';
      this.newCourtPin = '';
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to add court:', err);
      this.showToast('Błąd dodawania kortu', 'error');
    }
  },
  
  startEdit(kortId) {
    this.editingCourt = kortId;
    this.editCourtId = kortId;
  },
  
  cancelEdit() {
    this.editingCourt = null;
    this.editCourtId = '';
  },
  
  async saveCourt(oldKortId) {
    if (!this.editCourtId) {
      this.showToast('ID kortu nie może być puste', 'warning');
      return;
    }
    
    if (this.editCourtId === oldKortId) {
      this.cancelEdit();
      return;
    }
    
    try {
      const response = await fetch(`/admin/api/courts/${oldKortId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kort_id: this.editCourtId }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rename court');
      }
      
      this.showToast(`Kort ${oldKortId} zmieniono na ${this.editCourtId}`, 'success');
      this.cancelEdit();
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to rename court:', err);
      this.showToast(err.message || 'Błąd zmiany nazwy kortu', 'error');
    }
  },
  
  async deleteCourt(kortId) {
    if (!confirm(`Czy na pewno chcesz usunąć Kort ${kortId}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/admin/api/courts/${kortId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete court');
      
      this.showToast(`Kort ${kortId} usunięty`, 'success');
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to delete court:', err);
      this.showToast('Błąd usuwania kortu', 'error');
    }
  },
  
  // ===== TOURNAMENTS =====
  async loadTournaments() {
    this.loading.tournaments = true;
    try {
      const response = await fetch('/admin/api/tournaments');
      if (!response.ok) throw new Error('Failed to load tournaments');
      this.tournaments = await response.json();
      // Auto-select active tournament if none selected
      if (!this.selectedTournament) {
        const active = this.tournaments.find(t => t.active);
        if (active) {
          this.selectedTournament = active.id;
          await this.loadPlayers(active.id);
        }
      }
    } catch (err) {
      console.error('Failed to load tournaments:', err);
      this.showToast('Błąd ładowania turniejów', 'error');
    } finally {
      this.loading.tournaments = false;
    }
  },
  
  async createTournament() {
    if (!this.newTournament.name || !this.newTournament.start_date || !this.newTournament.end_date) {
      this.showToast('Wypełnij wszystkie pola', 'warning');
      return;
    }
    
    try {
      const response = await fetch('/admin/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newTournament),
      });
      
      if (!response.ok) throw new Error('Failed to create tournament');
      
      this.showToast('Turniej utworzony', 'success');
      this.newTournament = { name: '', start_date: '', end_date: '' };
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to create tournament:', err);
      this.showToast('Błąd tworzenia turnieju', 'error');
    }
  },
  
  async deleteTournament(tournamentId) {
    if (!confirm('Czy na pewno usunąć ten turniej?')) return;
    
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete tournament');
      
      this.showToast('Turniej usunięty', 'success');
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to delete tournament:', err);
      this.showToast('Błąd usuwania turnieju', 'error');
    }
  },
  
  async activateTournament(tournamentId) {
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/activate`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to activate tournament');
      
      this.showToast('Turniej aktywowany', 'success');
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to activate tournament:', err);
      this.showToast('Błąd aktywacji turnieju', 'error');
    }
  },
  
  async selectTournament(tournamentId) {
    this.selectedTournament = tournamentId;
    this.activeTab = 'players';
    await this.loadPlayers(tournamentId);
  },
  
  // ===== PLAYERS =====
  async loadPlayers(tournamentId) {
    if (!tournamentId) return;
    
    this.loading.players = true;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/players`);
      if (!response.ok) throw new Error('Failed to load players');
      this.players = await response.json();
    } catch (err) {
      console.error('Failed to load players:', err);
      this.showToast('Błąd ładowania graczy', 'error');
    } finally {
      this.loading.players = false;
    }
  },
  
  async addPlayer() {
    if (!this.selectedTournament || !this.newPlayer.name) {
      this.showToast('Wprowadź imię i nazwisko gracza', 'warning');
      return;
    }
    
    try {
      const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newPlayer),
      });
      
      if (!response.ok) throw new Error('Failed to add player');
      
      this.showToast('Gracz dodany', 'success');
      this.newPlayer = { name: '', category: '', country: '' };
      await this.loadPlayers(this.selectedTournament);
    } catch (err) {
      console.error('Failed to add player:', err);
      this.showToast('Błąd dodawania gracza', 'error');
    }
  },
  
  async deletePlayer(playerId) {
    if (!confirm('Czy na pewno usunąć tego gracza?')) return;
    
    try {
      const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/${playerId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete player');
      
      this.showToast('Gracz usunięty', 'success');
      await this.loadPlayers(this.selectedTournament);
    } catch (err) {
      console.error('Failed to delete player:', err);
      this.showToast('Błąd usuwania gracza', 'error');
    }
  },
  
  async importPlayers() {
    if (!this.selectedTournament || !this.importText.trim()) {
      this.showToast('Wprowadź dane graczy', 'warning');
      return;
    }
    
    try {
      const lines = this.importText.trim().split('\n');
      const players = lines
        .filter(line => line.trim())
        .map(line => {
          const parts = line.trim().split(/\s+/);
          const name = parts.slice(0, -2).join(' ') || parts.join(' ');
          const category = parts[parts.length - 2] || '';
          const country = parts[parts.length - 1] || '';
          return { name, category, country };
        });
      
      const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      });
      
      if (!response.ok) throw new Error('Failed to import players');
      
      this.showToast(`Zaimportowano ${players.length} graczy`, 'success');
      this.importText = '';
      await this.loadPlayers(this.selectedTournament);
    } catch (err) {
      console.error('Failed to import players:', err);
      this.showToast('Błąd importu graczy', 'error');
    }
  },
  
  // ===== OVERLAY SETTINGS =====
  async loadOverlaySettings() {
    try {
      const response = await fetch('/api/overlay/settings');
      if (response.ok) {
        this.overlaySettings = await response.json();
        // Migrate: ensure grid defaults exist on each overlay
        Object.values(this.overlaySettings.overlays || {}).forEach(ov => this._ensureGridDefaults(ov));
        // Auto-select first overlay if current is missing
        const ids = Object.keys(this.overlaySettings.overlays || {});
        if (ids.length && !this.overlaySettings.overlays[this.currentOverlayId]) {
          this.currentOverlayId = ids[0];
        }
      }
    } catch (err) {
      console.error('Failed to load overlay settings:', err);
    }
  },

  async saveOverlaySettings() {
    try {
      const response = await fetch('/api/overlay/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.overlaySettings),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      this.overlaySettings = await response.json();
    } catch (err) {
      console.error('Failed to save overlay settings:', err);
      this.showToast('Błąd zapisu ustawień overlay', 'error');
    }
  },

  // ===== DEMO DATA =====
  async loadDemoData() {
    try {
      const r = await fetch('/admin/api/demo', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        this.showToast(data.error || 'Błąd ładowania demo', 'error');
        return;
      }
      // Re-fetch snapshot to update preview
      const snap = await fetch('/api/snapshot').then(r2 => r2.json());
      const c = snap.courts || snap;
      Object.keys(c).forEach(id => { this.courtData[id] = c[id]; });
      this._fitPreviewNames();
      this.showToast('Demo dane załadowane', 'success');
    } catch (err) {
      console.error('Demo load error:', err);
      this.showToast('Błąd ładowania demo', 'error');
    }
  },

  // ===== SSE FOR LIVE DATA IN SETTINGS =====
  initSettingsSSE() {
    if (this._settingsSSE) return;
    // Load snapshot first (but not if viewing demo preview)
    if (!this.demoPreview) {
      fetch('/api/snapshot').then(r => r.json()).then(d => {
        if (this.demoPreview) return; // race guard
        const c = d.courts || d;
        Object.keys(c).forEach(id => { this.courtData[id] = c[id]; });
        this._fitPreviewNames();
      }).catch(() => {});
    }
    // Connect SSE
    this._settingsSSE = new EventSource('/api/stream');
    this._settingsSSE.addEventListener('court_update', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.court_id) {
          // Skip SSE updates while admin is in demo preview mode
          if (this.demoPreview) return;
          const cid = d.court_id;
          delete d.court_id;
          this.courtData[cid] = d;
          this._fitPreviewNames();
        }
      } catch (err) { console.error('SSE parse:', err); }
    });
    this._settingsSSE.onerror = () => {
      this._settingsSSE.close();
      this._settingsSSE = null;
      setTimeout(() => { if (this.activeTab === 'settings') this.initSettingsSSE(); }, 5000);
    };
  },

  // ===== CANVAS HELPERS =====
  updateCanvasScale() {
    const outer = this.$refs?.canvasOuter;
    if (!outer || !outer.clientWidth) {
      // Element not visible yet, retry after a short delay
      setTimeout(() => this.updateCanvasScale(), 100);
      return;
    }
    this.canvasScale = outer.clientWidth / 1920;
  },

  currentOverlay() {
    return (this.overlaySettings.overlays || {})[this.currentOverlayId] || null;
  },

  currentElements() {
    return this.currentOverlay()?.elements || [];
  },

  selectedEl() {
    const els = this.currentElements();
    return this.selectedElIdx >= 0 && this.selectedElIdx < els.length ? els[this.selectedElIdx] : null;
  },

  // ===== KEYBOARD NUDGE =====
  _handleKeyNudge(e) {
    if (this.activeTab !== 'settings') return;
    if (this.selectedElIdx < 0) return;
    // Don't capture if focus is in an input/select/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const indices = this.selectedElIdxSet.length > 0 ? this.selectedElIdxSet : [this.selectedElIdx];
    const els = this.currentElements();
    indices.forEach(idx => {
      const el = els[idx];
      if (!el) return;
      if (el.zone === 'top' && this.currentOverlay()?.top_bar?.enabled) return;
      el.x = Math.round(el.x + dir[0] * step);
      el.y = Math.round(el.y + dir[1] * step);
    });
    this.saveOverlaySettings();
  },

  // ===== MULTI-SELECT =====
  toggleMultiSelect(idx, event) {
    if (event.shiftKey) {
      // Toggle in set
      const pos = this.selectedElIdxSet.indexOf(idx);
      if (pos >= 0) {
        this.selectedElIdxSet.splice(pos, 1);
      } else {
        this.selectedElIdxSet.push(idx);
      }
      this.selectedElIdx = idx;
    } else {
      this.selectedElIdx = idx;
      this.selectedElIdxSet = [idx];
    }
  },

  isMultiSelected(idx) {
    return this.selectedElIdxSet.includes(idx);
  },

  /** Get elements affected by alignment/distribute: multi-select or all visible free */
  _getAlignTargets() {
    const els = this.currentElements();
    if (this.selectedElIdxSet.length >= 2) {
      return this.selectedElIdxSet.map(i => els[i]).filter(Boolean);
    }
    return els.filter(el => el.visible !== false && el.zone === 'free');
  },

  // ===== GRID & ALIGNMENT SYSTEM =====
  _ensureGridDefaults(ov) {
    if (!ov.top_bar) {
      ov.top_bar = { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10 };
    }
    (ov.elements || []).forEach(el => {
      if (!el.zone) el.zone = 'free';
    });
  },

  /** Recompute positions for all elements in the top-bar grid */
  applyTopBarGrid() {
    const ov = this.currentOverlay();
    if (!ov?.top_bar?.enabled) return;
    const topEls = (ov.elements || []).filter(el => el.zone === 'top');
    if (topEls.length === 0) return;
    const cols = ov.top_bar.columns || 3;
    const mx = ov.top_bar.margin_x || 0;
    const mt = ov.top_bar.margin_top || 0;
    const gap = ov.top_bar.gap || 10;
    const totalW = 1920 - 2 * mx;
    const usable = topEls.length > cols ? cols : topEls.length;
    const colW = Math.round((totalW - (usable - 1) * gap) / usable);

    // Use first element's H as reference for linked sizing
    const refH = topEls[0].h || null;

    topEls.forEach((el, i) => {
      if (i >= cols) return; // max cols elements
      // Center within its column slot
      const slotX = mx + i * (colW + gap);
      el.x = Math.round(slotX);
      el.y = mt;
      el.w = colW;
      if (refH) el.h = refH;
    });
  },

  /** Apply linked sizing: when one top-bar element is resized, sync all others */
  _syncTopBarSizes(changedEl) {
    const ov = this.currentOverlay();
    if (!ov?.top_bar?.enabled) return;
    if (changedEl.zone !== 'top') return;
    const topEls = (ov.elements || []).filter(el => el.zone === 'top');
    topEls.forEach(el => {
      if (el !== changedEl) {
        el.w = changedEl.w;
        if (changedEl.h) el.h = changedEl.h;
      }
    });
    this.applyTopBarGrid();
  },

  setTopBarProp(prop, value) {
    const ov = this.currentOverlay();
    if (!ov) return;
    if (!ov.top_bar) ov.top_bar = { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10 };
    ov.top_bar[prop] = value;
    if (ov.top_bar.enabled) this.applyTopBarGrid();
    this.saveOverlaySettings();
  },

  setElZone(zone) {
    const el = this.selectedEl();
    if (!el) return;
    el.zone = zone;
    if (zone === 'top') this.applyTopBarGrid();
    this.saveOverlaySettings();
  },

  /** Edge snap for bottom zone elements */
  snapToEdge(edge) {
    const el = this.selectedEl();
    if (!el) return;
    const w = el.w || 460;
    const h = el.h || 80;
    switch (edge) {
      case 'bottom-left':   el.x = 0; el.y = 1080 - h; break;
      case 'bottom-center': el.x = Math.round((1920 - w) / 2); el.y = 1080 - h; break;
      case 'bottom-right':  el.x = 1920 - w; el.y = 1080 - h; break;
      case 'top-left':      el.x = 0; el.y = 0; break;
      case 'top-center':    el.x = Math.round((1920 - w) / 2); el.y = 0; break;
      case 'top-right':     el.x = 1920 - w; el.y = 0; break;
    }
    this.saveOverlaySettings();
  },

  /** Alignment tools - align multi-selected or all visible free elements */
  alignElements(direction) {
    const els = this._getAlignTargets();
    if (els.length < 2) return;
    switch (direction) {
      case 'left':     { const v = Math.min(...els.map(e => e.x)); els.forEach(e => e.x = v); break; }
      case 'right':    { const v = Math.max(...els.map(e => e.x + (e.w || 460))); els.forEach(e => e.x = v - (e.w || 460)); break; }
      case 'center-h': { const v = Math.round(els.reduce((s, e) => s + e.x + (e.w || 460) / 2, 0) / els.length); els.forEach(e => e.x = Math.round(v - (e.w || 460) / 2)); break; }
      case 'top':      { const v = Math.min(...els.map(e => e.y)); els.forEach(e => e.y = v); break; }
      case 'bottom':   { const v = Math.max(...els.map(e => e.y + (e.h || 80))); els.forEach(e => e.y = v - (e.h || 80)); break; }
      case 'center-v': { const v = Math.round(els.reduce((s, e) => s + e.y + (e.h || 80) / 2, 0) / els.length); els.forEach(e => e.y = Math.round(v - (e.h || 80) / 2)); break; }
    }
    this.saveOverlaySettings();
  },

  /** Distribute elements evenly */
  distributeElements(axis) {
    const els = this._getAlignTargets();
    if (els.length < 3) return;
    if (axis === 'horizontal') {
      els.sort((a, b) => a.x - b.x);
      const first = els[0].x;
      const last = els[els.length - 1].x;
      const step = (last - first) / (els.length - 1);
      els.forEach((e, i) => { e.x = Math.round(first + i * step); });
    } else {
      els.sort((a, b) => a.y - b.y);
      const first = els[0].y;
      const last = els[els.length - 1].y;
      const step = (last - first) / (els.length - 1);
      els.forEach((e, i) => { e.y = Math.round(first + i * step); });
    }
    this.saveOverlaySettings();
  },

  /** Snap drag position to grid/guides and other element edges */
  _snapPosition(x, y, w, h) {
    if (!this.snapEnabled) return { x, y };
    const t = this.snapThreshold;
    const guides = [0, 960, 1920, 1920 / 3, 1920 * 2 / 3, 1920 / 4, 1920 * 3 / 4]; // vertical guides
    const hGuides = [0, 540, 1080]; // horizontal guides

    // Add other element edges as guides
    const els = this.currentElements();
    const dragIdx = this.dragging?.idx ?? -1;
    els.forEach((el, i) => {
      if (i === dragIdx || el.visible === false) return;
      const ew = el.w || 460, eh = el.h || 80;
      guides.push(el.x, el.x + ew, el.x + ew / 2);
      hGuides.push(el.y, el.y + eh, el.y + eh / 2);
    });

    let sx = x, sy = y;
    let bestDx = t + 1, bestDy = t + 1;
    // Snap X: left edge, right edge, center
    for (const g of guides) {
      const dL = Math.abs(x - g);
      const dR = Math.abs(x + w - g);
      const dC = Math.abs(x + w / 2 - g);
      if (dL < bestDx) { bestDx = dL; sx = g; }
      if (dR < bestDx) { bestDx = dR; sx = g - w; }
      if (dC < bestDx) { bestDx = dC; sx = g - w / 2; }
    }
    if (bestDx > t) sx = x; // no snap found within threshold
    // Snap Y: top edge, bottom edge, center
    for (const g of hGuides) {
      const dT = Math.abs(y - g);
      const dB = Math.abs(y + h - g);
      const dC2 = Math.abs(y + h / 2 - g);
      if (dT < bestDy) { bestDy = dT; sy = g; }
      if (dB < bestDy) { bestDy = dB; sy = g - h; }
      if (dC2 < bestDy) { bestDy = dC2; sy = g - h / 2; }
    }
    if (bestDy > t) sy = y;
    return { x: Math.round(sx), y: Math.round(sy) };
  },

  // ===== COPY LAYOUT / TEMPLATES =====
  copyLayoutTo(targetOverlayId) {
    const src = this.currentOverlay();
    const tgt = (this.overlaySettings.overlays || {})[targetOverlayId];
    if (!src || !tgt) return;
    tgt.elements = JSON.parse(JSON.stringify(src.elements));
    tgt.top_bar = JSON.parse(JSON.stringify(src.top_bar || { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10 }));
    this.saveOverlaySettings();
    this.showToast('Layout skopiowany do "' + (tgt.name || targetOverlayId) + '"', 'success');
  },

  applyTemplate(tplName) {
    const ov = this.currentOverlay();
    if (!ov) return;

    // Helper: build a court element
    const mkCourt = (cid, x, y, w, opts = {}) => ({
      type:'court', court_id:String(cid), visible:true, x, y, w,
      zone:opts.zone||'free', show_logo:opts.logo||false,
      font_size:opts.fs||17, bg_opacity:0.95, logo_size:60,
      label_text:opts.label||(opts.noLabel?'':'KORT '+cid),
      label_position:opts.labelPos||'above',
      label_gap:4, label_bg_opacity:0.85, label_font_size:opts.lfs||14,
    });

    // Template: per-court focus (main bottom-left, 3 others top, labels inverted)
    const mkFocus = (focus) => {
      const others = ['1','2','3','4'].filter(c => c !== String(focus));
      return {
        top_bar: { enabled:true, columns:3, margin_x:20, margin_top:10, gap:12 },
        elements: [
          mkCourt(focus, 30, 890, 600, { zone:'free', logo:false, labelPos:'above' }),
          ...others.map((c, i) =>
            mkCourt(c, 20+i*634, 10, 620, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:12 })
          ),
        ],
      };
    };

    const templates = {
      'kort1-focus': mkFocus('1'),
      'kort2-focus': mkFocus('2'),
      'kort3-focus': mkFocus('3'),
      'kort4-focus': mkFocus('4'),
      '3kort-top': {
        top_bar: { enabled: true, columns: 3, margin_x: 20, margin_top: 10, gap: 12 },
        elements: [
          mkCourt('1', 20, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
          mkCourt('2', 654, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
          mkCourt('3', 1286, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
        ],
      },
      '4kort-top': {
        top_bar: { enabled: true, columns: 4, margin_x: 10, margin_top: 10, gap: 10 },
        elements: [
          mkCourt('1', 10, 10, 467, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:11 }),
          mkCourt('2', 487, 10, 467, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:11 }),
          mkCourt('3', 964, 10, 467, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:11 }),
          mkCourt('4', 1441, 10, 467, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:11 }),
        ],
      },
      'main+stats': {
        top_bar: { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10 },
        elements: [
          mkCourt('1', 30, 890, 600, { logo:false, labelPos:'above' }),
          { type:'stats', court_id:'1', visible:true, x:1540, y:860, w:360, zone:'free' },
        ],
      },
      'broadcast': {
        top_bar: { enabled: true, columns: 3, margin_x: 20, margin_top: 10, gap: 12 },
        elements: [
          mkCourt('2', 20, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
          mkCourt('3', 654, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
          mkCourt('4', 1286, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 }),
          mkCourt('1', 30, 890, 600, { logo:false, labelPos:'above' }),
          { type:'stats', court_id:'1', visible:true, x:1540, y:860, w:360, zone:'free' },
        ],
      },
    };
    const tpl = templates[tplName];
    if (!tpl) return;
    if (!confirm('Zastosować szablon? Obecne elementy zostaną zastąpione.')) return;
    ov.elements = JSON.parse(JSON.stringify(tpl.elements));
    ov.top_bar = JSON.parse(JSON.stringify(tpl.top_bar));
    if (ov.top_bar.enabled) this.applyTopBarGrid();
    this.selectedElIdx = -1;
    this.selectedElIdxSet = [];
    this.saveOverlaySettings();
    this.showToast('Szablon zastosowany', 'success');
  },

  /** Duplicate selected element */
  duplicateElement() {
    const ov = this.currentOverlay();
    const el = this.selectedEl();
    if (!ov || !el) return;
    const clone = JSON.parse(JSON.stringify(el));
    clone.x += 30;
    clone.y += 30;
    clone.zone = 'free';
    ov.elements.push(clone);
    this.selectedElIdx = ov.elements.length - 1;
    this.selectedElIdxSet = [this.selectedElIdx];
    this.saveOverlaySettings();
    this.showToast('Element zduplikowany', 'success');
  },

  /** Match selected element size to the first in multi-select */
  matchSize() {
    if (this.selectedElIdxSet.length < 2) return;
    const els = this.currentElements();
    const ref = els[this.selectedElIdxSet[0]];
    if (!ref) return;
    for (let i = 1; i < this.selectedElIdxSet.length; i++) {
      const el = els[this.selectedElIdxSet[i]];
      if (el) { el.w = ref.w; if (ref.h) el.h = ref.h; }
    }
    this.saveOverlaySettings();
    this.showToast('Rozmiary wyrównane', 'success');
  },

  /** Center selected element on screen */
  centerOnScreen(axis) {
    const el = this.selectedEl();
    if (!el) return;
    if (axis === 'h' || axis === 'both') el.x = Math.round((1920 - (el.w || 460)) / 2);
    if (axis === 'v' || axis === 'both') el.y = Math.round((1080 - (el.h || 80)) / 2);
    this.saveOverlaySettings();
  },

  /** Get distance info between hovered and selected element for ruler */
  getRulerInfo() {
    if (this.hoveredElIdx < 0 || this.selectedElIdx < 0 || this.hoveredElIdx === this.selectedElIdx) return null;
    const els = this.currentElements();
    const a = els[this.selectedElIdx];
    const b = els[this.hoveredElIdx];
    if (!a || !b) return null;
    const ax = a.x, ay = a.y, aw = a.w || 460, ah = a.h || 80;
    const bx = b.x, by = b.y, bw = b.w || 460, bh = b.h || 80;
    // Distances between edges
    const dx = bx - (ax + aw); // gap right
    const dy = by - (ay + ah); // gap bottom
    const dxL = ax - (bx + bw); // gap left
    const dyT = ay - (by + bh); // gap top
    return { ax, ay, aw, ah, bx, by, bw, bh, gapRight: dx, gapBottom: dy, gapLeft: dxL, gapTop: dyT };
  },

  /** Render ruler SVG as HTML string (avoids <template> inside SVG for Vite) */
  renderRulerSVG() {
    const r = this.getRulerInfo();
    if (!r) return '';
    const s = this.canvasScale;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" style="width:${1920*s}px;height:${1080*s}px;position:absolute;inset:0;pointer-events:none;z-index:300;">`;
    // Horizontal gap
    if (r.gapRight > 5 || r.gapLeft > 5) {
      const useRight = r.gapRight > 5;
      const x1 = (useRight ? (r.ax+r.aw) : r.bx+r.bw)*s;
      const x2 = (useRight ? r.bx : r.ax)*s;
      const cy = Math.max(r.ay+r.ah/2, r.by+r.bh/2)*s;
      const gap = Math.abs(useRight ? r.gapRight : r.gapLeft);
      const mx = (x1+x2)/2;
      svg += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" class="ruler-line"/>`;
      svg += `<rect x="${mx-16*s}" y="${cy-8*s}" width="${32*s}" height="${16*s}" class="ruler-bg"/>`;
      svg += `<text x="${mx}" y="${cy+4*s}" class="ruler-text">${gap}px</text>`;
    }
    // Vertical gap
    if (r.gapBottom > 5 || r.gapTop > 5) {
      const useBottom = r.gapBottom > 5;
      const y1 = (useBottom ? (r.ay+r.ah) : r.by+r.bh)*s;
      const y2 = (useBottom ? r.by : r.ay)*s;
      const cx = Math.max(r.ax+r.aw/2, r.bx+r.bw/2)*s;
      const gap = Math.abs(useBottom ? r.gapBottom : r.gapTop);
      const my = (y1+y2)/2;
      svg += `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" class="ruler-line"/>`;
      svg += `<rect x="${cx-16*s}" y="${my-8*s}" width="${32*s}" height="${16*s}" class="ruler-bg"/>`;
      svg += `<text x="${cx}" y="${my+4*s}" class="ruler-text">${gap}px</text>`;
    }
    svg += '</svg>';
    return svg;
  },

  // ===== OVERLAY PRESET CRUD =====
  addOverlay() {
    const ids = Object.keys(this.overlaySettings.overlays || {});
    let newId = 'custom_1';
    let n = 1;
    while (ids.includes(newId)) { n++; newId = 'custom_' + n; }
    if (!this.overlaySettings.overlays) this.overlaySettings.overlays = {};
    this.overlaySettings.overlays[newId] = {
      name: 'Nowy overlay ' + n,
      auto_hide: false,
      top_bar: { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10 },
      elements: [
        { type: 'court', court_id: '1', visible: true, x: 24, y: 860, w: 460, zone: 'free',
          show_logo: true, font_size: 17, bg_opacity: 0.95, logo_size: 60,
          label_text: 'KORT 1', label_position: 'above', label_gap: 4, label_bg_opacity: 0.85, label_font_size: 14 },
      ],
    };
    this.currentOverlayId = newId;
    this.selectedElIdx = -1;
    this.saveOverlaySettings();
    this.showToast('Overlay dodany', 'success');
  },

  async removeOverlay() {
    if (!this.currentOverlayId) return;
    if (!confirm('Usunąć overlay "' + (this.currentOverlay()?.name || this.currentOverlayId) + '"?')) return;
    try {
      const r = await fetch('/api/overlay/overlays/' + encodeURIComponent(this.currentOverlayId), { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      delete this.overlaySettings.overlays[this.currentOverlayId];
      const ids = Object.keys(this.overlaySettings.overlays || {});
      this.currentOverlayId = ids[0] || '';
      this.selectedElIdx = -1;
      this.showToast('Overlay usunięty', 'success');
    } catch (err) {
      this.showToast('Błąd usuwania overlay', 'error');
    }
  },

  updateOverlayProp(prop, value) {
    const ov = this.currentOverlay();
    if (ov) { ov[prop] = value; this.saveOverlaySettings(); }
  },

  // ===== ELEMENT CRUD =====
  addElement(type) {
    const ov = this.currentOverlay();
    if (!ov) return;
    if (type === 'court') {
      ov.elements.push({
        type: 'court',
        court_id: this.addElCourtId || '1',
        visible: true,
        x: 100, y: 100, w: 460,
        show_logo: true,
        font_size: 17,
        bg_opacity: 0.95,
        logo_size: 60,
        zone: 'free',
        label_text: 'KORT ' + (this.addElCourtId || '1'),
        label_position: 'above', label_gap: 4, label_bg_opacity: 0.85, label_font_size: 14,
      });
    } else {
      ov.elements.push({
        type: 'stats', court_id: this.addElCourtId || '1',
        visible: true, x: 100, y: 400, w: 360, zone: 'free',
      });
    }
    this.selectedElIdx = ov.elements.length - 1;
    this.saveOverlaySettings();
  },

  removeElement() {
    const ov = this.currentOverlay();
    if (!ov || this.selectedElIdx < 0) return;
    ov.elements.splice(this.selectedElIdx, 1);
    this.selectedElIdx = -1;
    this.saveOverlaySettings();
  },

  setElProp(prop, value) {
    const el = this.selectedEl();
    if (!el) return;
    el[prop] = value;
    this.saveOverlaySettings();
  },

  setDimension(prop, value) {
    const el = this.selectedEl();
    if (!el) return;
    if (prop === 'h' && !value) { delete el.h; this.saveOverlaySettings(); return; }
    if (this.keepAspectRatio && value != null) {
      const curW = el.w || 460;
      const curH = el.h || this._measureElHeight() || 80;
      const aspect = curW / curH;
      if (prop === 'w') { el.w = value; el.h = Math.round(value / aspect); }
      else { el.h = value; el.w = Math.round(value * aspect); }
    } else {
      el[prop] = value;
    }
    this.saveOverlaySettings();
  },

  _measureElHeight() {
    if (this.selectedElIdx < 0) return null;
    const inner = this.$refs.canvasInner;
    if (!inner) return null;
    const dragEls = inner.querySelectorAll('.drag-el');
    const dragEl = dragEls[this.selectedElIdx];
    return dragEl ? Math.round(dragEl.offsetHeight) : null;
  },

  // ===== DRAG AND DROP =====
  startDrag(event, idx) {
    if (this.resizing) return; // don't drag while resizing
    const outer = this.$refs.canvasOuter;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const scale = this.canvasScale;
    const el = this.currentElements()[idx];
    if (!el) return;

    const elScreenX = el.x * scale;
    const elScreenY = el.y * scale;

    this.dragging = {
      idx,
      offsetX: event.clientX - rect.left - elScreenX,
      offsetY: event.clientY - rect.top - elScreenY,
    };
    this.selectedElIdx = idx;
    event.target.setPointerCapture?.(event.pointerId);
  },

  onDrag(event) {
    if (this.resizing) { this._onResize(event); return; }
    if (!this.dragging) return;
    const outer = this.$refs.canvasOuter;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const scale = this.canvasScale;
    const el = this.currentElements()[this.dragging.idx];
    if (!el) return;

    // Grid-locked elements: prevent free dragging
    const ov = this.currentOverlay();
    if (el.zone === 'top' && ov?.top_bar?.enabled) return;

    let newX = (event.clientX - rect.left - this.dragging.offsetX) / scale;
    let newY = (event.clientY - rect.top - this.dragging.offsetY) / scale;

    // Apply snap
    const snapped = this._snapPosition(newX, newY, el.w || 460, el.h || 80);
    el.x = Math.max(-200, Math.min(1920 + 200, snapped.x));
    el.y = Math.max(-200, Math.min(1080 + 200, snapped.y));
  },

  async endDrag(event) {
    if (this.resizing) { this.resizing = null; await this.saveOverlaySettings(); return; }
    if (!this.dragging) return;
    this.dragging = null;
    await this.saveOverlaySettings();
  },

  // ===== RESIZE HANDLES =====
  startResize(event, idx, handle) {
    const el = this.currentElements()[idx];
    if (!el) return;
    const inner = this.$refs.canvasInner;
    const dragEls = inner ? inner.querySelectorAll('.drag-el') : [];
    const dragEl = dragEls[idx];
    const curH = el.h || (dragEl ? Math.round(dragEl.offsetHeight) : 80);
    this.resizing = {
      idx, handle,
      startMouseX: event.clientX, startMouseY: event.clientY,
      startW: el.w, startH: curH, startX: el.x, startY: el.y,
    };
    this.selectedElIdx = idx;
    event.target.setPointerCapture?.(event.pointerId);
  },

  _onResize(event) {
    const r = this.resizing;
    if (!r) return;
    const scale = this.canvasScale;
    const dx = (event.clientX - r.startMouseX) / scale;
    const dy = (event.clientY - r.startMouseY) / scale;
    const el = this.currentElements()[r.idx];
    if (!el) return;
    const h = r.handle;
    let nW = r.startW, nH = r.startH, nX = r.startX, nY = r.startY;
    if (h.includes('e')) nW = r.startW + dx;
    if (h.includes('w')) { nW = r.startW - dx; nX = r.startX + dx; }
    if (h.includes('s')) nH = r.startH + dy;
    if (h.includes('n')) { nH = r.startH - dy; nY = r.startY + dy; }
    if (this.keepAspectRatio && r.startW > 0 && r.startH > 0) {
      const a = r.startW / r.startH;
      if (h === 'e' || h === 'w') nH = nW / a;
      else if (h === 'n' || h === 's') nW = nH * a;
      else nH = nW / a; // corner: W leads
    }
    el.w = Math.max(100, Math.min(1920, Math.round(nW)));
    el.h = Math.max(30, Math.min(1080, Math.round(nH)));
    el.x = Math.max(-200, Math.min(1920 + 200, Math.round(nX)));
    el.y = Math.max(-200, Math.min(1080 + 200, Math.round(nY)));
    // Linked sizing for top-bar grid elements
    this._syncTopBarSizes(el);
  },

  // ===== LIVE SCOREBOARD RENDER IN PREVIEW =====
  renderLiveScoreboard(el) {
    const courtId = el.court_id;
    const court = this.courtData[courtId] || {};
    const pA = court.A || {}, pB = court.B || {};
    const active = court.match_status?.active || false;
    const curSet = court.current_set || 1;
    const logoSize = el.logo_size || 60;
    const bgOpacity = el.bg_opacity != null ? el.bg_opacity : 0.95;
    const sets = [];
    for (let s = 1; s <= 3; s++) {
      const a = pA['set' + s], b = pB['set' + s];
      if (s <= curSet || a > 0 || b > 0) sets.push({ idx: s, a: a || 0, b: b || 0 });
    }
    // Always show at least 2 set columns
    while (sets.length < 2) sets.push({ idx: sets.length + 1, a: 0, b: 0 });
    const isTie = court.tie?.visible || false;
    const ptA = isTie ? (court.tie?.A || 0) : (pA.points || '0');
    const ptB = isTie ? (court.tie?.B || 0) : (pB.points || '0');
    const tbCls = isTie ? ' is-tiebreak' : '';
    const logo = this.overlaySettings.tournament_logo;
    const showLogo = el.show_logo;
    const inactiveClass = active ? '' : 'match-inactive';

    // Grid template: player + points + N sets
    const gridCols = 'grid-template-columns:1fr auto repeat(' + sets.length + ', auto);';

    function pRow(p, serveKey, sideClass) {
      const isServing = court.serve === serveKey;
      let flagHtml = '';
      if (p.flag_url) {
        flagHtml = '<span class="sb-flag has-image" style="background-image:url(' + p.flag_url + ')"></span>';
      } else {
        const code = (p.flag_code || '').toUpperCase();
        flagHtml = '<span class="sb-flag">' + code + '</span>';
      }
      const serveHtml = isServing ? '<span class="sb-serve">\uD83C\uDFBE</span>' : '';
      const dName = p.surname || p.full_name || '\u2014';
      const playerCell = '<div class="sb-player-cell">' + flagHtml
        + '<span class="sb-name" data-full="' + dName.replace(/"/g, '&quot;') + '">' + dName + '</span>'
        + serveHtml + '</div>';

      // Points cell
      const ptsVal = serveKey === 'A' ? ptA : ptB;
      const ptsCell = active
        ? '<div class="sb-metric pts' + tbCls + '">' + ptsVal + '</div>'
        : '<div class="sb-metric pts">\u2014</div>';

      // Set cells
      const setCells = sets.map(s => {
        const val = serveKey === 'A' ? s.a : s.b;
        const activeCls = s.idx === curSet ? ' is-active' : '';
        return '<div class="sb-metric set' + activeCls + '">' + val + '</div>';
      }).join('');

      return '<div class="sb-row ' + sideClass + '" style="' + gridCols + '">'
        + playerCell + ptsCell + setCells + '</div>';
    }

    let logoHtml = '';
    if (showLogo) {
      if (logo) {
        logoHtml = '<div class="sb-logo"><img src="' + logo + '" alt=""></div>';
      } else {
        logoHtml = '<div class="sb-logo"><div class="sb-logo-ph">\uD83C\uDFBE</div></div>';
      }
    }

    const hFill = el.h ? ' h-fill' : '';
    const opacityStyle = bgOpacity < 1 ? 'opacity:' + bgOpacity + ';' : '';
    return '<div class="sb-wrap ' + inactiveClass + hFill + '">'
      + logoHtml
      + '<div class="sb-table" style="' + opacityStyle + '">'
      + pRow(pA, 'A', 'side-a')
      + pRow(pB, 'B', 'side-b')
      + '</div></div>';
  },

  // Render full court element with label (avoids Alpine x-show bug in nested templates)
  renderCourtElement(el) {
    const sb = this.renderLiveScoreboard(el);
    const hasH = !!el.h;
    if (!el.label_text || el.label_position === 'none') {
      return hasH ? '<div style="height:100%;display:flex;flex-direction:column;">' + sb + '</div>' : sb;
    }
    const pos = el.label_position || 'above';
    const bg = 'rgba(0,0,0,' + (el.label_bg_opacity != null ? el.label_bg_opacity : 0.7) + ')';
    const fs = el.label_font_size || 14;
    const gap = el.label_gap != null ? el.label_gap : 4;
    const marginProp = pos === 'above' ? 'margin-bottom' : 'margin-top';
    const radius = pos === 'above' ? 'border-radius:6px 6px 0 0;' : 'border-radius:0 0 6px 6px;';
    const label = '<div class="sb-label-bar" style="background:' + bg + ';font-size:' + fs + 'px;' + marginProp + ':' + gap + 'px;' + radius + '">' + el.label_text + '</div>';
    if (hasH) {
      const sbW = '<div style="flex:1;min-height:0;display:flex;flex-direction:column;">' + sb + '</div>';
      return '<div style="height:100%;display:flex;flex-direction:column;">' + (pos === 'above' ? label + sbW : sbW + label) + '</div>';
    }
    return pos === 'above' ? label + sb : sb + label;
  },

  // Auto-scale long player names in preview
  _abbreviateName(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    const surname = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + '.').join(' ');
    return initials + ' ' + surname;
  },

  _fitPreviewNames() {
    this.$nextTick(() => {
      requestAnimationFrame(() => {
        document.querySelectorAll('.sb-name').forEach(el => {
          el.style.transform = '';
          el.style.overflow = 'hidden';
          const fullName = el.getAttribute('data-full') || el.textContent;
          el.textContent = fullName;
          let sw = el.scrollWidth;
          const cw = el.clientWidth;
          if (sw <= cw + 1) return;
          let scale = cw / sw;
          if (scale >= 0.75) {
            el.style.overflow = 'visible';
            el.style.transform = 'scaleX(' + scale + ')';
            el.style.transformOrigin = 'left center';
            return;
          }
          const abbr = this._abbreviateName(fullName);
          if (abbr !== fullName) {
            el.textContent = abbr;
            sw = el.scrollWidth;
          }
          if (sw > cw + 1) {
            scale = cw / sw;
            el.style.overflow = 'visible';
            el.style.transform = 'scaleX(' + Math.max(scale, 0.55) + ')';
            el.style.transformOrigin = 'left center';
          }
        });
      });
    });
  },

  // ===== LOGO UPLOAD =====
  onLogoFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.cropImgSrc = e.target.result;
      this.cropZoom = 100;
      this._cropOffset = { x: 0, y: 0 };
      this.$refs.cropModal.showModal();
      this.$nextTick(() => this.updateCropTransform());
    };
    reader.readAsDataURL(file);
  },

  updateCropTransform() {
    const img = this.$refs.cropImg;
    if (!img) return;
    const s = this.cropZoom / 100;
    img.style.width = (200 * s) + 'px';
    img.style.height = 'auto';
    img.style.left = this._cropOffset.x + 'px';
    img.style.top = this._cropOffset.y + 'px';
  },

  startCropDrag(e) {
    this._cropDragging = true;
    this._cropStart = { x: e.clientX - this._cropOffset.x, y: e.clientY - this._cropOffset.y };
    e.target.setPointerCapture?.(e.pointerId);
  },

  onCropDrag(e) {
    if (!this._cropDragging) return;
    this._cropOffset = { x: e.clientX - this._cropStart.x, y: e.clientY - this._cropStart.y };
    this.updateCropTransform();
  },

  endCropDrag() {
    this._cropDragging = false;
  },

  async applyCrop() {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const img = this.$refs.cropImg;
    if (!img) return;
    const s = this.cropZoom / 100;
    const w = 200 * s;
    const h = img.naturalHeight * (w / img.naturalWidth);
    ctx.drawImage(img, this._cropOffset.x, this._cropOffset.y, w, h);
    const dataUrl = canvas.toDataURL('image/png');
    this.$refs.cropModal.close();

    try {
      const r = await fetch('/api/overlay/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: dataUrl }),
      });
      if (!r.ok) throw new Error('Upload failed');
      const d = await r.json();
      this.overlaySettings.tournament_logo = d.tournament_logo || dataUrl;
      this.showToast('Logo zapisane', 'success');
    } catch (err) {
      this.showToast('Błąd uploadu logo', 'error');
    }
  },

  async removeLogo() {
    try {
      await fetch('/api/overlay/logo', { method: 'DELETE' });
      this.overlaySettings.tournament_logo = null;
      this.showToast('Logo usunięte', 'success');
    } catch (err) {
      this.showToast('Błąd usuwania logo', 'error');
    }
  },

  // ===== UTILS =====
  async copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('URL skopiowany do schowka', 'success');
    } catch (err) {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      this.showToast('URL skopiowany', 'success');
    }
  },
}));

Alpine.start();
