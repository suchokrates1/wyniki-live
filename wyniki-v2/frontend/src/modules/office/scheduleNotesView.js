/**
 * "Uwagi do meczów": one public note for many matches at once (a day, courts, categories,
 * a phase), previewed before it is written. Single matches are still edited in the inspector.
 */
function defaultForm() {
  return { day_date: '', court_ids: [], categories: [], phase: 'all', only_unplayed: true, text: '', mode: 'replace' };
}

export function createOfficeScheduleNotesView() {
  return {
    scheduleNotesForm: defaultForm(),
    scheduleNotesPreview: null,
    scheduleNotesSeq: 0,
    scheduleNotesTimer: null,
    scheduleNotesSaving: false,
    scheduleNotesListOpen: false,

    /** Opened from the schedule: the day on the board is already chosen. */
    async openScheduleNotes({ day = '' } = {}) {
      this.scheduleNotesForm = { ...this.scheduleNotesForm, day_date: day || this.scheduleNotesForm.day_date };
      await this.openOfficeView('quickinfo');
      this.$nextTick?.(() => document.getElementById('office-schedule-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      this.refreshScheduleNotesPreview();
    },

    scheduleNotesCourts() {
      const courts = (this.planningCourts && this.planningCourts.length ? this.planningCourts : this.autoCourts) || [];
      return courts.map((court) => ({ id: String(court.kort_id), label: this.ot('planning.courtPrefix', { name: court.name || court.kort_id }) }));
    },

    scheduleNotesCategories() {
      return (this.tournamentCategories || [])
        .filter((category) => category.is_active !== 0)
        .map((category) => ({ value: category.label, label: this.officeDisplayLabel(category.label) }));
    },

    toggleScheduleNotesValue(field, value) {
      const values = new Set(this.scheduleNotesForm[field] || []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      this.updateScheduleNotesForm({ [field]: [...values] });
    },

    updateScheduleNotesForm(patch) {
      this.scheduleNotesForm = { ...this.scheduleNotesForm, ...patch };
      window.clearTimeout(this.scheduleNotesTimer);
      this.scheduleNotesTimer = window.setTimeout(() => this.refreshScheduleNotesPreview(), 250);
    },

    scheduleNotesBody() {
      const form = this.scheduleNotesForm;
      return {
        filters: {
          day_date: form.day_date,
          court_ids: form.court_ids,
          categories: form.categories,
          phase: form.phase,
          only_unplayed: form.only_unplayed,
        },
        text: form.mode === 'clear' ? '' : form.text,
        // a preview needs some text; the count of matches does not depend on it
        mode: form.mode,
      };
    },

    async refreshScheduleNotesPreview() {
      if (!this.token) return;
      const seq = ++this.scheduleNotesSeq;
      const body = this.scheduleNotesBody();
      if (body.mode !== 'clear' && !String(body.text || '').trim()) body.text = '·';
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/notes/preview`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('scheduleNotes.failed'));
        if (seq === this.scheduleNotesSeq) this.scheduleNotesPreview = payload;
      } catch (error) {
        console.error('Schedule notes preview failed:', error);
      }
    },

    scheduleNotesCanApply() {
      const form = this.scheduleNotesForm;
      if (this.scheduleNotesSaving || !this.scheduleNotesPreview?.count) return false;
      return form.mode === 'clear' || Boolean(String(form.text || '').trim());
    },

    scheduleNotesMatchLine(item) {
      const day = String(item.day_date || '').split('-').reverse().slice(0, 2).join('.');
      const where = [day, item.scheduled_time, item.court_name ? this.ot('planning.courtPrefix', { name: item.court_name }) : '']
        .filter(Boolean).join(' · ');
      const who = `${this.formatCompetitorName(item.player1_name || '—')} ${this.ot('versus')} ${this.formatCompetitorName(item.player2_name || '—')}`;
      return `${where ? `${where} — ` : ''}${this.officeDisplayLabel(item.category_name)} · ${who}`;
    },

    async applyScheduleNotes() {
      if (!this.scheduleNotesCanApply()) {
        if (this.scheduleNotesForm.mode !== 'clear' && !String(this.scheduleNotesForm.text || '').trim()) {
          this.showToast(this.ot('scheduleNotes.emptyText'), 'warning');
        }
        return;
      }
      this.scheduleNotesSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/schedule/notes`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify(this.scheduleNotesBody()),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('scheduleNotes.failed'));
        if (Array.isArray(payload.schedule)) this.planningSchedule = this.keepInspectorEdits(payload.schedule);
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.showToast(this.ot('scheduleNotes.applied', { count: payload.updated || 0 }), 'success');
        this.refreshScheduleNotesPreview();
      } catch (error) {
        console.error('Applying schedule notes failed:', error);
        this.showToast(error.message || this.ot('scheduleNotes.failed'), 'error');
      } finally {
        this.scheduleNotesSaving = false;
      }
    },
  };
}
