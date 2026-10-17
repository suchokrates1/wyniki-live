import { buildProfileView } from './profileModel.js';
import { formatTemplate as fmt } from '../shared/text.js';

// The Alpine side of the player profile: the view model and the few texts it assembles.

export function createProfilePanelView() {
  return {
    profileReportOpen: false,
    profileReportMessage: '',
    profileReportBlank: '',
    profileReportStatus: '',
    profileReportSending: false,
    _profileNameAudio: null,
    _profileReportReturn: null,
    _profileReportHeld: [],

    profileViewModel() {
      return buildProfileView(this.playerProfile);
    },

    playProfileName() {
      const url = this.playerProfile?.player?.name_audio_url;
      if (!url) return;
      if (!this._profileNameAudio) this._profileNameAudio = new Audio();
      this._profileNameAudio.src = url;
      this._profileNameAudio.play();
    },

    stopProfileName() {
      if (!this._profileNameAudio) return;
      this._profileNameAudio.pause();
      this._profileNameAudio.src = '';
    },

    openProfileReport() {
      this.profileReportMessage = '';
      this.profileReportBlank = '';
      this.profileReportStatus = '';
      this._profileReportReturn = document.activeElement;
      this.profileReportOpen = true;
      this.$nextTick?.(() => {
        this.holdPageBehindReport(true);
        this.$refs.profileReportMessage?.focus();
      });
    },

    closeProfileReport() {
      if (!this.profileReportOpen) return;
      this.profileReportOpen = false;
      this.holdPageBehindReport(false);
      const back = this._profileReportReturn;
      this._profileReportReturn = null;
      this.$nextTick?.(() => {
        // Safari does not focus a clicked button: the opener is then the page or <main tabindex="-1">
        // (the skip link's target), so only a control is returned to, else the report button
        const control = back?.matches?.('button, a[href], input, select, textarea, [role="button"]');
        if (control && document.contains(back)) back.focus();
        else this.$refs.profileReportButton?.focus();
      });
    },

    /** Drop the dialog when the profile itself goes away, without pulling focus back. */
    releaseProfileReport() {
      this.profileReportOpen = false;
      this.holdPageBehindReport(false);
      this._profileReportReturn = null;
    },

    holdPageBehindReport(hold) {
      if (!hold) {
        for (const el of this._profileReportHeld) el.removeAttribute('inert');
        this._profileReportHeld = [];
        return;
      }
      const layer = this.$refs.profileReportLayer;
      const held = [];
      for (const child of document.body.children) {
        if (layer && (child === layer || child.contains(layer))) continue;
        if (child.hasAttribute('inert')) continue;
        child.setAttribute('inert', '');
        held.push(child);
      }
      this._profileReportHeld = held;
    },

    trapProfileReport(event) {
      const root = this.$refs.profileReportBox;
      if (!root) return;
      const items = [...root.querySelectorAll('button, textarea, a[href]')].filter((el) => (
        !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null
      ));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (!inside || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    },

    async submitProfileReport() {
      const player = this.playerProfile?.player;
      if (!player || this.profileReportSending) return;
      this.profileReportSending = true;
      this.profileReportStatus = '';
      try {
        const response = await fetch('/api/players/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            global_player_id: player.global_id || null,
            entry_id: player.global_id ? null : player.id,
            message: this.profileReportMessage,
            leave_blank: this.profileReportBlank,
          }),
        });
        if (response.status === 429) this.profileReportStatus = 'limit';
        else if (!response.ok) this.profileReportStatus = 'failed';
        else this.profileReportStatus = 'sent';
      } catch {
        this.profileReportStatus = 'failed';
      } finally {
        this.profileReportSending = false;
      }
    },

    profileViewText(key, values) {
      const text = this.tr().profileView?.[key] || '';
      return values ? fmt(text, values) : text;
    },

    /** "25–29 sierpnia 2026", "30 maja – 2 czerwca 2026": the shared month and year said once. */
    /** A prepared e-mail about this player's data: subject names the player, body links the profile. */
    profileDataMailto(name) {
      const subject = this.profileViewText('dataSubject', { name });
      const body = `${location.origin}${location.pathname}${location.hash}`;
      return `mailto:contact@blindtennis.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },

    profileDateRange(start, end) {
      if (!start) return '';
      if (!end || end === start) return this.profileDate(start);
      // each language orders a range its own way ("25–29 sierpnia 2026", "August 25 – 29, 2026")
      try {
        const format = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        return format.formatRange(new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`));
      } catch {
        return `${this.profileDate(start)} – ${this.profileDate(end)}`;
      }
    },

    /** One step of a tournament's path: "Grupa A · 1. miejsce" or the round ("Finał"). */
    profileStepLabel(step) {
      if (step?.kind !== 'group') return this.profilePhaseLabel(step?.phase);
      const group = this.translateCategory(String(step.phase).split(' — ').pop());
      return this.profileViewText('groupStep', { group, place: step.place });
    },

    /** "B1 Men — 06 Consolation Ćwierćfinał" → "Pocieszenie · Ćwierćfinał": the category and draw order go. */
    profilePhaseLabel(phase) {
      let text = String(phase || '').split(' — ').pop().replace(/^\d+\s+/, '').trim();
      const consolation = /consolation|pocieszeni/i.test(text);
      text = text.replace(/consolation\s*/i, '').trim();
      const label = this.translatePhase(text) || text;
      if (!consolation) return label;
      const side = this.tr().bracketView?.reachConsolation || 'pocieszenie';
      return `${side.charAt(0).toUpperCase()}${side.slice(1)}${label ? ` · ${label}` : ''}`;
    },

    profileResultText(result) {
      if (!result) return '';
      if (result.kind === 'medal') return this.tr().playerProfile?.[result.medal] || result.medal;
      if (result.kind === 'phase') return this.profilePhaseLabel(result.phase);
      if (result.kind === 'group') {
        return this.profileViewText('groupResult', { group: this.translateCategory(String(result.group).split(' — ').pop()), place: result.place, of: result.of });
      }
      return '';
    },
  };
}
