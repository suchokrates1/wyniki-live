import { abbreviateCompetitorName } from '../shared/teamDisplay.js';
import { calcMatchTime } from '../shared/matchTime.js';

function codeToFlag(code) {
  if (!code || code.length < 2) return '';
  return 'https://flagcdn.com/w40/' + code.toLowerCase().slice(0, 2) + '.png';
}

function flagSpans(p) {
  let html = '';
  const flagUrl = p.flag_url || (p.flag_code ? codeToFlag(p.flag_code) : '');
  const partnerUrl = p.flag_url_partner || (p.flag_code_partner ? codeToFlag(p.flag_code_partner) : '');
  const primary = String(p.flag_code || '').toUpperCase();
  const partner = String(p.flag_code_partner || '').toUpperCase();
  if (flagUrl) {
    html += '<span class="sb-flag has-image" style="background-image:url(' + flagUrl + ')"></span>';
  }
  if (partnerUrl && partner && partner !== primary) {
    html += '<span class="sb-flag has-image" style="background-image:url(' + partnerUrl + ')"></span>';
  }
  return html ? '<span class="player-flags">' + html + '</span>' : '';
}

export const VEST_MEDIA_LOGO_URL = '/vest-media-logo.png';

export function createOverlayAdmin() {
  return {
      VEST_MEDIA_LOGO_URL,
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

     // ===== OVERLAY SETTINGS =====
     async loadOverlaySettings() {
       try {
         const response = await fetch('/api/overlay/settings');
         if (response.ok) {
           this.overlaySettings = await response.json();
           // Migrate: ensure grid defaults exist on each overlay
           Object.values(this.overlaySettings.overlays || {}).forEach(ov => {
             this._ensureGridDefaults(ov);
             if (ov.tournament_id != null && ov.tournament_id !== '') {
               ov.tournament_id = Number(ov.tournament_id) || null;
             }
             if (ov.top_bar?.enabled) this.applyTopBarGrid(ov);
           });
           // Auto-select first overlay if current is missing
           const ids = Object.keys(this.overlaySettings.overlays || {});
           if (ids.length && !this.overlaySettings.overlays[this.currentOverlayId]) {
             this.currentOverlayId = ids[0];
           }
           this.addElCourtId = this.overlayCourtOptions()[0]?.value || '1';
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

    currentOverlayTournamentId(overlay = null) {
      const targetOverlay = overlay || this.currentOverlay();
      const normalizedId = Number(targetOverlay?.tournament_id);
      return normalizedId > 0 ? normalizedId : null;
    },

    currentOverlayTournament() {
      return this.getTournamentById(this.currentOverlayTournamentId());
    },

    overlayBrandingLogo(overlay = null) {
      const tournament = this.getTournamentById(this.currentOverlayTournamentId(overlay));
      return tournament?.logo_path || this.overlaySettings.tournament_logo || null;
    },

    overlayBrandingName(overlay = null) {
      const tournament = this.getTournamentById(this.currentOverlayTournamentId(overlay));
      return tournament?.name || this.overlaySettings.tournament_name || '';
    },

    overlayUrl(overlayId = null) {
      const targetOverlayId = overlayId || this.currentOverlayId;
      if (!targetOverlayId) return '';
      const overlay = (this.overlaySettings.overlays || {})[targetOverlayId];
      if (!overlay) return '';
      const tournamentId = this.currentOverlayTournamentId(overlay);
      if (tournamentId) {
        const slot = this.activeTournamentSlot(tournamentId);
        if (!slot) return '';
        return location.origin + '/overlay/' + slot + '/' + targetOverlayId;
      }
      return location.origin + '/overlay/' + targetOverlayId;
    },

    overlayCourtEntries(overlay = null) {
      const targetOverlay = overlay || this.currentOverlay();
      const tournamentId = this.currentOverlayTournamentId(targetOverlay);
      if (!tournamentId) {
        return (this.courts || []).map(court => ({
          value: String(court.kort_id),
          label: 'Kort ' + (court.name || court.kort_id),
          court,
        }));
      }
      return (this.courts || [])
        .filter(court => Number(court.tournament_id) === tournamentId)
        .sort((a, b) => {
          const orderA = Number(a.display_order || 0);
          const orderB = Number(b.display_order || 0);
          if (orderA !== orderB) return orderA - orderB;
          return String(a.name || a.kort_id).localeCompare(String(b.name || b.kort_id), undefined, { numeric: true, sensitivity: 'base' });
        })
        .map((court, index) => ({
          value: String(index + 1),
          label: 'Kort ' + (court.name || index + 1),
          court,
        }));
    },

    overlayCourtOptions(overlay = null) {
      const entries = this.overlayCourtEntries(overlay);
      return entries.length ? entries : [{ value: '1', label: 'Kort 1', court: null }];
    },

    resolveOverlayCourt(overlay, courtToken) {
      const entries = this.overlayCourtEntries(overlay);
      const token = String(courtToken ?? '');
      const exact = entries.find(entry => String(entry.value) === token || String(entry.court?.kort_id || '') === token);
      if (exact) return exact.court;
      const ordinal = Number.parseInt(token, 10);
      if (!Number.isNaN(ordinal) && ordinal > 0 && ordinal <= entries.length) {
        return entries[ordinal - 1]?.court || null;
      }
      return null;
    },

    resolveOverlayCourtData(courtToken, overlay = null) {
      const targetOverlay = overlay || this.currentOverlay();
      const court = this.resolveOverlayCourt(targetOverlay, courtToken);
      if (!court?.kort_id) return {};
      return this.courtData[String(court.kort_id)] || {};
    },

    setCurrentOverlayTournament(tournamentId) {
      const overlay = this.currentOverlay();
      if (!overlay) return;
      const normalizedId = Number(tournamentId);
      overlay.tournament_id = normalizedId > 0 ? normalizedId : null;
      this.addElCourtId = this.overlayCourtOptions(overlay)[0]?.value || '1';
      this.saveOverlaySettings();
      this._fitPreviewNames();
    },

    // ===== DEMO DATA =====
    async _loadDemoStatus() {
      try {
        const r = await fetch('/admin/api/demo/status');
        if (r.ok) {
          const d = await r.json();
          this.demoOverlayActive = d.demo_overlay_active || false;
          if (d.demo_loaded && d.demo_courts) {
            this.demoPreview = true;
            Object.keys(d.demo_courts).forEach(id => { this.courtData[id] = d.demo_courts[id]; });
            this._fitPreviewNames();
          }
        }
      } catch (e) { /* ignore */ }
    },

    async loadDemoData() {
      try {
        const r = await fetch('/admin/api/demo', { method: 'POST' });
        const data = await r.json();
        if (!r.ok) {
          this.showToast(data.error || 'Błąd ładowania demo', 'error');
          return;
        }
        // Store demo courts in preview (does NOT affect production overlays)
        if (data.demo_courts) {
          Object.keys(data.demo_courts).forEach(id => { this.courtData[id] = data.demo_courts[id]; });
        }
        this.demoPreview = true;
        this.demoOverlayActive = data.demo_overlay_active || false;
        this._fitPreviewNames();
        this.showToast(data.message || 'Demo załadowane (tylko podgląd)', 'success');
      } catch (err) {
        console.error('Demo load error:', err);
        this.showToast('Błąd ładowania demo', 'error');
      }
    },

    async toggleDemoOverlay() {
      const newState = !this.demoOverlayActive;
      try {
        const r = await fetch('/admin/api/demo/overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: newState }),
        });
        const data = await r.json();
        if (!r.ok) {
          this.showToast(data.error || 'Błąd przełączania demo', 'error');
          return;
        }
        this.demoOverlayActive = data.active;
        this.showToast(data.message, data.active ? 'warning' : 'success');
      } catch (err) {
        console.error('Demo overlay toggle error:', err);
        this.showToast('Błąd przełączania demo', 'error');
      }
    },

    async clearDemo() {
      try {
        const r = await fetch('/admin/api/demo', { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) {
          this.showToast(data.error || 'Błąd czyszczenia demo', 'error');
          return;
        }
        this.demoPreview = false;
        this.demoOverlayActive = false;
        // Restore real court data
        try {
          const snap = await fetch('/api/snapshot').then(r2 => r2.json());
          const c = snap.courts || snap;
          Object.keys(c).forEach(id => { this.courtData[id] = c[id]; });
          this._fitPreviewNames();
        } catch (e) { /* best effort */ }
        this.showToast('Demo wyczyszczone', 'success');
      } catch (err) {
        console.error('Demo clear error:', err);
        this.showToast('Błąd czyszczenia demo', 'error');
      }
    },

    // ===== SSE FOR LIVE COURT DATA (battery, scores, overlay preview) =====
    _initGlobalSSE() {
      if (this._globalSSE) return;
      this._globalSSE = new EventSource('/api/stream');
      this._globalSSE.addEventListener('court_update', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.court_id && !this.demoPreview) {
            const cid = d.court_id;
            delete d.court_id;
            this.courtData[cid] = d;
            // Update overlay preview names if on settings tab
            if (this.activeTab === 'settings') this._fitPreviewNames();
          }
        } catch (err) { console.error('SSE parse:', err); }
      });
      this._globalSSE.onerror = () => {
        this._globalSSE.close();
        this._globalSSE = null;
        setTimeout(() => this._initGlobalSSE(), 5000);
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
        ov.top_bar = { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10, reserve_expanded: true };
      } else if (ov.top_bar.reserve_expanded === undefined) {
        ov.top_bar.reserve_expanded = true;
      }
      if (!ov.watermark) {
        ov.watermark = { enabled: false, opacity: 0.4, position: 'bottom-right', size: 140 };
      }
      (ov.elements || []).forEach(el => {
        if (!el.zone) el.zone = 'free';
      });
    },

    /** Estimated height for a court slot at 2-set expanded scoreboard (label + SB). */
    estimateTopSlotHeight(el) {
      const labelPos = el.label_position || 'above';
      const hasLabel = labelPos !== 'none' && String(el.label_text || '').trim().length > 0;
      const labelFs = el.label_font_size || (el.zone === 'top' ? 12 : 14);
      const labelGap = el.label_gap != null ? el.label_gap : 4;
      const labelH = hasLabel ? (labelFs + 16 + labelGap) : 0;
      // Two scoreboard rows (~36–38px each) — stable regardless of set-column count
      const sbH = 76;
      return Math.ceil(labelH + sbH);
    },

    topBarGuideStyle(colIndex) {
      const ov = this.currentOverlay();
      if (!ov?.top_bar) return '';
      const tb = ov.top_bar;
      const cols = tb.columns || 3;
      const mx = tb.margin_x || 0;
      const mt = tb.margin_top || 0;
      const gap = tb.gap || 10;
      const totalW = 1920 - 2 * mx;
      const colW = (totalW - (cols - 1) * gap) / cols;
      const x = mx + colIndex * (colW + gap);
      const topEls = (ov.elements || []).filter(el => el.zone === 'top');
      const reserved = tb.reserve_expanded !== false
        ? Math.max(60, ...topEls.map(el => this.estimateTopSlotHeight(el)), topEls[0]?.h || 0)
        : Math.max(60, topEls[0]?.h || 60);
      return 'position:absolute;left:' + x + 'px;top:' + mt + 'px;width:' + colW + 'px;height:' + reserved
        + 'px;border:1px dashed rgba(0,255,150,0.35);border-radius:6px;background:rgba(0,255,150,0.04);';
    },

    /** Recompute positions for all elements in the top-bar grid */
    applyTopBarGrid(targetOv) {
      const ov = targetOv || this.currentOverlay();
      if (!ov?.top_bar?.enabled) return;
      this._ensureGridDefaults(ov);
      const topEls = (ov.elements || []).filter(el => el.zone === 'top');
      if (topEls.length === 0) return;
      const cols = ov.top_bar.columns || 3;
      const mx = ov.top_bar.margin_x || 0;
      const mt = ov.top_bar.margin_top || 0;
      const gap = ov.top_bar.gap || 10;
      const totalW = 1920 - 2 * mx;
      const usable = topEls.length > cols ? cols : topEls.length;
      const colW = Math.round((totalW - (usable - 1) * gap) / usable);

      let slotH = null;
      if (ov.top_bar.reserve_expanded !== false) {
        slotH = Math.max(...topEls.map(el => this.estimateTopSlotHeight(el)));
      } else if (topEls[0].h) {
        slotH = topEls[0].h;
      }

      topEls.forEach((el, i) => {
        if (i >= cols) return; // max cols elements
        const slotX = mx + i * (colW + gap);
        el.x = Math.round(slotX);
        el.y = mt;
        el.w = colW;
        if (slotH) el.h = slotH;
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
      this._ensureGridDefaults(ov);
      ov.top_bar[prop] = value;
      if (ov.top_bar.enabled) this.applyTopBarGrid();
      this.saveOverlaySettings();
    },

    setWatermarkProp(prop, value) {
      const ov = this.currentOverlay();
      if (!ov) return;
      this._ensureGridDefaults(ov);
      ov.watermark[prop] = value;
      this.saveOverlaySettings();
    },

    watermarkStyle() {
      const ov = this.currentOverlay();
      const wm = ov?.watermark || {};
      const size = wm.size || 140;
      const opacity = wm.opacity != null ? wm.opacity : 0.4;
      const margin = 36;
      const pos = wm.position || 'bottom-right';
      let place = '';
      if (pos === 'top-left') place = `left:${margin}px;top:${margin}px;`;
      else if (pos === 'top-right') place = `right:${margin}px;top:${margin}px;`;
      else if (pos === 'bottom-left') place = `left:${margin}px;bottom:${margin}px;`;
      else place = `right:${margin}px;bottom:${margin}px;`;
      return place + `width:${size}px;height:${size}px;opacity:${opacity};`;
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

      // Get dynamic court IDs scoped to the selected overlay tournament
      const courtIds = this.overlayCourtOptions(ov).map(option => String(option.value));
      if (courtIds.length === 0) {
        this.showToast('Brak kortów — dodaj korty najpierw', 'warning');
        return;
      }

      // Helper: build a court element
      const mkCourt = (cid, x, y, w, opts = {}) => ({
        type:'court', court_id:String(cid), visible:true, x, y, w,
        zone:opts.zone||'free', show_logo:opts.logo||false,
        font_size:opts.fs||17, bg_opacity:0.95, logo_size:60,
        label_text:opts.label||(opts.noLabel?'':'KORT '+cid),
        label_position:opts.labelPos||'above',
        label_gap:4, label_bg_opacity:0.85, label_font_size:opts.lfs||14,
      });

      // Template: per-court focus (main at bottom-left, rest at the top)
      const mkFocus = (focus) => {
        const others = courtIds.filter(c => c !== String(focus));
        const topCols = Math.min(others.length, 4);
        return {
          top_bar: { enabled:true, columns:topCols, margin_x:20, margin_top:10, gap:12, reserve_expanded:true },
          elements: [
            mkCourt(focus, 30, 890, 600, { zone:'free', logo:false, labelPos:'above' }),
            ...others.slice(0, topCols).map((c, i) =>
              mkCourt(c, 20+i*634, 10, 620, { zone:'top', logo:false, labelPos:'below', fs:14, lfs:12 })
            ),
          ],
        };
      };

      // Build dynamic focus templates for all courts
      const templates = {};
      courtIds.forEach(cid => {
        templates['kort'+cid+'-focus'] = mkFocus(cid);
      });

      // N-courts top bar
      const topN = (n) => {
        const ids = courtIds.slice(0, n);
        return {
          top_bar: { enabled: true, columns: ids.length, margin_x: 20, margin_top: 10, gap: 12, reserve_expanded: true },
          elements: ids.map((c, i) =>
            mkCourt(c, 20+i*634, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 })
          ),
        };
      };
      templates['3kort-top'] = topN(3);
      templates['4kort-top'] = topN(4);

      // All courts top bar
      templates['all-top'] = topN(courtIds.length);

      const mainCourt = courtIds[0];
      const otherCourts = courtIds.slice(1);
      templates['main+stats'] = {
        top_bar: { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10, reserve_expanded: true },
        elements: [
          mkCourt(mainCourt, 30, 890, 600, { logo:false, labelPos:'above' }),
          { type:'stats', court_id:mainCourt, visible:true, x:1540, y:860, w:360, zone:'free' },
        ],
      };

      const broadcastTopCols = Math.min(otherCourts.length, 4);
      templates['broadcast'] = {
        top_bar: { enabled: true, columns: broadcastTopCols || 3, margin_x: 20, margin_top: 10, gap: 12, reserve_expanded: true },
        elements: [
          ...otherCourts.slice(0, broadcastTopCols).map((c, i) =>
            mkCourt(c, 20+i*634, 10, 620, { zone:'top', logo:false, labelPos:'below', lfs:12 })
          ),
          mkCourt(mainCourt, 30, 890, 600, { logo:false, labelPos:'above' }),
          { type:'stats', court_id:mainCourt, visible:true, x:1540, y:860, w:360, zone:'free' },
        ],
      };

      const tpl = templates[tplName];
      if (!tpl) {
        this.showToast('Nieznany szablon: ' + tplName, 'warning');
        return;
      }
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

    /** Auto-add scoreboard element for a new court to all overlay presets */
    _addCourtToOverlays(courtId) {
      // Overlay layouts are now scoped per tournament and use court ordinals,
      // so court additions do not mutate existing presets automatically.
    },

    /** Auto-remove elements for a deleted court from all overlay presets */
    _removeCourtFromOverlays(courtId) {
      // Overlay layouts are now scoped per tournament and use court ordinals,
      // so court removals do not mutate existing presets automatically.
    },

    addOverlay() {
      const ids = Object.keys(this.overlaySettings.overlays || {});
      let newId = 'custom_1';
      let n = 1;
      while (ids.includes(newId)) { n++; newId = 'custom_' + n; }
      const defaultTournamentId = this.selectedTournament || this.activeTournamentsList()[0]?.id || null;
      if (!this.overlaySettings.overlays) this.overlaySettings.overlays = {};
      this.overlaySettings.overlays[newId] = {
        name: 'Nowy overlay ' + n,
        auto_hide: true,
        tournament_id: defaultTournamentId,
        top_bar: { enabled: false, columns: 3, margin_x: 0, margin_top: 0, gap: 10, reserve_expanded: true },
        watermark: { enabled: false, opacity: 0.4, position: 'bottom-right', size: 140 },
        elements: [
          { type: 'court', court_id: '1', visible: true, x: 24, y: 860, w: 460, zone: 'free',
            show_logo: true, font_size: 17, bg_opacity: 0.95, logo_size: 60,
            label_text: 'KORT 1', label_position: 'above', label_gap: 4, label_bg_opacity: 0.85, label_font_size: 14 },
        ],
      };
      this.currentOverlayId = newId;
      this.selectedElIdx = -1;
      this.addElCourtId = this.overlayCourtOptions(this.overlaySettings.overlays[newId])[0]?.value || '1';
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
      const defaultCourtId = this.addElCourtId || this.overlayCourtOptions(ov)[0]?.value || '1';
      if (type === 'court') {
        ov.elements.push({
          type: 'court',
          court_id: defaultCourtId,
          visible: true,
          x: 100, y: 100, w: 460,
          show_logo: true,
          font_size: 17,
          bg_opacity: 0.95,
          logo_size: 60,
          zone: 'free',
          label_text: 'KORT ' + defaultCourtId,
          label_position: 'above', label_gap: 4, label_bg_opacity: 0.85, label_font_size: 14,
        });
      } else {
        ov.elements.push({
          type: 'stats', court_id: defaultCourtId,
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
      if (el.zone === 'top' && (prop === 'show_logo' || String(prop).startsWith('label_'))) {
        this.applyTopBarGrid();
      }
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
      const court = this.resolveOverlayCourtData(courtId);
      const pA = court.A || {}, pB = court.B || {};
      const active = court.match_status?.active || false;
      const curSet = court.current_set || 1;
      const logoSize = el.logo_size || 60;
      const bgOpacity = el.bg_opacity != null ? el.bg_opacity : 0.95;
      const hasSetDetail = Array.isArray(court.sets_detail) && court.sets_detail.length > 0;
      const regularSetWins = (() => {
        const wins = { A: 0, B: 0 };
        if (hasSetDetail) {
          for (const setInfo of court.sets_detail) {
            if (setInfo?.stb) continue;
            const a = Number(setInfo?.p1 ?? 0);
            const b = Number(setInfo?.p2 ?? 0);
            if (a > b) wins.A += 1;
            else if (b > a) wins.B += 1;
          }
          return wins;
        }
        for (let setIdx = 1; setIdx <= 2; setIdx += 1) {
          const a = Number(pA['set' + setIdx] || 0);
          const b = Number(pB['set' + setIdx] || 0);
          if (a > b) wins.A += 1;
          else if (b > a) wins.B += 1;
        }
        return wins;
      })();
      const isSuperTB = !!court.super_tiebreak_active || (Number(curSet) === 3 && regularSetWins.A === 1 && regularSetWins.B === 1);
      const readSetValue = (playerState, setIdx) => {
        if (active && setIdx > curSet) return 0;
        return playerState['set' + setIdx] || 0;
      };
      const hasThirdSetScore = readSetValue(pA, 3) > 0 || readSetValue(pB, 3) > 0;
      const visibleSetCount = active
        ? (isSuperTB ? 2 : Math.max(2, Math.min(3, curSet)))
        : (hasThirdSetScore ? 3 : 2);
      const sets = [];
      for (let s = 1; s <= 3; s++) {
        const a = readSetValue(pA, s), b = readSetValue(pB, s);
        if (s <= visibleSetCount || a > 0 || b > 0) sets.push({ idx: s, a: a || 0, b: b || 0 });
      }
      // Always show at least 2 set columns
      while (sets.length < 2) sets.push({ idx: sets.length + 1, a: 0, b: 0 });
      const isTie = court.tie?.visible || false;
      const ptA = isTie ? (court.tie?.A || 0) : (pA.points || '0');
      const ptB = isTie ? (court.tie?.B || 0) : (pB.points || '0');
      const tbCls = (isTie || isSuperTB) ? ' is-tiebreak' : '';
      const logo = this.overlayBrandingLogo();
      const showLogo = el.show_logo;
      const inactiveClass = active ? '' : 'match-inactive';

      // Grid template: player + points + N sets
      const gridCols = 'grid-template-columns:1fr auto repeat(' + sets.length + ', auto);';

      function pRow(p, serveKey, sideClass) {
        const isServing = court.serve === serveKey;
        let flagHtml = flagSpans(p);
        const serveHtml = isServing ? '<span class="sb-serve"><img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 36 36%27%3E%3Ccircle cx=%2718%27 cy=%2718%27 r=%2717%27 fill=%27%23C6E953%27/%3E%3Ccircle cx=%2718%27 cy=%2718%27 r=%2717%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%272%27/%3E%3Cpath d=%27M5 11c4 8 14 14 26 6%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%272%27/%3E%3Cpath d=%27M5 25c6-8 16-14 26-6%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%272%27/%3E%3C/svg%3E" alt="serve" style="width:16px;height:16px;"></span>' : '';
        const dName = p.surname || p.full_name || '\u2014';
        const isTeam = String(dName).includes(' / ');
        const shown = isTeam ? this._abbreviateName(dName) : dName;
        const teamClass = isTeam ? ' is-team' : '';
        const playerCell = '<div class="sb-player-cell">' + flagHtml
          + '<span class="sb-name' + teamClass + '" data-full="' + dName.replace(/"/g, '&quot;') + '">' + shown + '</span>'
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

      // Match time bar
      let timeHtml = '';
      const liveClock = active ? calcMatchTime(court) : null;
      if (liveClock) {
        timeHtml = '<div class="sb-time-bar"><span class="time-icon">&#9201;</span> ' + liveClock + '</div>';
      }

      const hFill = el.h ? ' h-fill' : '';
      const opacityStyle = bgOpacity < 1 ? 'opacity:' + bgOpacity + ';' : '';
      return '<div class="sb-wrap ' + inactiveClass + hFill + '">'
        + logoHtml
        + '<div style="flex:1;min-width:0;">'
        + '<div class="sb-table" style="' + opacityStyle + '">'
        + pRow(pA, 'A', 'side-a')
        + pRow(pB, 'B', 'side-b')
        + '</div>' + timeHtml + '</div></div>';
    },

    _calcMatchTime(court) {
      return calcMatchTime(court);
    },

      // Render full court element with label, wrapped in overlay-container (matches OBS overlay)
      renderCourtElement(el) {
     const sb = this.renderLiveScoreboard(el);
     const hasH = !!el.h;
     const pos = el.label_position || 'above';
     const showLabel = el.label_text && pos !== 'none';

     // Build label with inline time (matching OBS overlay)
     let label = '';
     if (showLabel) {
       const bg = 'rgba(0,0,0,' + (el.label_bg_opacity != null ? el.label_bg_opacity : 0.7) + ')';
       const fs = el.label_font_size || 14;
       const belowCls = pos === 'below' ? ' label-below' : '';
       const court = this.resolveOverlayCourtData(el.court_id);
       const timeStr = this._calcMatchTime(court);
       const timeHtml = timeStr ? '<span class="label-sep">|</span><span class="label-time">⏱ ' + timeStr + '</span>' : '';
       label = '<div class="sb-label-bar' + belowCls + '" style="background:' + bg + ';font-size:' + fs + 'px;">'
         + '<span class="label-text">' + el.label_text + '</span>' + timeHtml + '</div>';
     }

     // Wrap in overlay-container (unified dark bg, matching OBS)
     if (hasH) {
       const sbW = '<div style="flex:1;min-height:0;display:flex;flex-direction:column;">' + sb + '</div>';
       return '<div class="overlay-container" style="height:100%;display:flex;flex-direction:column;">'
         + (pos === 'above' ? label + sbW : sbW + label) + '</div>';
     }
     return '<div class="overlay-container">' + (pos === 'above' ? label + sb : sb + label) + '</div>';
      },

      // Auto-scale long player names in preview
      _abbreviateName(name) {
        return abbreviateCompetitorName(name);
      },

      // ===== STATS PANEL RENDER IN PREVIEW =====
      _sv(val, suffix) { return val != null ? val + (suffix || '') : '\u2014'; },
      _serveRatio(si, st) { return (si != null && st != null) ? si + '/' + st : '\u2014'; },
      _totalPtsWon(own, opp) {
     return (own.aces || 0) + (own.winners || 0) + (opp.double_faults || 0) + (opp.forced_errors || 0) + (opp.unforced_errors || 0);
      },

      renderStatsPanel(el) {
     const court = this.resolveOverlayCourtData(el.court_id);
     const active = court.match_status?.active || false;
     if (!active) return '<div class="sp-title">Statystyki</div><div style="text-align:center;opacity:0.4;font-size:11px;">Brak aktywnego meczu</div>';
     const st = court.stats || {};
     const pA = court.A || {}, pB = court.B || {};
     const nA = pA.surname || pA.full_name || 'A';
     const nB = pB.surname || pB.full_name || 'B';
     const sA = st.player_a || {}, sB = st.player_b || {};
     const mode = el.stats_mode || 'simple';
     const rows = [
       { l: 'Asy', a: this._sv(sA.aces), b: this._sv(sB.aces) },
       { l: 'Podw. b\u0142\u0119dy', a: this._sv(sA.double_faults), b: this._sv(sB.double_faults) },
       { l: 'Winnery', a: this._sv(sA.winners), b: this._sv(sB.winners) },
     ];
     if (mode === 'advanced') {
       rows.push({ l: 'B\u0142. wymuszone', a: this._sv(sA.forced_errors), b: this._sv(sB.forced_errors) });
     }
     rows.push({ l: 'B\u0142. niewymuszone', a: this._sv(sA.unforced_errors), b: this._sv(sB.unforced_errors) });
     if (mode === 'advanced') {
       rows.push({ l: '1. serwis', a: this._serveRatio(sA.first_serves_in, sA.first_serves_total), b: this._serveRatio(sB.first_serves_in, sB.first_serves_total) });
     }
     rows.push({ l: '1. serwis %', a: this._sv(sA.first_serve_pct, '%'), b: this._sv(sB.first_serve_pct, '%') });
     if (mode === 'advanced') {
       rows.push({ l: '2. serwis %', a: this._sv(sA.second_serve_pct, '%'), b: this._sv(sB.second_serve_pct, '%') });
       rows.push({ l: 'Pkt wygrane', a: this._totalPtsWon(sA, sB), b: this._totalPtsWon(sB, sA) });
     }
     const title = mode === 'advanced' ? 'Statystyki zaawansowane' : 'Statystyki';
     const header = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;font-size:10px;font-weight:700;margin-bottom:6px;opacity:0.7;"><div></div><div style="text-align:center;">' + this._abbreviateName(nA) + '</div><div style="text-align:center;">' + this._abbreviateName(nB) + '</div></div>';
     const body = rows.map(r => '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;font-size:11px;padding:2px 0;"><div style="opacity:0.7;">' + r.l + '</div><div style="text-align:center;font-weight:600;">' + r.a + '</div><div style="text-align:center;font-weight:600;">' + r.b + '</div></div>').join('');
     return '<div class="sp-title">' + title + '</div>' + header + body;
      },

      _fitPreviewNames() {
     this.$nextTick(() => {
       requestAnimationFrame(() => {
         document.querySelectorAll('.sb-name').forEach(el => {
           el.style.transform = '';
           el.style.overflow = 'hidden';
           const fullName = el.getAttribute('data-full') || el.textContent;
           el.textContent = fullName;
           if (String(fullName).includes(' / ')) {
             el.classList.add('is-team');
             el.style.whiteSpace = 'normal';
             el.textContent = this._abbreviateName(fullName);
             return;
           }
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
  };
}
