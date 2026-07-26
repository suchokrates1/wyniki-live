import { defaultOfficeScheduleForm } from './forms.js';

export function createOfficeScheduleView() {
  return {
    async openPlanningTab() {
      this.activeTab = 'planning';
      if (!this.planningPlayers.length) {
        await this.loadOfficePlanningData();
      }
      if (!this.autoConfig) {
        await this.loadAutoConfig();
      }
    },

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

    async autoGenerate() {
      if (!this.token) return;
      const selectedDay = this.autoDayDate;
      this.autoLoading = true;
      try {
        const b1Courts = (this.autoB1Courts || []).map(String).filter(Boolean);
        const body = {
          start_time: this.autoStartTime,
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
          const placeholders = this.autoProposal.filter(p => p.scheduled_time && this.autoIsPlaceholder(p)).length;
          const extra = placeholders
            ? this.ot('toast.withPlaceholders', { count: placeholders })
            : '';
          this.showToast(this.ot('toast.proposalReady', {
            scope: this.autoScopeLabel(),
            placed,
            extra,
          }), 'success');
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

    autoSlotMinutes(band, courtId = '') {
      if (courtId && this.autoIsB1Court(courtId)) return 75;
      const slots = this.autoConfig?.slot_minutes || {};
      if (band && slots[band] != null) return Number(slots[band]);
      if (band === 'B1') return 75;
      return Number(slots.default || 60);
    },

    autoAddMinutes(timeStr, minutes) {
      const parts = String(timeStr || '09:30').split(':');
      let total = (Number(parts[0]) || 9) * 60 + (Number(parts[1]) || 30) + Number(minutes || 0);
      total = Math.max(0, Math.min(total, 23 * 60 + 59));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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

    autoEntryId(entry) {
      return entry?.schedule_id || entry?.id || null;
    },

    autoNextTimeForCourt(courtId) {
      const entries = this.autoBoardEntries(courtId);
      if (!entries.length) return this.autoStartTime;
      const last = entries[entries.length - 1];
      return this.autoAddMinutes(last.scheduled_time, this.autoSlotMinutes(this.autoBandForCourt(courtId)));
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
        const band = this.autoMatchBand(entry);
        proposal[index] = { ...proposal[index], scheduled_time: cursor, court_id: String(courtId), day_date: day };
        cursor = this.autoAddMinutes(cursor, this.autoSlotMinutes(band, courtId));
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
        const band = this.autoMatchBand(entry);
        proposal[proposalIndex] = {
          ...proposal[proposalIndex],
          scheduled_time: cursor,
          court_id: String(courtId),
          day_date: day,
        };
        cursor = this.autoAddMinutes(cursor, this.autoSlotMinutes(band, courtId));
      }
      return proposal;
    },

    autoMoveInProposal(scheduleId, courtId, dropTime) {
      const day = this.autoDayDate;
      const proposal = this.autoProposal.map(entry => ({ ...entry }));
      const index = proposal.findIndex(entry => String(this.autoEntryId(entry)) === String(scheduleId));
      if (index < 0) return;
      const moved = proposal[index];
      const sourceCourt = String(moved.court_id || '');
      const targetCourt = String(courtId);
      proposal[index] = {
        ...moved,
        court_id: targetCourt,
        day_date: day,
        scheduled_time: dropTime,
      };
      this.autoRecomputeProposalFromPivot(proposal, targetCourt, scheduleId, dropTime);
      if (sourceCourt && sourceCourt !== targetCourt) {
        this.autoRecomputeProposalCourt(proposal, sourceCourt);
      }
      this.autoProposal = proposal;
    },

    async onAutoDrop(courtId, targetEntry) {
      const scheduleId = this.autoDragId;
      this.autoDragId = null;
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
        const sourceCourt = String(proposal[index].court_id || '');
        proposal[index] = { ...proposal[index], court_id: '', scheduled_time: '' };
        if (sourceCourt) this.autoRecomputeProposalCourt(proposal, sourceCourt);
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

    addDaysToIsoDate(isoDate, offsetDays = 1) {
      const parts = String(isoDate || '').split('-').map(Number);
      if (parts.length !== 3 || parts.some(Number.isNaN)) return String(isoDate || '');
      const date = new Date(parts[0], parts[1] - 1, parts[2] + Number(offsetDays || 0));
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    planningTournamentDays() {
      const days = new Set();
      const { start, end } = this.autoTournamentDates();
      if (start) {
        let cursor = start;
        const last = end || start;
        let guard = 0;
        while (cursor <= last && guard < 14) {
          days.add(cursor);
          cursor = this.addDaysToIsoDate(cursor, 1);
          guard += 1;
        }
      }
      (this.planningSchedule || []).forEach(entry => {
        if (entry?.day_date) days.add(String(entry.day_date));
      });
      if (days.size) return Array.from(days).sort();
      const available = this.autoAvailableDays();
      return available.length ? available : [];
    },

    autoSlotMinutesLabel(courtId) {
      return this.ot('planning.slotMinutes', { minutes: this.autoSlotMinutes(this.autoBandForCourt(courtId), courtId) });
    },

    planningUnassignedTitle() {
      return this.ot('planning.unassignedTitle', { count: this.autoUnplacedCount() });
    },

    planningUnassignedDayLabel(entry) {
      const day = String(entry?.day_date || '').trim();
      if (!day) return this.ot('planning.unassignedNoDay');
      return this.ot('planning.unassignedDay', { date: this.formatOfficeScheduleDay(entry) });
    },

    planningDayLabel(day, index) {
      const value = String(day || '');
      const parts = value.split('-');
      const short = parts.length === 3 ? `${parts[2]}.${parts[1]}` : value;
      return this.ot('planning.dayLabel', { number: index + 1, date: short });
    },

    selectPlanningDay(day) {
      this.autoDayDate = day;
      this.planningOpenCardId = null;
      if (this.autoIsPreview()) this.autoDiscardProposal();
    },

    togglePlanningCard(entry) {
      const id = this.autoEntryId(entry);
      this.planningOpenCardId = this.planningOpenCardId === id ? null : id;
    },

    async publishAllSchedule() {
      if (!this.token) return;
      if (!confirm(this.ot('confirm.publishAll'))) return;
      this.planningPublishing = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/publish`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({}),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.publishFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        const count = Number(payload.published || 0);
        this.showToast(
          count ? this.ot('toast.publishedCount', { count }) : this.ot('toast.noDraftEntries'),
          count ? 'success' : 'info',
        );
      } catch (error) {
        console.error('Failed to publish schedule:', error);
        this.showToast(error.message || this.ot('toast.publishError'), 'error');
      } finally {
        this.planningPublishing = false;
      }
    },

    async generatePlanningSchedule() {
      await this.generateOfficeSchedule();
      await this.loadOfficePlanningData();
    },

    planningBracketGroups() {
      return (this.planningGroups || []).filter(group => group?.id);
    },

    isPlanningRematchGroupSelected(groupId) {
      return (this.planningRematchGroupIds || []).map(String).includes(String(groupId));
    },

    togglePlanningRematchGroup(groupId, checked) {
      const key = String(groupId);
      const current = new Set((this.planningRematchGroupIds || []).map(String));
      if (checked) current.add(key);
      else current.delete(key);
      this.planningRematchGroupIds = [...current];
    },

    async generatePlanningRematch() {
      const groupIds = (this.planningRematchGroupIds || [])
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value > 0);
      if (!groupIds.length) {
        this.showToast(this.ot('toast.pickRematchGroups'), 'warning');
        return;
      }
      const { start, end } = this.autoTournamentDates();
      const dayDate = this.autoDayDate || (end && end !== start ? end : start) || '';
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/generate-rematch`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            group_ids: groupIds,
            ...(dayDate ? { day_date: dayDate } : {}),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.rematchGenerateFailed'));
        }
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.rematchGenerated'), 'success');
        await this.loadOfficePlanningData();
      } catch (error) {
        console.error('Failed to generate rematch schedule:', error);
        this.showToast(error.message || this.ot('toast.rematchError'), 'error');
      }
    },

    async addPlanningScheduleEntry() {
      if (!this.planningNewSchedule.player1_name || !this.planningNewSchedule.player2_name || this.planningNewSchedule.player1_name === this.planningNewSchedule.player2_name) {
        this.showToast(this.ot('toast.pickTwoPlayers'), 'warning');
        return;
      }
      const selectedCourt = this.planningCourts.find(court => String(court.kort_id || '') === String(this.planningNewSchedule.court_id || ''));
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            ...this.planningNewSchedule,
            court_label: selectedCourt?.name || '',
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.scheduleAddFailed'));
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        const dayDate = this.planningNewSchedule.day_date;
        const courtId = this.planningNewSchedule.court_id;
        const categoryName = this.planningNewSchedule.category_name;
        this.planningNewSchedule = defaultOfficeScheduleForm();
        this.planningNewSchedule.day_date = dayDate;
        this.planningNewSchedule.court_id = courtId;
        this.planningNewSchedule.category_name = categoryName;
        this.showToast(this.ot('toast.scheduleAdded'), 'success');
      } catch (error) {
        console.error('Failed to add office schedule entry:', error);
        this.showToast(error.message || this.ot('toast.scheduleAddError'), 'error');
      }
    },

    async deletePlanningScheduleEntry(entry, options = {}) {
      const scheduleId = entry?.schedule_id || entry?.id;
      if (!scheduleId) return;
      if (!options.skipConfirm && !confirm(this.ot('confirm.deleteEntry'))) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/${scheduleId}`, {
          method: 'DELETE',
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.scheduleDeleteFailed'));
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.scheduleDeleted'), 'success');
      } catch (error) {
        console.error('Failed to delete office schedule entry:', error);
        this.showToast(error.message || this.ot('toast.scheduleDeleteError'), 'error');
      }
    },

    scheduleStatusOptions() {
      return [
        { value: 'draft', label: this.ot('status.draft') },
        { value: 'planned', label: this.ot('status.planned') },
        { value: 'in_progress', label: this.ot('status.inProgress') },
        { value: 'completed', label: this.ot('status.completed') },
      ];
    },

    officeScheduleStatusLabel(status) {
      const found = this.scheduleStatusOptions().find(option => option.value === status);
      return found?.label || status || this.ot('status.draft');
    },

    officeScheduleCourtLabel(entry) {
      return entry?.court_label || entry?.court_id || this.ot('dates.courtTbd');
    },

    officeScheduleHasResult(entry) {
      return !!(entry?.has_result || entry?.score_text || (entry?.status === 'completed' && entry?.winner_name));
    },

    officeScheduleResultLabel(entry) {
      if (!entry) return '';
      if (entry.result_note) return entry.result_note;
      if (entry.score_text) return entry.score_text;
      if (entry.winner_name) return this.ot('status.completed');
      return '';
    },

    formatOfficeScheduleDay(entry) {
      const rawValue = entry?.day_date || '';
      if (!rawValue) return this.ot('dates.noDate');
      const parsedDate = new Date(`${rawValue}T12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) return rawValue;
      return new Intl.DateTimeFormat(this.officeLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parsedDate);
    },

    async generateOfficeSchedule() {
      const { start, end } = this.autoTournamentDates();
      const dayDate = this.autoDayDate || (end && end !== start ? end : start) || '';
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/generate`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify(dayDate ? { day_date: dayDate } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.scheduleGenerateFailed'));
        }
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.scheduleRefreshed'), 'success');
      } catch (error) {
        console.error('Failed to generate schedule:', error);
        this.showToast(error.message || this.ot('toast.scheduleError'), 'error');
      }
    },

    async saveOfficeScheduleEntry(entry) {
      if (!entry?.id) return;
      const selectedCourt = [...this.officeCourts, ...this.planningCourts].find(court => String(court.kort_id || '') === String(entry.court_id || ''));
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/${entry.id}`, {
          method: 'PATCH',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            day_date: entry.day_date,
            scheduled_time: entry.scheduled_time,
            court_id: entry.court_id,
            court_label: selectedCourt?.name || entry.court_label || '',
            status: entry.status,
            notes_public: entry.notes_public,
            notes_internal: entry.notes_internal,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.scheduleEntryFailed'));
        }
        if (payload.schedule) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.scheduleSaved'), 'success');
      } catch (error) {
        console.error('Failed to save schedule entry:', error);
        this.showToast(error.message || this.ot('toast.scheduleSaveError'), 'error');
      }
    },
  };
}
