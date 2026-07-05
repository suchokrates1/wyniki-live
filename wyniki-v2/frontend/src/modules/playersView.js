import { publicApi } from '../api/publicApi.js';
import {
  dedupePlayersList,
  filterPlayersList,
  getPlayerCategoryOptions,
  getPlayerCountryOptions,
  getPlayerProfileLookupCandidates,
  getProfileMedalEmoji,
  getProfileWinRate,
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
    profileExpandedTournaments: {},
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
          const name = player.name || '';
          if (name.includes(' ')) {
            const parts = name.trim().split(/\s+/);
            const surname = parts[parts.length - 1];
            this.bracketNameMap[surname] = name;
          }
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
      this.profileExpandedTournaments = {};
      this.fetchPlayerProfile(id, isGlobal ? 'global' : 'local');
      this._updateHash();
    },

    closePlayerProfile() {
      this.selectedPlayerId = null;
      this._profileIsGlobal = false;
      this.playerProfile = null;
      this.profileExpandedTournaments = {};
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

    toggleProfileTournament(tournamentId) {
      this.profileExpandedTournaments[tournamentId] = !this.profileExpandedTournaments[tournamentId];
    },

    profileMedalEmoji(medal) {
      return getProfileMedalEmoji(medal);
    },

    profileWinRate() {
      return getProfileWinRate(this.playerProfile);
    },
  };
}