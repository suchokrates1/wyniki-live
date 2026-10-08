import { publicApi } from '../api/publicApi.js';
import { registerCompetitorName } from '../shared/teamDisplay.js';
import { countedText, countedWord, countryName } from '../shared/plural.js';
import {
  dedupePlayersList,
  filterPlayersList,
  getPlayerCategoryOptions,
  getPlayerCountryOptions,
  getPlayerProfileLookupCandidates,
  normalizePlayerProfileMode,
} from './players.js';

export function createPlayersView() {
  return {
    allPlayers: [],
    filteredPlayers: [],
    playerSearch: '',
    playerGender: '',
    playerCountry: '',
    playerCategory: '',
    playersLoading: false,
    selectedPlayerId: null,
    playerProfile: null,
    playerProfileLoading: false,
    _profileIsGlobal: false,
    _playerProfileRequestId: 0,

    async fetchAllPlayers() {
      this.playersLoading = true;
      try {
        const data = await publicApi.getAllPlayers();
        if (!data) {
          this.allPlayers = [];
          this.filteredPlayers = [];
          return;
        }
        this.allPlayers = dedupePlayersList(Array.isArray(data) ? data : []);
        for (const player of this.allPlayers) {
          registerCompetitorName(this.bracketNameMap, player.name || '');
        }
        this.filterPlayers();
      } catch {
        this.allPlayers = [];
        this.filteredPlayers = [];
      } finally {
        this.playersLoading = false;
      }
    },

    filterPlayers() {
      this.filteredPlayers = filterPlayersList(this.allPlayers, {
        search: this.playerSearch,
        gender: this.playerGender,
        country: this.playerCountry,
        category: this.playerCategory,
      });
    },

    playerCountryOptions() {
      return getPlayerCountryOptions(this.allPlayers);
    },

    playerCategoryOptions() {
      return getPlayerCategoryOptions(this.allPlayers);
    },

    openPlayerProfile(id, isGlobal = false) {
      this.selectedPlayerId = id;
      this._profileIsGlobal = isGlobal;
      this.playerProfile = null;
      this.fetchPlayerProfile(id, isGlobal ? 'global' : 'local');
      this._updateHash();
    },

    closePlayerProfile() {
      this.selectedPlayerId = null;
      this._profileIsGlobal = false;
      this.playerProfile = null;
      history.back();
    },

    async fetchPlayerProfile(id, mode = 'auto') {
      const requestId = ++this._playerProfileRequestId;
      this.playerProfileLoading = true;
      try {
        const requestedMode = normalizePlayerProfileMode(mode);
        const candidates = getPlayerProfileLookupCandidates(this.allPlayers, id, requestedMode);

        for (const isGlobal of candidates) {
          try {
            const data = await publicApi.getPlayerProfile(id, isGlobal);
            if (!data) continue;
            if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
            this.playerProfile = data;
            this._profileIsGlobal = isGlobal;
            if (requestedMode === 'auto') this._updateHash(true);
            return;
          } catch {
            continue;
          }
        }

        if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
        this.playerProfile = null;
        this._profileIsGlobal = false;
      } catch {
        if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
        this.playerProfile = null;
        this._profileIsGlobal = false;
      } finally {
        if (requestId === this._playerProfileRequestId) this.playerProfileLoading = false;
      }
    },

    /** "3 mecze": counted in the page's language. */
    matchesCountText(n) {
      return countedText(this.lang, this.tr().playerSection?.matchesForms, n);
    },
    matchesCountWord(n) {
      return countedWord(this.lang, this.tr().playerSection?.matchesForms, n);
    },
    /** "34 lata". */
    ageText(years) {
      return countedText(this.lang, this.tr().playerProfile?.ageForms, years);
    },
    /** "Polska" for PL, in the page's language. */
    countryName(code) {
      return countryName(this.lang, code);
    },

    profileText(key, fallback, values = {}) {
      return this.formatText(this.tr().playerProfile?.[key] || fallback, values);
    },

    profileDate(value) {
      if (!value) return '';
      const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString(this.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    },

    /** Class changes as full sentences, oldest first; a player never reclassified shows none. */
    profileClassHistory() {
      const rows = this.playerProfile?.classification_history || [];
      return rows.length > 1 ? rows : [];
    },

    profileClassEntryText(row) {
      const since = row.effective_date
        ? this.profileText('classSince', '{class} od {date}', { class: row.classification, date: this.profileDate(row.effective_date) })
        : row.classification;
      let source = this.profileText('classSourceInitial', 'pierwsza klasa w bazie');
      if (row.source === 'tournament') {
        source = row.tournament_name
          ? this.profileText('classSourceTournament', 'klasyfikacja na turnieju {tournament}', { tournament: row.tournament_name })
          : this.profileText('classSourceTournamentHidden', 'klasyfikacja na turnieju');
      } else if (row.source === 'manual') {
        source = this.profileText('classSourceManual', 'zmiana w bazie zawodników');
      }
      const parts = [since];
      if (row.previous_classification) parts.push(this.profileText('classPrevious', 'wcześniej {class}', { class: row.previous_classification }));
      parts.push(source);
      if (row.status === 'provisional') parts.push(this.profileText('classProvisional', 'klasa tymczasowa'));
      return parts.join(', ');
    },

    profileMedalCategoryText(bucket) {
      const names = ['gold', 'silver', 'bronze']
        .filter((key) => bucket[key])
        .map((key) => `${this.tr().playerProfile?.[key] || key}: ${bucket[key]}`);
      const category = bucket.category || this.profileText('noCategory', 'bez kategorii');
      return `${category} – ${names.join(', ')}`;
    },

  };
}