/** The Zawodnicy section: the shared base, and whether each player is in the chosen tournament. */

export function playerFullName(player = {}) {
  const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  return name || player.name || '—';
}

export function playerAge(player = {}, today = new Date()) {
  const birth = String(player.birth_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [year, month, day] = birth.split('-').map(Number);
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** A tournament entry matches a base player by id, or — for older entries — by full name. */
export function entryForGlobalPlayer(globalPlayer = {}, entries = []) {
  const byId = entries.find((entry) => entry.global_player_id && entry.global_player_id === globalPlayer.id);
  if (byId) return byId;
  const name = playerFullName(globalPlayer).toLocaleLowerCase();
  return entries.find((entry) => playerFullName(entry).toLocaleLowerCase() === name) || null;
}

export function playerMeta(player = {}) {
  const age = playerAge(player);
  return [player.country, player.category, age == null ? '' : `${age} lat`].filter(Boolean).join(' · ');
}

export function createPlayersView() {
  return {
    playerCreateOpen: false,
    playerCreateError: '',

    adminPlayerRows() {
      const base = Array.isArray(this.globalPlayers) ? this.globalPlayers : [];
      const entries = Array.isArray(this.players) ? this.players : [];
      const hasTournament = !!this.selectedTournament;
      return base.map((player) => {
        const entry = hasTournament ? entryForGlobalPlayer(player, entries) : null;
        return {
          player,
          id: player.id,
          name: playerFullName(player),
          meta: playerMeta(player),
          category: player.category || '—',
          country: player.country || '—',
          tournaments: Number(player.tournaments_count || player.tournament_count || 0),
          inTournament: !!entry,
          canAdd: hasTournament && !entry,
        };
      });
    },

    adminPlayersTournamentName() {
      const list = Array.isArray(this.tournaments) ? this.tournaments : [];
      return list.find((item) => item.id === this.selectedTournament)?.name || '';
    },

    openPlayerCreate() {
      this.newGlobalPlayer = { first_name: '', last_name: '', gender: '', birth_date: '', category: '', country: '', notes: '' };
      this.playerCreateError = '';
      this.playerCreateOpen = true;
      this.$nextTick(() => {
        if (typeof document !== 'undefined') document.getElementById('adm-player-last-name')?.focus();
      });
    },

    closePlayerCreate() {
      this.playerCreateOpen = false;
      this.playerCreateError = '';
    },

    async submitPlayerCreate() {
      if (!String(this.newGlobalPlayer?.last_name || '').trim()) {
        this.playerCreateError = 'Nazwisko jest potrzebne — reszta może poczekać.';
        if (typeof document !== 'undefined') document.getElementById('adm-player-last-name')?.focus();
        return;
      }
      this.playerCreateError = '';
      const before = (Array.isArray(this.globalPlayers) ? this.globalPlayers : []).length;
      await this.createGlobalPlayer();
      if ((Array.isArray(this.globalPlayers) ? this.globalPlayers : []).length !== before) this.closePlayerCreate();
    },
  };
}
