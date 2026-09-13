/**
 * "Drabinki": the knockout format of every category, chosen after groups are drawn and
 * before the schedule. The server builds the preview (who meets whom as "A1", "B2"),
 * this view draws it as rounds, lets the office swap first-round lines and confirms.
 */
const FORMAT_ORDER = ['table', 'cross', 'main', 'direct', 'none'];
const FORMAT_ICONS = {
  none: 'M8 10h60v26H8zM16 18h44M16 24h44M16 30h32',
  table: 'M8 10h44v26H8zM52 18h28v10H52M80 23h20',
  cross: 'M8 10h32v10H8M8 26h32v10H8M40 15h24v16H40M64 23h32',
  main: 'M6 6h20v8H6M6 18h20v8H6M6 30h20v8H6M6 42h20v4M26 10h20v12H26M26 34h20v10H26M46 16h20v23H46M66 27h20',
  direct: 'M8 8h26v10H8M8 28h26v10H8M34 13h26v20H34M60 23h32',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function sameDraw(a, b) {
  const pick = (config) => JSON.stringify({
    format: config?.format,
    qualifiers: config?.qualifiers,
    places: config?.places,
    consolation: config?.consolation,
    swaps: config?.swaps || {},
  });
  return pick(a) === pick(b);
}

export function createOfficeDrawsView() {
  return {
    drawFormats: [],
    drawFormatsLoaded: false,
    drawActiveId: null,
    drawDraft: null,
    drawDraftBase: null,
    drawPreview: null,
    drawTab: 'main',
    drawPicked: null,
    drawSaving: false,
    drawPreviewSeq: 0,
    drawLoadSeq: 0,

    async loadDrawFormats() {
      if (!this.token) return;
      const seq = ++this.drawLoadSeq;
      try {
        const response = await fetch(`/api/office/${this.slot}/knockout-formats`, { headers: this.officeHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('draws.loadFailed'));
        if (seq !== this.drawLoadSeq) return;
        this.applyDrawFormats(payload.categories);
      } catch (error) {
        console.error('Failed to load knockout formats:', error);
        if (this.activeTab === 'draws') this.showToast(error.message || this.ot('draws.loadFailed'), 'error');
      }
    },

    /** Take a fresh list; the category being edited keeps its unsaved changes. */
    applyDrawFormats(categories) {
      this.drawFormats = Array.isArray(categories) ? categories : [];
      this.drawFormatsLoaded = true;
      const active = this.drawFormats.find((item) => item.category_id === this.drawActiveId)
        || this.drawFormats.find((item) => item.allowed_formats.length > 1 && !item.config.confirmed)
        || this.drawFormats[0]
        || null;
      if (!active) {
        this.drawActiveId = null;
        this.drawDraft = null;
        this.drawPreview = null;
        return;
      }
      // only the office's own changes survive a refresh; a draft nobody touched follows the server
      const editing = active.category_id === this.drawActiveId && this.drawDraftEdited();
      if (active.category_id !== this.drawActiveId) {
        this.drawTab = 'main';
        this.drawPicked = null;
      }
      this.drawActiveId = active.category_id;
      if (editing) {
        this.refreshDrawPreview();
        return;
      }
      this.setDrawDraft(active);
    },

    setDrawDraft(item) {
      this.drawDraft = clone(item.config);
      this.drawDraftBase = clone(item.config);
      this.drawPreview = item;
    },

    drawDraftEdited() {
      return Boolean(this.drawDraft && this.drawDraftBase && !sameDraw(this.drawDraftBase, this.drawDraft));
    },

    drawActive() {
      return this.drawFormats.find((item) => item.category_id === this.drawActiveId) || null;
    },

    selectDrawCategory(item) {
      if (!item || item.category_id === this.drawActiveId) return;
      this.drawActiveId = item.category_id;
      this.setDrawDraft(item);
      this.drawTab = 'main';
      this.drawPicked = null;
    },

    drawDraftDirty() {
      const active = this.drawActive();
      return Boolean(active && this.drawDraftEdited() && !sameDraw(active.config, this.drawDraft));
    },

    drawCategoryLabel(item) {
      return this.officeDisplayLabel(item?.label || '');
    },

    drawGroupsText(item) {
      const groups = (item?.groups || []).filter((group) => group.play_format !== 'knockout');
      if (!groups.length) {
        const entrants = (item?.groups || []).reduce((sum, group) => sum + Number(group.size || 0), 0);
        return entrants
          ? this.ot(item.is_doubles ? 'draws.pairsNoGroups' : 'draws.playersNoGroups', { count: entrants })
          : this.ot('draws.noGroups');
      }
      return this.ot('draws.groupsSizes', { count: groups.length, sizes: groups.map((group) => group.size).join('/') });
    },

    drawFormatName(format) {
      return this.ot(`draws.format.${format}`);
    },

    drawFormatDesc(format) {
      return this.ot(`draws.formatDesc.${format}`);
    },

    drawFormatCards() {
      const active = this.drawActive();
      const allowed = active?.allowed_formats || ['none'];
      return FORMAT_ORDER
        .filter((format) => format === 'none' || format === active?.default_format || allowed.includes(format))
        .map((format) => ({ format, icon: FORMAT_ICONS[format], allowed: allowed.includes(format) }));
    },

    drawItemMatches(item) {
      const isActive = item.category_id === this.drawActiveId;
      const preview = isActive ? this.drawPreview?.preview : item.preview;
      return Number(preview?.matches || 0);
    },

    drawItemFormat(item) {
      const config = item.category_id === this.drawActiveId && this.drawDraft ? this.drawDraft : item.config;
      return config?.format || 'none';
    },

    drawItemState(item) {
      if (item.locked) return 'locked';
      if (item.category_id === this.drawActiveId && this.drawDraftDirty()) return 'changed';
      if (item.allowed_formats.length <= 1) return 'none';
      return item.config.confirmed ? 'confirmed' : 'default';
    },

    drawConfirmedCount() {
      return this.drawFormats.filter((item) => item.config.confirmed || item.allowed_formats.length <= 1).length;
    },

    drawTotalMatches() {
      return this.drawFormats.reduce((sum, item) => sum + this.drawItemMatches(item), 0);
    },

    drawAllConfirmed() {
      return this.drawFormatsLoaded && this.drawFormats.length > 0 && this.drawConfirmedCount() === this.drawFormats.length;
    },

    // ——— editing ———
    updateDrawDraft(patch, { resetSwaps = false } = {}) {
      const active = this.drawActive();
      if (!active || !this.drawDraft || active.locked) return;
      this.drawDraft = { ...this.drawDraft, ...patch, ...(resetSwaps ? { swaps: {} } : {}) };
      this.drawPicked = null;
      if (!this.drawTabs().some((tab) => tab.key === this.drawTab)) this.drawTab = 'main';
      this.refreshDrawPreview();
    },

    chooseDrawFormat(format) {
      const active = this.drawActive();
      if (!active?.allowed_formats.includes(format) || this.drawDraft?.format === format) return;
      const places = format === 'table' || format === 'direct' ? 'third' : 'all';
      this.updateDrawDraft({ format, places }, { resetSwaps: true });
    },

    drawQualifierOptions() {
      const groups = (this.drawActive()?.groups || []).filter((group) => group.play_format !== 'knockout');
      const smallest = groups.length ? Math.min(...groups.map((group) => Number(group.size || 0))) : 2;
      return [1, 2, 3].map((value) => ({ value, allowed: value <= smallest }));
    },

    drawPlacesOptions() {
      return this.drawDraft?.format === 'table' ? ['third', 'none'] : ['all', 'third', 'none'];
    },

    async refreshDrawPreview() {
      const active = this.drawActive();
      if (!active || !this.drawDraft) return;
      if (!this.drawDraftDirty()) {
        this.drawPreview = active;
        return;
      }
      const seq = ++this.drawPreviewSeq;
      try {
        const response = await fetch(`/api/office/${this.slot}/knockout-formats/preview`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({ category_id: active.category_id, config: this.drawDraft }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('draws.previewFailed'));
        if (seq !== this.drawPreviewSeq || active.category_id !== this.drawActiveId) return;
        this.drawPreview = payload.category;
      } catch (error) {
        console.error('Knockout format preview failed:', error);
        this.showToast(error.message || this.ot('draws.previewFailed'), 'error');
      }
    },

    resetDrawSwaps() {
      this.updateDrawDraft({}, { resetSwaps: true });
    },

    drawSwapCount() {
      const swaps = this.drawDraft?.swaps || {};
      return (swaps.main || []).length + (swaps.consolation || []).length;
    },

    drawCanSwap() {
      return ['main', 'cross', 'direct'].includes(this.drawDraft?.format) && !this.drawActive()?.locked;
    },

    pickDrawLine(which, line) {
      if (!this.drawCanSwap()) return;
      const lines = this.drawLines(which);
      const entry = lines[line];
      if (!this.drawPicked || this.drawPicked.which !== which) {
        if (!entry) return;
        this.drawPicked = { which, line, label: entry.label };
        return;
      }
      if (this.drawPicked.line !== line) {
        const swaps = clone(this.drawDraft.swaps || {});
        swaps[which] = [...(swaps[which] || []), [this.drawPicked.line, line]];
        this.drawPicked = null;
        this.updateDrawDraft({ swaps });
        return;
      }
      this.drawPicked = null;
    },

    cancelDrawPick() {
      this.drawPicked = null;
    },

    async confirmDrawFormat() {
      const active = this.drawActive();
      if (!active || !this.drawDraft || this.drawSaving) return;
      this.drawSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/knockout-formats/${active.category_id}`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({ config: { ...this.drawDraft, confirmed: true } }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (response.status === 409) throw new Error(this.ot('draws.lockedError'));
        if (!response.ok) throw new Error(payload.error || this.ot('draws.saveFailed'));
        this.drawDraft = null;
        this.drawDraftBase = null;
        this.applyDrawFormats(payload.categories);
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        if (payload.rebuilt) this.loadOfficePlanningData();
        this.showToast(this.ot('draws.confirmed', { category: this.drawCategoryLabel(active) }), 'success');
        this.openNextUnconfirmedDraw();
      } catch (error) {
        console.error('Failed to save knockout format:', error);
        this.showToast(error.message || this.ot('draws.saveFailed'), 'error');
      } finally {
        this.drawSaving = false;
      }
    },

    openNextUnconfirmedDraw() {
      const next = this.drawFormats.find((item) => item.allowed_formats.length > 1 && !item.config.confirmed && !item.locked);
      if (next) this.selectDrawCategory(next);
    },

    async confirmAllDrawFormats() {
      if (this.drawSaving) return;
      if (this.drawDraftDirty()) {
        await this.confirmDrawFormat();
        if (this.drawDraftDirty()) return;
      }
      this.drawSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/knockout-formats/confirm-all`, {
          method: 'POST',
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('draws.saveFailed'));
        this.applyDrawFormats(payload.categories);
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('draws.allConfirmed'), 'success');
      } catch (error) {
        console.error('Failed to confirm knockout formats:', error);
        this.showToast(error.message || this.ot('draws.saveFailed'), 'error');
      } finally {
        this.drawSaving = false;
      }
    },

    // ——— preview ———
    drawTabs() {
      const format = this.drawDraft?.format;
      if (!format || format === 'none' || format === 'table') return [];
      const tabs = [{ key: 'main', label: this.ot('draws.tabMain') }];
      if (this.drawDraft.places !== 'none') tabs.push({ key: 'places', label: this.ot('draws.tabPlaces') });
      if (format === 'main' && this.drawDraft.consolation && this.drawLines('consolation').length) {
        tabs.push({ key: 'consolation', label: this.ot('draws.tabConsolation') });
      }
      return tabs;
    },

    drawLines(which) {
      const draw = (this.drawPreview?.preview?.draws || []).find((item) => item.key === which);
      return draw?.lines || [];
    },

    drawRoundName(from, size) {
      if (from === 1) {
        if (size === 2) return this.ot('bracket.final');
        if (size === 4) return this.ot('bracket.semifinal');
        if (size === 8) return this.ot('bracket.quarterfinal');
        return this.ot('bracket.roundOf', { n: size / 2, players: size });
      }
      return size === 2
        ? this.ot('bracket.placeFor', { number: from })
        : this.ot('bracket.placesRange', { from, to: from + size - 1 });
    },

    /** Rounds of one draw with byes passed through, as the server collapses them. */
    drawRounds(which) {
      const lines = this.drawLines(which);
      if (lines.length < 2) return [];
      const rounds = [];
      let sources = lines.map((entry, line) => (entry ? { ...entry, line, first: true } : null));
      let size = lines.length;
      let depth = 0;
      while (size >= 2) {
        const name = this.drawRoundName(1, size);
        const matches = [];
        const next = [];
        let played = 0;
        for (let index = 0; index < size / 2; index += 1) {
          const a = sources[2 * index];
          const b = sources[2 * index + 1];
          if (a && b) {
            played += 1;
            const clash = depth === 0 && a.first && b.first && a.group && a.group === b.group;
            matches.push({ key: `${which}_${depth}_${index}`, a, b, clash, bye: false, lines: [2 * index, 2 * index + 1] });
            next.push({ label: this.ot('bracket.winnerOf', { match: `${name} ${played}` }), feed: true });
          } else {
            if (depth === 0) matches.push({ key: `${which}_${depth}_${index}`, a, b, clash: false, bye: true, lines: [2 * index, 2 * index + 1] });
            next.push(a || b || null);
          }
        }
        rounds.push({ key: `${which}_round_${depth}`, name, depth, matches });
        sources = next;
        size /= 2;
        depth += 1;
      }
      const last = rounds[rounds.length - 1];
      if (which === 'main' && this.drawDraft?.places !== 'none' && lines.length >= 4 && rounds.length >= 2) {
        const semifinal = rounds[rounds.length - 2];
        const semis = semifinal.matches.filter((match) => !match.bye).length;
        if (semis === 2) {
          last.third = [1, 2].map((number) => ({ label: this.ot('bracket.loserOf', { match: `${semifinal.name} ${number}` }), feed: true }));
        }
      }
      return rounds.filter((round) => round.matches.length);
    },

    drawClashCount(which) {
      return this.drawRounds(which)[0]?.matches.filter((match) => match.clash).length || 0;
    },

    drawLineClass(entry, which, line, match) {
      const moved = new Set(((this.drawDraft?.swaps || {})[which] || []).flat());
      return {
        'is-bye': !entry,
        'is-feed': Boolean(entry?.feed),
        'is-seed': Boolean(entry?.seed) && !entry?.feed,
        'is-swappable': this.drawCanSwap() && match.depth === 0 && line !== null,
        'is-picked': this.drawPicked?.which === which && this.drawPicked?.line === line && line !== null,
        'is-moved': line !== null && moved.has(line),
        'is-clash': Boolean(match.clash),
      };
    },

    drawEntryLabel(entry) {
      if (!entry) return this.ot('draws.bye');
      return entry.feed ? entry.label : this.formatCompetitorName(entry.label);
    },

    drawEntryFrom(entry) {
      if (!entry || entry.feed || !entry.group) return '';
      return this.ot('draws.fromGroup', { group: entry.group });
    },

    drawTableMatches() {
      return (this.drawPreview?.preview?.table || []).map((row) => ({
        key: row.phase,
        name: row.phase === 'final' ? this.ot('bracket.final') : this.ot('bracket.placeFor', { number: 3 }),
        a: row.a,
        b: row.b,
      }));
    },

    drawPlacementRows() {
      return (this.drawPreview?.preview?.placements || []).map((row) => ({
        key: row.phase,
        name: this.officeDisplayLabel(row.phase),
        matches: row.matches,
      }));
    },

    drawSummaryText() {
      const preview = this.drawPreview?.preview || {};
      if (!preview.consolation_matches) return this.ot('draws.summary', { count: preview.matches || 0 });
      return this.ot('draws.summarySplit', { count: preview.matches || 0, main: preview.main_matches || 0, consolation: preview.consolation_matches || 0 });
    },

    drawPlacesHint() {
      return this.ot(`draws.placesHint.${this.drawDraft?.places || 'all'}`);
    },

    drawQualifiersHint() {
      const groups = (this.drawActive()?.groups || []).filter((group) => group.play_format !== 'knockout').length;
      return this.ot('draws.qualifiersHint', { count: Number(this.drawDraft?.qualifiers || 0) * groups });
    },
  };
}
