import { defaultOfficeScheduleForm } from './forms.js';

export function createOfficeScheduleView() {
  return {
    async openPlanningTab() {
      await this.openOfficeView('planning');
    },

    officeViewUsesPlanningData(view = this.activeTab) {
      // the notes for matches need the days, courts and categories
      return view === 'planning' || view === 'groups' || view === 'quickinfo';
    },

    async openOfficeView(view, { auto = false } = {}) {
      if (!auto) this.officeUserNavigated = true;
      this.activeTab = view;
      if (view === 'draws') {
        await this.loadDrawFormats();
        return;
      }
      if (view === 'quickinfo') this.refreshScheduleNotesPreview?.();
      if (!this.officeViewUsesPlanningData(view)) return;
      if (!this.planningPlayers.length) {
        await this.loadOfficePlanningData();
      }
      if (!this.autoConfig) {
        await this.loadAutoConfig();
      }
    },

    officeViewItems() {
      return [
        { id: 'planning', label: this.ot('planning.step2Title'), icon: 'M3 5h18v15H3zM3 10h18M9 5v15M15 5v15' },
        { id: 'groups', label: this.ot('planning.step1Title'), icon: 'M4 4h6v16H4zM14 4h6v16h-6z' },
        { id: 'draws', label: this.ot('path.stepDraws'), icon: 'M4 5h5v5H4zM4 14h5v5H4zM9 7.5h5v9H9M14 12h6' },
        { id: 'progress', label: this.ot('path.stepGroupPhase'), icon: 'M4 19V9M10 19V5M16 19v-7M21 19H3' },
        { id: 'knockout', label: this.ot('path.stepKnockout'), icon: 'M4 6h6v12H4zM14 6h6v5h-6zM14 13h6v5h-6z' },
        { id: 'history', label: this.ot('tabs.history'), icon: 'M4 7h16M4 12h16M4 17h10' },
        { id: 'quickinfo', label: this.ot('quickInfo.subtitle'), icon: 'M4 10v4l11 5V5L4 10zM15 8.5c1.8.5 3 1.8 3 3.5s-1.2 3-3 3.5' },
      ];
    },

    officeViewTitle() {
      const item = this.officeViewItems().find(entry => entry.id === this.activeTab);
      return item?.label || this.ot('hero.defaultTitle');
    },

    officeLiveScheduleCount() {
      return (this.officeSchedule || []).filter(entry => this.officeScheduleStatusClass(entry?.status) === 'is-live').length;
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
      // a proposal for the whole tournament may use days nothing is planned on yet
      (Array.isArray(this.autoProposal) ? this.autoProposal : []).forEach(entry => {
        if (entry?.day_date && entry?.scheduled_time) days.add(String(entry.day_date));
      });
      if (days.size) return Array.from(days).sort();
      const available = this.autoAvailableDays();
      return available.length ? available : [];
    },

    /** A B1 match always lasts the B1 slot, on any court: say so on the other courts. */
    autoSlotMinutesLabel(courtId) {
      const minutes = this.autoSlotMinutes(this.autoBandForCourt(courtId), courtId);
      const b1 = this.autoSlotMinutes('B1');
      if (this.autoIsB1Court(courtId) || Number(b1) === Number(minutes)) return this.ot('planning.slotMinutes', { minutes });
      return this.ot('planning.slotMinutesB1', { minutes, b1 });
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

    planningDayProposalCount(day) {
      return (Array.isArray(this.autoProposal) ? this.autoProposal : [])
        .filter((entry) => entry?.day_date === day && entry?.court_id && entry?.scheduled_time).length;
    },

    /** Switching the day only changes what the board shows; a proposal stays until approved or dropped. */
    selectPlanningDay(day) {
      this.autoDayDate = day;
      this.planningOpenCardId = null;
    },

    togglePlanningCard(entry) {
      const id = this.autoEntryId(entry);
      this.planningOpenCardId = this.planningOpenCardId === id ? null : id;
      this.planningInspectorDirtyId = null;
    },

    /** Unsaved inspector edits survive a reload that replaces the schedule rows. */
    keepInspectorEdits(nextSchedule) {
      const dirtyId = this.planningInspectorDirtyId;
      if (!dirtyId || !Array.isArray(nextSchedule)) return nextSchedule;
      const edited = (this.planningSchedule || []).find((row) => this.autoEntryId(row) === dirtyId);
      const fresh = nextSchedule.find((row) => this.autoEntryId(row) === dirtyId);
      if (edited && fresh) {
        for (const field of ['day_date', 'scheduled_time', 'court_id', 'status', 'notes_public', 'notes_internal']) {
          fresh[field] = edited[field];
        }
      }
      return nextSchedule;
    },

    planningDraftEntries() {
      return (this.planningSchedule || []).filter((entry) => String(entry?.status || '') === 'draft');
    },

    planningPublishDays() {
      return [...new Set(
        this.planningDraftEntries()
          .map((entry) => String(entry?.day_date || '').trim())
          .filter(Boolean),
      )].sort();
    },

    planningPublishDayCount(day) {
      return this.planningDraftEntries().filter((entry) => String(entry?.day_date || '') === String(day || '')).length;
    },

    openPublishModal() {
      if (!this.token) return;
      if (!this.planningDraftEntries().length) {
        this.showToast(this.ot('toast.noDraftEntries'), 'info');
        return;
      }
      this.publishScope = '';
      this.publishModalOpen = true;
    },

    closePublishModal() {
      this.publishModalOpen = false;
    },

    async publishAllSchedule() {
      this.openPublishModal();
    },

    async confirmPublishSchedule() {
      if (!this.token || this.planningPublishing) return;
      const dayDate = String(this.publishScope || '').trim();
      this.planningPublishing = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/publish`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify(dayDate ? { day_date: dayDate } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.publishFailed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = this.keepInspectorEdits(payload.schedule);
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        const count = Number(payload.published || 0);
        this.publishModalOpen = false;
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
        this.planningInspectorDirtyId = null;
        if (payload.schedule) this.planningSchedule = payload.schedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('toast.scheduleSaved'), 'success');
        this.flushPendingOfficeRefresh();
      } catch (error) {
        console.error('Failed to save schedule entry:', error);
        this.showToast(error.message || this.ot('toast.scheduleSaveError'), 'error');
      }
    },
  };
}
