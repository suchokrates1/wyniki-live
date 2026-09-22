/** Auto-scheduler planning board helpers (extracted from scheduleView). */

export function createOfficeAutoScheduleView() {
  return {
    async loadAutoConfig() {
      if (!this.token) return;
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/config`, {
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.configFailed'));
        this.autoConfig = payload.config || null;
        this.autoCourts = Array.isArray(payload.courts) ? payload.courts : [];
        this.autoBands = Array.isArray(payload.bands) ? payload.bands : [];
        this.autoStartTime = this.autoConfig?.start_time || '09:30';
        this.autoEndTime = this.autoConfig?.end_time || this.autoEndTime || '18:00';
        const savedB1Courts = Array.isArray(this.autoConfig?.b1_court_ids)
          ? this.autoConfig.b1_court_ids.map(String).filter(Boolean)
          : [];
        const fallbackB1 = this.autoConfig?.b1_court_id || (this.autoCourts[this.autoCourts.length - 1]?.kort_id || '');
        this.autoB1Courts = savedB1Courts.length ? savedB1Courts : (fallbackB1 ? [String(fallbackB1)] : []);
        this.autoDayDate = this.autoDayDate || this.autoTournamentDates().start || this.autoAvailableDays()[0] || '';
      } catch (error) {
        console.error('Failed to load auto-scheduler config:', error);
        this.showToast(error.message || this.ot('toast.configError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    autoTournamentDates() {
      const source = this.tournamentMeta || this.dashboard?.tournament || {};
      return { start: source.start_date || '', end: source.end_date || '' };
    },

    autoAvailableDays() {
      const days = new Set();
      (this.planningSchedule || []).forEach(entry => {
        if (entry.day_date) days.add(entry.day_date);
      });
      const { start, end } = this.autoTournamentDates();
      if (start) days.add(start);
      if (end && end !== start) days.add(end);
      return Array.from(days).sort();
    },

    autoScopeLabel() {
      if (this.autoPhaseScope === 'knockout') return this.ot('scope.knockout');
      if (this.autoPhaseScope === 'all') return this.ot('scope.all');
      return this.ot('scope.group');
    },

    autoPlanAllLabel() {
      if (this.autoPhaseScope === 'group') return this.ot('planning.planGroupPhase');
      if (this.autoPhaseScope === 'knockout') return this.ot('planning.planKnockoutPhase');
      return this.ot('planning.planTournament');
    },

    async autoGenerate(mode = 'day') {
      if (!this.token) return;
      const selectedDay = this.autoDayDate;
      if (this.autoEndTime && this.autoStartTime && this.autoEndTime <= this.autoStartTime) {
        this.showToast(this.ot('toast.endBeforeStart'), 'warning');
        return;
      }
      this.autoLoading = true;
      try {
        const b1Courts = (this.autoB1Courts || []).map(String).filter(Boolean);
        const body = {
          mode,
          start_time: this.autoStartTime,
          end_time: this.autoEndTime,
          b1_court_ids: b1Courts,
          b1_court_id: b1Courts[0] || '',
          day_date: selectedDay,
        };
        if (this.autoPhaseScope && this.autoPhaseScope !== 'all') {
          body.phases = [this.autoPhaseScope];
        }
        const response = await fetch(`/api/office/${this.slot}/autoschedule/generate`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.proposalFailed'));
        this.autoConfig = payload.config || this.autoConfig;
        this.autoCourts = Array.isArray(payload.courts) ? payload.courts : this.autoCourts;
        this.autoProposal = Array.isArray(payload.placements) ? payload.placements : [];
        this.autoDayDate = selectedDay || this.autoDayDate;
        const placed = this.autoProposal.filter(p => p.court_id && p.scheduled_time).length;
        if (!placed) {
          const hint = this.autoPhaseScope === 'knockout'
            ? this.ot('toast.hintKnockout')
            : this.ot('toast.hintGroups');
          this.showToast(this.ot('toast.noMatchesScope', { scope: this.autoScopeLabel(), hint }), 'warning');
        } else {
          const summary = payload.summary || {};
          const unplaced = Number(summary.unplaced || 0);
          const days = Array.isArray(summary.days) && summary.days.length ? summary.days.length : 1;
          this.showToast(
            mode === 'all'
              ? this.ot('toast.proposalSummaryAll', { placed, days, unplaced })
              : this.ot('toast.proposalSummaryDay', { placed, unplaced }),
            unplaced ? 'warning' : 'success',
          );
        }
      } catch (error) {
        console.error('Auto-generate failed:', error);
        this.showToast(error.message || this.ot('toast.generateError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    autoIsPlaceholder(entry) {
      const isPh = (name) => {
        const value = String(name || '').trim();
        if (!value) return true;
        const lowered = value.toLowerCase();
        if (lowered.startsWith('zwycięzca pf') || lowered.startsWith('przegrany pf')
          || lowered.startsWith('zwycięzca półfinał') || lowered.startsWith('winner sf') || lowered.startsWith('loser sf')) {
          return true;
        }
        if (/^\d+\.\s+/.test(value) || /^\d+[A-Za-z]$/.test(value)) return true;
        return false;
      };
      return isPh(entry?.player1_name) || isPh(entry?.player2_name);
    },

    async autoApply() {
      if (!this.token || !Array.isArray(this.autoProposal)) return;
      const placements = this.autoProposal
        .filter(p => p.schedule_id)
        .map(p => ({
          schedule_id: p.schedule_id,
          court_id: p.court_id,
          day_date: p.day_date,
          scheduled_time: p.scheduled_time,
        }));
      if (!placements.length) {
        this.showToast(this.ot('toast.noPlacements'), 'warning');
        return;
      }
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/apply`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({ placements }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.approveFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.autoProposal = null;
        this.showToast(this.ot('toast.scheduleApproved'), 'success');
      } catch (error) {
        console.error('Auto-apply failed:', error);
        this.showToast(error.message || this.ot('toast.approveError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    autoDiscardProposal() {
      this.autoProposal = null;
    },

    autoIsPreview() {
      return Array.isArray(this.autoProposal);
    },

    autoB1CourtIds() {
      const saved = Array.isArray(this.autoConfig?.b1_court_ids) ? this.autoConfig.b1_court_ids : [];
      if (saved.length) return saved.map(String);
      if (this.autoB1Courts?.length) return this.autoB1Courts.map(String);
      return this.autoConfig?.b1_court_id ? [String(this.autoConfig.b1_court_id)] : [];
    },

    autoIsB1Court(courtId) {
      return this.autoB1CourtIds().includes(String(courtId));
    },

    autoToggleB1Court(courtId, checked) {
      const value = String(courtId);
      const current = new Set((this.autoB1Courts || []).map(String));
      if (checked) current.add(value);
      else current.delete(value);
      this.autoB1Courts = Array.from(current);
      this.autoSaveB1Courts();
    },

    /** The day's hours are kept as soon as they change, so the board keeps its length after a refresh. */
    async autoSaveDayHours() {
      if (!this.token) return;
      const start = this.autoNormalizeTime(this.autoStartTime);
      const end = this.autoNormalizeTime(this.autoEndTime);
      if (!start || !end) return;
      if (end <= start) {
        this.showToast(this.ot('toast.endBeforeStart'), 'warning');
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/config`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({ start_time: start, end_time: end }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.configFailed'));
        // a newer change typed while this was saving stays on the screen
        if (this.autoNormalizeTime(this.autoStartTime) === start && this.autoNormalizeTime(this.autoEndTime) === end) {
          this.autoConfig = payload.config || this.autoConfig;
          if (Array.isArray(payload.schedule)) {
            this.planningSchedule = this.keepInspectorEdits(payload.schedule);
          }
        }
      } catch (error) {
        console.error('Failed to save day hours:', error);
        this.showToast(error.message || this.ot('errors.configFailed'), 'error');
      }
    },

    async autoSaveB1Courts() {
      if (!this.token) return;
      const b1Courts = (this.autoB1Courts || []).map(String).filter(Boolean);
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/config`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            b1_court_ids: b1Courts,
            b1_court_id: b1Courts[0] || '',
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.configFailed'));
        this.autoConfig = payload.config || this.autoConfig;
        if (Array.isArray(payload.schedule)) {
          this.planningSchedule = this.keepInspectorEdits(payload.schedule);
        }
      } catch (error) {
        console.error('Failed to save B1 courts:', error);
        this.showToast(error.message || this.ot('toast.b1CourtsSaveError'), 'error');
      }
    },

    autoBandForCourt(courtId) {
      if (this.autoIsB1Court(courtId)) return 'B1';
      const map = this.autoConfig?.category_courts || {};
      return Object.keys(map).find(band => String(map[band]) === String(courtId)) || '';
    },

    autoCourtLabel(courtId) {
      const court = (this.autoCourts || []).find(c => String(c.kort_id) === String(courtId));
      const name = court
        ? this.ot('planning.courtPrefix', { name: court.name })
        : this.ot('planning.courtPrefix', { name: courtId });
      if (this.autoIsB1Court(courtId)) {
        return `${name} · B1${this.ot('planning.specialCourt')}`;
      }
      return name;
    },

    autoMatchBand(entry) {
      const label = String(entry?.category_name || entry?.group_name || '');
      const match = label.match(/B\s*([1-4])/i);
      return match ? `B${match[1]}` : '';
    },

    autoSlotMinutes(band, _courtId = '') {
      const slots = this.autoConfig?.slot_minutes || {};
      if (band && slots[band] != null) return Number(slots[band]);
      if (band === 'B1') return 75;
      return Number(slots.default || 60);
    },

    autoCategoryBand(cat) {
      const label = String(cat?.label || '');
      const fromLabel = label.match(/B\s*([1-4])/i);
      if (fromLabel) return `B${fromLabel[1]}`;
      const hints = Array.isArray(cat?.hint_bands) ? cat.hint_bands : [];
      for (const hint of hints) {
        const match = String(hint || '').match(/B\s*([1-4])/i);
        if (match) return `B${match[1]}`;
      }
      return '';
    },

    autoCategoryMinutes(cat) {
      const map = this.autoConfig?.category_slot_minutes || {};
      const id = String(cat?.id || '').trim();
      if (id && map[id] != null) return Number(map[id]);
      const label = String(cat?.label || '').trim();
      if (label && map[`label:${label}`] != null) return Number(map[`label:${label}`]);
      return this.autoSlotMinutes(this.autoCategoryBand(cat));
    },

    async autoSaveCategoryMinutes(cat, rawValue) {
      if (!this.token || !cat) return;
      const minutes = Math.max(15, Math.min(180, Number(rawValue) || 0));
      if (!minutes) return;
      const next = {};
      const id = String(cat.id || '').trim();
      const label = String(cat.label || '').trim();
      if (id) next[id] = minutes;
      if (label) next[`label:${label}`] = minutes;
      if (!Object.keys(next).length) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/config`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({ category_slot_minutes: next }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.configFailed'));
        this.autoConfig = payload.config || this.autoConfig;
        if (Array.isArray(payload.schedule)) {
          this.planningSchedule = this.keepInspectorEdits(payload.schedule);
        }
        this.showToast(this.ot('toast.categoryDurationSaved'), 'success');
      } catch (error) {
        console.error('Failed to save category match duration:', error);
        this.showToast(error.message || this.ot('errors.configFailed'), 'error');
      }
    },

    autoAddMinutes(timeStr, minutes) {
      const parts = String(timeStr || '09:30').split(':');
      let total = (Number(parts[0]) || 9) * 60 + (Number(parts[1]) || 30) + Number(minutes || 0);
      total = Math.max(0, Math.min(total, 23 * 60 + 59));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    },

    autoNormalizeTime(value) {
      const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
      if (!match) return '';
      return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
    },

    autoEntryAt(courtId, time) {
      const want = this.autoNormalizeTime(time);
      return this.autoBoardEntries(courtId).find(
        (entry) => this.autoNormalizeTime(entry.scheduled_time) === want,
      ) || null;
    },

    autoEntriesAt(courtId, time) {
      const entry = this.autoEntryAt(courtId, time);
      return entry ? [entry] : [];
    },

    officeTimetableStyle() {
      const count = Math.max(1, (this.autoCourts || []).length);
      const rows = this.autoGridTicks().length;
      return `grid-template-columns: 64px repeat(${count}, minmax(148px, 1fr)); grid-template-rows: auto repeat(${rows}, var(--kort-tick));`;
    },

    // ——— the board is drawn to scale: one row per 15 minutes ———
    autoTimeMinutes(value) {
      const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    },

    autoMinutesTime(total) {
      const clamped = Math.max(0, Math.min(Number(total) || 0, 24 * 60 - 15));
      return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
    },

    autoEntryMinutes(entry) {
      const map = this.autoConfig?.category_slot_minutes || {};
      const id = String(entry?.tournament_category_id || entry?.category_id || '').trim();
      if (id && map[id] != null) return Math.max(15, Number(map[id]) || 60);
      const label = String(entry?.category_name || '').trim();
      if (label && map[`label:${label}`] != null) return Math.max(15, Number(map[`label:${label}`]) || 60);
      if (label) {
        for (const [key, minutes] of Object.entries(map)) {
          const prefix = String(key).replace(/^label:/, '');
          if (prefix && (label === prefix || label.startsWith(`${prefix} —`))) {
            return Math.max(15, Number(minutes) || 60);
          }
        }
      }
      return Math.max(15, Number(this.autoSlotMinutes(this.autoMatchBand(entry))) || 60);
    },

    /** From the day's start hour to its end hour, stretched to fit any match placed outside it. */
    autoBoardWindow() {
      let start = this.autoTimeMinutes(this.autoStartTime) ?? 9 * 60 + 30;
      let end = this.autoTimeMinutes(this.autoEndTime) ?? 18 * 60;
      if (end <= start) end = start + 4 * 60;
      for (const court of this.autoCourts || []) {
        for (const entry of this.autoBoardEntries(court.kort_id)) {
          const from = this.autoTimeMinutes(entry.scheduled_time);
          if (from == null) continue;
          start = Math.min(start, from);
          end = Math.max(end, from + this.autoEntryMinutes(entry));
        }
      }
      return { start: Math.floor(start / 15) * 15, end: Math.min(24 * 60, Math.ceil(end / 15) * 15) };
    },

    autoGridTicks() {
      const { start, end } = this.autoBoardWindow();
      const ticks = [];
      for (let minutes = start; minutes < end; minutes += 15) {
        ticks.push({ time: this.autoMinutesTime(minutes), row: ticks.length + 2, label: minutes % 30 === 0, hour: minutes % 60 === 0 });
      }
      return ticks;
    },

    autoGridTimes() {
      return this.autoGridTicks().map((tick) => tick.time);
    },

    /** Every match of the day with its place on the grid: row from its start, rows as long as it lasts. */
    autoBoardBlocks() {
      const { start } = this.autoBoardWindow();
      const blocks = [];
      (this.autoCourts || []).forEach((court, index) => {
        for (const entry of this.autoBoardEntries(court.kort_id)) {
          const from = this.autoTimeMinutes(entry.scheduled_time);
          if (from == null) continue;
          const rowStart = Math.floor((from - start) / 15) + 2;
          const span = Math.max(1, Math.round(this.autoEntryMinutes(entry) / 15));
          blocks.push({
            entry,
            courtId: court.kort_id,
            time: this.autoNormalizeTime(entry.scheduled_time),
            style: `grid-column: ${index + 2}; grid-row: ${rowStart} / span ${span};`,
            // the day's matches arrive in a short cascade, earliest first
            delay: Math.min(420, Math.max(0, rowStart - 2) * 14 + index * 22),
            minutes: this.autoEntryMinutes(entry),
          });
        }
      });
      return blocks;
    },

    /** One drop cell per court per 15 minutes; cells under a match are marked occupied. */
    autoGridCells() {
      const ticks = this.autoGridTicks();
      const cells = [];
      (this.autoCourts || []).forEach((court, index) => {
        const spans = this.autoBoardEntries(court.kort_id)
          .map((entry) => {
            const from = this.autoTimeMinutes(entry.scheduled_time);
            return from == null ? null : [Math.floor(from / 15) * 15, from + this.autoEntryMinutes(entry)];
          })
          .filter(Boolean);
        for (const tick of ticks) {
          const at = this.autoTimeMinutes(tick.time);
          cells.push({
            key: `${court.kort_id}|${tick.time}`,
            courtId: court.kort_id,
            time: tick.time,
            style: `grid-column: ${index + 2}; grid-row: ${tick.row};`,
            hour: tick.hour,
            half: tick.label && !tick.hour,
            occupied: spans.some(([from, to]) => at >= from && at < to),
          });
        }
      });
      return cells;
    },

    /** The board slides in from the side of the day it came from. */
    animateBoardDay(day, el) {
      const days = this.planningTournamentDays?.() || [];
      const previous = this.planningBoardShownDay;
      this.planningBoardShownDay = day;
      if (!el || !previous || previous === day) return;
      const direction = days.indexOf(day) < days.indexOf(previous) ? 'is-day-prev' : 'is-day-next';
      el.classList.remove('is-day-next', 'is-day-prev');
      void el.offsetWidth;
      el.classList.add(direction);
    },

    autoCellOccupied(courtId, time) {
      const at = this.autoTimeMinutes(time);
      return this.autoBoardEntries(courtId).some((entry) => {
        const from = this.autoTimeMinutes(entry.scheduled_time);
        return from != null && at >= Math.floor(from / 15) * 15 && at < from + this.autoEntryMinutes(entry);
      });
    },

    planningSelectedEntry() {
      const id = this.planningOpenCardId;
      if (id == null || id === '') return null;
      const pool = this.autoIsPreview() ? this.autoProposal : this.planningSchedule;
      return (pool || []).find((entry) => String(this.autoEntryId(entry)) === String(id)) || null;
    },

    planningInspectorEntries() {
      const entry = this.planningSelectedEntry();
      if (entry) return [entry];
      // while it slides out, the inspector still shows the match that was just closed
      const leaving = (this.autoIsPreview() ? this.autoProposal : this.planningSchedule || [])
        .find((item) => this.planningInspectorLeavingId != null && String(this.autoEntryId(item)) === String(this.planningInspectorLeavingId));
      return leaving ? [leaving] : [];
    },

    trackPlanningInspector(openId, el = null) {
      const previous = this.planningInspectorShownId;
      this.planningInspectorShownId = openId;
      if (openId != null && openId !== '') {
        this.planningInspectorLeavingId = null;
        if (el && String(previous) !== String(openId)) {
          el.classList.remove('is-opening');
          void el.offsetWidth;
          el.classList.add('is-opening');
        }
        return;
      }
      if (previous == null || previous === '') return;
      this.planningInspectorLeavingId = previous;
      window.clearTimeout(this.planningInspectorLeaveTimer);
      this.planningInspectorLeaveTimer = window.setTimeout(() => {
        if (this.planningOpenCardId == null || this.planningOpenCardId === '') this.planningInspectorLeavingId = null;
      }, 200);
    },

    officeScheduleStatusClass(status) {
      const value = String(status || '').toLowerCase();
      if (value === 'published' || value === 'planned' || value.includes('publik')) return 'is-published';
      if (value === 'in_progress' || value === 'live' || value.includes('trw')) return 'is-live';
      if (value === 'completed' || value.includes('zakon') || value.includes('zakoń')) return 'is-done';
      return 'is-draft';
    },

    officePlanningHasMatches() {
      return (this.planningSchedule || []).length > 0;
    },

    async onAutoDropAt(courtId, time) {
      await this.onAutoDrop(courtId, { scheduled_time: time, court_id: courtId });
    },

    autoBoardEntries(courtId) {
      const day = this.autoDayDate;
      const sortByTime = (a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''));
      if (this.autoIsPreview()) {
        return this.autoProposal
          .filter(p => String(p.court_id) === String(courtId) && p.day_date === day && p.scheduled_time)
          .sort(sortByTime);
      }
      return (this.planningSchedule || [])
        .filter(e => String(e.court_id) === String(courtId) && e.day_date === day && e.scheduled_time)
        .sort(sortByTime);
    },

    autoIsUnplacedEntry(entry) {
      if (!entry) return false;
      if (entry.match_id) return false;
      if (String(entry.status || '').toLowerCase() === 'completed') return false;
      return !entry.court_id || !entry.scheduled_time;
    },

    autoUnplacedAll() {
      if (this.autoIsPreview()) {
        return this.autoProposal.filter(entry => this.autoIsUnplacedEntry(entry));
      }
      return (this.planningSchedule || []).filter(entry => this.autoIsUnplacedEntry(entry));
    },

    autoUnplacedCount() {
      return this.autoUnplacedAll().length;
    },

    autoUnplacedPhaseKey(entry) {
      const source = String(entry?.source_type || '').toLowerCase();
      const phase = String(entry?.phase || '').toLowerCase();
      if (source === 'knockout') return 'knockout';
      if (source === 'group' || phase.includes('grup')) return 'group';
      if (
        phase.includes('rewan')
        || phase.includes('dogryw')
        || phase.includes('replay')
        || phase.includes('rematch')
        || phase.includes('revanch')
      ) {
        return 'replay';
      }
      return 'knockout';
    },

    autoUnplacedPhaseOrder() {
      return ['group', 'replay', 'knockout'];
    },

    autoUnplacedPhaseLabel(phaseKey) {
      const labels = {
        group: this.ot('planning.unassignedPhaseGroup'),
        replay: this.ot('planning.unassignedPhaseReplay'),
        knockout: this.ot('planning.unassignedPhaseKnockout'),
      };
      return labels[phaseKey] || labels.knockout;
    },

    autoUnplacedSections() {
      const sections = this.autoUnplacedPhaseOrder().map(key => ({
        key,
        label: this.autoUnplacedPhaseLabel(key),
        entries: [],
      }));
      const byKey = Object.fromEntries(sections.map(section => [section.key, section]));
      const sortEntries = (left, right) => {
        const categoryCompare = String(left?.category_name || '').localeCompare(String(right?.category_name || ''));
        if (categoryCompare !== 0) return categoryCompare;
        const phaseCompare = String(left?.phase || '').localeCompare(String(right?.phase || ''));
        if (phaseCompare !== 0) return phaseCompare;
        return String(left?.player1_name || '').localeCompare(String(right?.player1_name || ''));
      };
      for (const entry of this.autoUnplacedAll()) {
        const key = this.autoUnplacedPhaseKey(entry);
        (byKey[key] || byKey.knockout).entries.push(entry);
      }
      return sections
        .map(section => ({ ...section, entries: section.entries.sort(sortEntries) }))
        .filter(section => section.entries.length > 0);
    },

    autoUnplaced() {
      return this.autoUnplacedAll();
    },

    autoUnplacedCategoryTabs() {
      const entries = this.autoUnplacedAll();
      const counts = new Map();
      for (const entry of entries) {
        const key = String(entry?.category_name || '');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const categories = [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'pl', { numeric: true }))
        .map(([key, count]) => ({ key, label: this.officeDisplayLabel(key) || '—', count }));
      return [{ key: '', label: this.ot('planning.drawerAll'), count: entries.length }, ...categories];
    },

    planningDrawerCategoryKey() {
      const selected = String(this.planningDrawerCategory || '');
      if (!selected) return '';
      return this.autoUnplacedCategoryTabs().some(tab => tab.key === selected) ? selected : '';
    },

    autoUnplacedForDrawer() {
      const key = this.planningDrawerCategoryKey();
      return this.autoUnplacedSections()
        .flatMap(section => section.entries)
        .filter(entry => !key || String(entry?.category_name || '') === key);
    },

    planningDraggedEntry() {
      if (!this.autoDragId) return null;
      const pool = this.autoIsPreview() ? this.autoProposal : this.planningSchedule;
      return (pool || []).find(entry => String(this.autoEntryId(entry)) === String(this.autoDragId)) || null;
    },

    async onDrawerDrop() {
      this.planningDropCell = null;
      if (this.autoIsUnplacedEntry(this.planningDraggedEntry())) {
        this.autoDragId = null;
        return;
      }
      await this.onAutoDropToUnassigned();
    },

    officeDayClearableEntries(day = this.autoDayDate) {
      return (this.planningSchedule || []).filter(entry => {
        if (String(entry?.day_date || '') !== String(day || '')) return false;
        if (!entry.court_id && !entry.scheduled_time) return false;
        if (entry.match_id) return false;
        const status = String(entry.status || '').toLowerCase();
        return !['completed', 'in_progress', 'live'].includes(status);
      });
    },

    async clearPlanningDay() {
      const day = this.autoDayDate;
      if (!day || this.autoIsPreview()) return;
      const count = this.officeDayClearableEntries(day).length;
      if (!count) {
        this.showToast(this.ot('toast.nothingToClear'), 'info');
        return;
      }
      const date = this.formatOfficeScheduleDay({ day_date: day });
      if (!confirm(this.ot('confirm.clearDay', { count, date }))) return;
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/clear-day`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({ day_date: day }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.clearDayFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.planningDrawerCollapsed = false;
        const cleared = Number(payload.cleared || 0);
        const kept = Number(payload.kept || 0);
        this.showToast(
          kept ? this.ot('toast.dayClearedKept', { count: cleared, kept }) : this.ot('toast.dayCleared', { count: cleared }),
          'success',
        );
      } catch (error) {
        console.error('Failed to clear schedule day:', error);
        this.showToast(error.message || this.ot('toast.clearDayError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    autoEntryId(entry) {
      return entry?.schedule_id || entry?.id || null;
    },

    autoNextTimeForCourt(courtId) {
      const entries = this.autoBoardEntries(courtId);
      if (!entries.length) return this.autoStartTime;
      const last = entries[entries.length - 1];
      return this.autoAddMinutes(last.scheduled_time, this.autoEntryMinutes(last));
    },

    onAutoDragStart(entry, event) {
      this.autoDragId = this.autoEntryId(entry);
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(this.autoDragId)); } catch (e) { /* noop */ }
      }
    },

    autoRecomputeProposalCourt(proposal, courtId, startTime = null) {
      const day = this.autoDayDate;
      const entries = proposal
        .filter(p => String(p.court_id) === String(courtId) && p.day_date === day && p.scheduled_time)
        .sort((a, b) => String(a.scheduled_time).localeCompare(String(b.scheduled_time)));
      if (!entries.length) return proposal;
      let cursor = startTime || entries[0].scheduled_time || this.autoStartTime;
      for (const entry of entries) {
        const index = proposal.findIndex(p => String(this.autoEntryId(p)) === String(this.autoEntryId(entry)));
        if (index < 0) continue;
        proposal[index] = { ...proposal[index], scheduled_time: cursor, court_id: String(courtId), day_date: day };
        cursor = this.autoAddMinutes(cursor, this.autoEntryMinutes(proposal[index]));
      }
      return proposal;
    },

    autoRecomputeProposalFromPivot(proposal, courtId, pivotScheduleId, pivotTime) {
      const day = this.autoDayDate;
      const entries = proposal
        .filter(p => String(p.court_id) === String(courtId) && p.day_date === day && p.scheduled_time)
        .sort((a, b) => String(a.scheduled_time).localeCompare(String(b.scheduled_time)));
      const pivotIndex = entries.findIndex(e => String(this.autoEntryId(e)) === String(pivotScheduleId));
      if (pivotIndex < 0) return proposal;
      let cursor = pivotTime;
      for (let index = pivotIndex; index < entries.length; index += 1) {
        const entry = entries[index];
        const proposalIndex = proposal.findIndex(p => String(this.autoEntryId(p)) === String(this.autoEntryId(entry)));
        if (proposalIndex < 0) continue;
        proposal[proposalIndex] = {
          ...proposal[proposalIndex],
          scheduled_time: cursor,
          court_id: String(courtId),
          day_date: day,
        };
        cursor = this.autoAddMinutes(cursor, this.autoEntryMinutes(proposal[proposalIndex]));
      }
      return proposal;
    },

    autoMoveInProposal(scheduleId, courtId, dropTime) {
      const day = this.autoDayDate;
      const proposal = this.autoProposal.map(entry => ({ ...entry }));
      const index = proposal.findIndex(entry => String(this.autoEntryId(entry)) === String(scheduleId));
      if (index < 0) return;
      const moved = proposal[index];
      const targetCourt = String(courtId);
      proposal[index] = {
        ...moved,
        court_id: targetCourt,
        day_date: day,
        scheduled_time: dropTime,
      };
      this.autoProposal = proposal;
    },

    async onAutoDrop(courtId, targetEntry) {
      const scheduleId = this.autoDragId;
      this.autoDragId = null;
      this.planningDropCell = null;
      if (!scheduleId) return;
      const dropTime = targetEntry && targetEntry.scheduled_time
        ? targetEntry.scheduled_time
        : this.autoNextTimeForCourt(courtId);
      if (this.autoIsPreview()) {
        this.autoMoveInProposal(scheduleId, courtId, dropTime);
        return;
      }
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/move`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            schedule_id: scheduleId,
            court_id: courtId,
            scheduled_time: dropTime,
            day_date: this.autoDayDate,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.moveFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      } catch (error) {
        console.error('Auto-move failed:', error);
        this.showToast(error.message || this.ot('toast.moveError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    async onAutoDropToUnassigned() {
      const scheduleId = this.autoDragId;
      this.autoDragId = null;
      if (!scheduleId) return;
      if (this.autoIsPreview()) {
        const proposal = this.autoProposal.map(entry => ({ ...entry }));
        const index = proposal.findIndex(entry => String(this.autoEntryId(entry)) === String(scheduleId));
        if (index < 0) return;
        proposal[index] = { ...proposal[index], court_id: '', scheduled_time: '' };
        this.autoProposal = proposal;
        return;
      }
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/autoschedule/unassign`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            schedule_id: scheduleId,
            day_date: this.autoDayDate,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.unassignFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      } catch (error) {
        console.error('Auto-unassign failed:', error);
        this.showToast(error.message || this.ot('toast.unassignError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },

    async deleteAllUnassigned() {
      const count = this.autoUnplacedCount();
      if (!count) return;
      if (!confirm(this.ot('confirm.deleteAllUnassigned', { count }))) return;
      this.autoLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/unassigned`, {
          method: 'DELETE',
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.deleteUnassignedFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.unassignedDeleted', { count: payload.deleted || count }), 'success');
      } catch (error) {
        console.error('Failed to delete unassigned entries:', error);
        this.showToast(error.message || this.ot('toast.deleteUnassignedError'), 'error');
      } finally {
        this.autoLoading = false;
      }
    },
  };
}
