import { umpireText } from '../i18n.js';
import { createMatchFromDraft } from '../match/createMatchFromDraft.js';
import { hydrateMatchState, serializeMatchState } from '../match/matchStateIo.js';
import { matchTimerText } from '../match/matchTimer.js';
import { MatchView } from '../match/matchViews.js';

export function createUmpireNavigationSlice({ session, wakeLock }) {
  return {
    onMatchChange() {
      this.matchRev += 1;
      this.applyMotion();
      if (this.match?.state) {
        this.timerText = matchTimerText(this.match.state, Date.now());
        if (!this.tutorialMode) {
          session.saveActiveMatch({
            view: this.match.view,
            pendingAnnouncementType: this.match.pendingAnnouncementType,
            canUndo: this.match.canUndo,
            state: serializeMatchState(this.match.state),
          });
        }
      }
    },

    ensureMatchFromDraft() {
      this.draft = session.getDraft();
      if (!this.match?.state && this.draft) {
        this.match.initialize(createMatchFromDraft(this.draft));
      }
    },

    restoreActiveMatch() {
      const snapshot = session.getActiveMatch();
      if (!snapshot?.state) return;
      const state = hydrateMatchState(snapshot.state);
      if (!state) return;
      this.match.restoreSnapshot({
        state,
        view: snapshot.view,
        pendingAnnouncementType: snapshot.pendingAnnouncementType,
        canUndo: snapshot.canUndo,
      });
      this.screen = 'match';
    },

    syncFromHash() {
      const name = (location.hash.replace(/^#\/?/, '') || this.screen).split('/')[0];
      if (name === 'match' && this.match?.chrome()?.confirmLeave && this.screen === 'match') return;
      if (name && name !== this.screen) {
        if (this.screen === 'match' && this.match?.chrome()?.confirmLeave) {
          this.dialog = 'leave';
          history.forward();
          return;
        }
        this.screen = name;
        this.onScreen(name);
      }
    },

    go(name, { replace = false } = {}) {
      this.screen = name;
      this.error = '';
      const hash = `#/${name}`;
      if (replace) history.replaceState(null, '', hash);
      else location.hash = hash;
      this.onScreen(name);
    },

    onScreen(name) {
      if (name === 'tournament') this.loadTournaments();
      if (name === 'court') this.loadCourts();
      if (name === 'players') this.loadPlayers();
      if (name === 'serve') this.go('match', { replace: true });
      if (name === 'match') this.ensureMatchFromDraft();
      if (name === 'history') this.loadHistory();
      this.maybeShowTutorialBanner();
      if (!this.tutorialMode) this._heartbeat?.sendNow();
    },

    applyChromeLanguage(code) {
      document.documentElement.lang = code;
      document.title = umpireText(code, 'appName');
    },

    selectLanguage(code) {
      session.setLanguage(code);
      this.lang = code;
      this.applyChromeLanguage(code);
      this.matchRev += 1;
      if (this.settingsFrom === 'settings' || this.screen === 'settings') {
        this.go('settings');
        return;
      }
      this.go('tournament');
    },

    screenTitle() {
      this.matchRev;
      const titles = {
        language: 'languageTitle',
        tournament: 'tournamentTitle',
        court: 'courtTitle',
        players: 'playersTitle',
        config: 'configTitle',
        serve: 'serveTitle',
        match: this.matchView() === MatchView.SERVER_SELECTION ? 'serveTitle' : 'matchTitle',
        settings: 'settings',
        history: 'matchHistory',
        historyDetail: 'matchHistory',
      };
      return this.t(titles[this.screen] || 'appName');
    },

    back() {
      if (this.tutorialMode) {
        this.tutorialBack();
        return;
      }
      if (this.screen === 'match') {
        if (this.match?.chrome()?.confirmLeave) {
          this.dialog = 'leave';
          return;
        }
        this.leaveMatch();
        return;
      }
      const from = {
        tournament: 'language',
        court: 'tournament',
        players: 'court',
        config: 'players',
        serve: 'config',
        settings: this.settingsFrom || 'court',
        history: 'settings',
        historyDetail: 'history',
      };
      if (this.screen === 'language') return;
      if (this.screen === 'court' && this.pinOpen) {
        this.closePin();
        return;
      }
      this.go(from[this.screen] || 'language');
    },

    leaveMatch() {
      wakeLock.release();
      session.clearActiveMatch();
      this.dialog = null;
      const finished = this.match?.state?.isMatchFinished;
      this.go(finished ? 'players' : 'config');
    },

    confirmLeave() {
      this.leaveMatch();
    },
  };
}
