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

  // Canvas scale
  canvasScale: 1,

  // Drag state
  dragging: null,
  
  // Court live data from SSE
  courtData: {},
  _settingsSSE: null,

  // Add element defaults
  addElCourtId: '1',

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
    // Recalc canvas scale on resize
    window.addEventListener('resize', () => this.updateCanvasScale());
    this.$nextTick(() => this.updateCanvasScale());
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

  // ===== SSE FOR LIVE DATA IN SETTINGS =====
  initSettingsSSE() {
    if (this._settingsSSE) return;
    // Load snapshot first
    fetch('/api/snapshot').then(r => r.json()).then(d => {
      const c = d.courts || d;
      Object.keys(c).forEach(id => { this.courtData[id] = c[id]; });
    }).catch(() => {});
    // Connect SSE
    this._settingsSSE = new EventSource('/api/stream');
    this._settingsSSE.addEventListener('court_update', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.court_id) {
          const cid = d.court_id;
          delete d.court_id;
          this.courtData[cid] = d;
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
      elements: [
        { type: 'court', court_id: '1', visible: true, x: 24, y: 860, w: 460,
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
        label_text: 'KORT ' + (this.addElCourtId || '1'),
        label_position: 'above', label_gap: 4, label_bg_opacity: 0.85, label_font_size: 14,
      });
    } else {
      ov.elements.push({
        type: 'stats', court_id: this.addElCourtId || '1',
        visible: true, x: 100, y: 400, w: 360,
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

  // ===== DRAG AND DROP =====
  startDrag(event, idx) {
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
    if (!this.dragging) return;
    const outer = this.$refs.canvasOuter;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const scale = this.canvasScale;
    const el = this.currentElements()[this.dragging.idx];
    if (!el) return;

    let newX = (event.clientX - rect.left - this.dragging.offsetX) / scale;
    let newY = (event.clientY - rect.top - this.dragging.offsetY) / scale;

    el.x = Math.max(0, Math.min(1920 - (el.w || 260), Math.round(newX)));
    el.y = Math.max(0, Math.min(1080 - 80, Math.round(newY)));
  },

  async endDrag(event) {
    if (!this.dragging) return;
    this.dragging = null;
    await this.saveOverlaySettings();
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
    if (!sets.length) sets.push({ idx: 1, a: 0, b: 0 });
    const isTie = court.tie?.visible || false;
    const ptA = isTie ? (court.tie?.A || 0) : (pA.points || '0');
    const ptB = isTie ? (court.tie?.B || 0) : (pB.points || '0');
    const tbCls = isTie ? ' is-tiebreak' : '';
    const logo = this.overlaySettings.tournament_logo;
    const showLogo = el.show_logo;
    const inactiveClass = active ? '' : 'match-inactive';

    // Grid template: player + points + N sets
    const gridCols = 'grid-template-columns:minmax(0,2.3fr) minmax(0,1.2fr) repeat(' + sets.length + ',minmax(0,0.95fr));';

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
      const playerCell = '<div class="sb-player-cell">' + flagHtml
        + '<span class="sb-name">' + (p.surname || p.full_name || '\u2014') + '</span>'
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
        logoHtml = '<div class="sb-logo" style="width:' + logoSize + 'px;height:' + logoSize + 'px;"><img src="' + logo + '" alt=""></div>';
      } else {
        logoHtml = '<div class="sb-logo" style="width:' + logoSize + 'px;height:' + logoSize + 'px;"><div class="sb-logo-ph">\uD83C\uDFBE</div></div>';
      }
    }

    const opacityStyle = bgOpacity < 1 ? 'opacity:' + bgOpacity + ';' : '';
    return '<div class="sb-wrap ' + inactiveClass + '">'
      + logoHtml
      + '<div class="sb-table" style="' + opacityStyle + '">'
      + pRow(pA, 'A', 'side-a')
      + pRow(pB, 'B', 'side-b')
      + '</div></div>';
  },

  // Render full court element with label (avoids Alpine x-show bug in nested templates)
  renderCourtElement(el) {
    const sb = this.renderLiveScoreboard(el);
    if (!el.label_text || el.label_position === 'none') return sb;
    const pos = el.label_position || 'above';
    const bg = 'rgba(0,0,0,' + (el.label_bg_opacity != null ? el.label_bg_opacity : 0.7) + ')';
    const fs = el.label_font_size || 14;
    const gap = el.label_gap != null ? el.label_gap : 4;
    const marginProp = pos === 'above' ? 'margin-bottom' : 'margin-top';
    const radius = pos === 'above' ? 'border-radius:6px 6px 0 0;' : 'border-radius:0 0 6px 6px;';
    const label = '<div class="sb-label-bar" style="background:' + bg + ';font-size:' + fs + 'px;' + marginProp + ':' + gap + 'px;' + radius + '">' + el.label_text + '</div>';
    return pos === 'above' ? label + sb : sb + label;
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
