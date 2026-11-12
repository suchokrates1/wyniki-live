import { courtDisplayName } from '../courtDisplay.js';
import { parseExpiresAt } from '../session.js';
import { TUTORIAL_COURT_1, TUTORIAL_PIN, tutorialCatalog } from '../tutorial/catalog.js';

export function createUmpireCourtPinSlice({ api, session, pinPad }) {
  return {
    courtName(court) {
      if (!court) return '';
      return courtDisplayName(court.name, court.kort_id || court.id, (ordinal) => (
        this.t('courtName', { name: ordinal })
      ));
    },

    tournamentMeta(tournament) {
      if (!tournament) return '';
      const place = [tournament.location, tournament.city, tournament.country]
        .filter(Boolean)
        .join(', ');
      const dates = [tournament.start_date, tournament.end_date].filter(Boolean).join(' - ');
      return [place, dates].filter(Boolean).join('\n');
    },

    async loadTournaments() {
      if (this.tutorialMode) {
        this.tournaments = [tutorialCatalog((key) => this.t(key)).tournament];
        return;
      }
      this.loading = true;
      const { ok, data } = await api.getActiveTournaments();
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        this.tournaments = [];
        return;
      }
      this.tournaments = Array.isArray(data) ? data : (data?.tournaments || []);
    },

    selectTournament(tournament) {
      session.saveTournament(tournament);
      this.go('court');
    },

    async loadCourts() {
      if (this.tutorialMode) {
        this.courts = tutorialCatalog((key) => this.t(key)).courts;
        return;
      }
      const tournament = session.getTournamentForToday();
      if (!tournament) {
        this.go('tournament');
        return;
      }
      this.loading = true;
      const { ok, data } = await api.getCourts(tournament.id);
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        this.courts = [];
        return;
      }
      this.courts = data?.courts || [];
    },

    openPin(court) {
      this.pinCourt = court;
      this.pinError = '';
      this.pinBusy = false;
      pinPad.clear();
      this.pinBoxes = pinPad.boxes();
      this.pinOpen = true;
      if (this.tutorialMode && (court.kort_id || court.id) === TUTORIAL_COURT_1) {
        this.tutorialNote('selectCourt');
      }
    },

    closePin() {
      this.pinOpen = false;
      this.pinCourt = null;
      pinPad.clear();
      this.pinBoxes = pinPad.boxes();
    },

    async enterPinDigit(digit) {
      if (this.pinBusy) return;
      pinPad.append(digit);
      this.pinBoxes = pinPad.boxes();
      if (pinPad.complete) await this.submitPin();
    },

    pinBackspace() {
      if (this.pinBusy) return;
      pinPad.backspace();
      this.pinBoxes = pinPad.boxes();
    },

    async submitPin() {
      if (!this.pinCourt || !pinPad.complete || this.pinBusy) return;
      this.pinBusy = true;
      this.pinError = '';
      if (this.tutorialMode) {
        this.pinBusy = false;
        if (pinPad.value !== TUTORIAL_PIN) {
          pinPad.clear();
          this.pinBoxes = pinPad.boxes();
          this.pinError = this.t('pinInvalid', { name: '' }).replace(/:\s*$/, '');
          return;
        }
        this.tutorialCourtSession = {
          courtId: this.pinCourt.kort_id || this.pinCourt.id,
          courtName: this.courtName(this.pinCourt),
          token: 'tutorial',
        };
        this.closePin();
        this.tutorialNote('enterPin');
        this.go('players');
        return;
      }
      const { ok, data } = await api.authorizeCourt(this.pinCourt.kort_id || this.pinCourt.id, pinPad.value);
      this.pinBusy = false;
      if (!ok || !data?.authorized) {
        pinPad.clear();
        this.pinBoxes = pinPad.boxes();
        this.pinError = this.t('pinInvalid', { name: data?.error || data?.detail || '' }).replace(/:\s*$/, '');
        return;
      }
      session.saveCourtSession({
        courtId: data.court_id || data.kort_id || this.pinCourt.kort_id,
        courtName: this.courtName(this.pinCourt),
        token: data.token,
        expiresAtMillis: parseExpiresAt(data.expires_at),
      });
      this.closePin();
      this._heartbeat?.sendNow();
      this.flushOutbox();
      this.go('players');
    },
  };
}
