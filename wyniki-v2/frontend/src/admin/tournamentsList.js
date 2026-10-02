/** The Turnieje list: one row per tournament, the activation switch on the row itself. */

const STATES = {
  active: { label: 'AKTYWNY', tone: 'ok' },
  simulation: { label: 'SYMULACJA', tone: 'sim' },
  upcoming: { label: 'NADCHODZĄCY', tone: 'muted' },
  archive: { label: 'ARCHIWUM', tone: 'muted' },
};

function isoToday(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function tournamentState(tournament, today = isoToday()) {
  if (Number(tournament?.is_simulation) === 1) return STATES.simulation;
  if (Number(tournament?.active) === 1) return STATES.active;
  if (String(tournament?.start_date || '') > today) return STATES.upcoming;
  return STATES.archive;
}

export function tournamentDates(tournament) {
  const start = String(tournament?.start_date || '');
  const end = String(tournament?.end_date || '');
  const short = (value) => (value.length === 10 ? `${value.slice(8, 10)}.${value.slice(5, 7)}` : value);
  if (!start) return '';
  if (!end || end === start) return short(start);
  return `${short(start)}–${short(end)}`;
}

/** The grey line under the name: dates, place, courts, and what the flags turn off. */
export function tournamentMeta(tournament) {
  const place = [tournament?.city, tournament?.country].filter(Boolean).join(', ');
  const courts = Number(tournament?.court_count || 0);
  const parts = [tournamentDates(tournament), place, courts ? `${courts} ${courts === 1 ? 'kort' : 'korty'}` : ''];
  if (Number(tournament?.is_public) !== 1) parts.push('niepubliczny');
  if (Number(tournament?.stats_enabled) !== 1) parts.push('bez statystyk');
  return parts.filter(Boolean).join(' · ');
}

export function tournamentMatchesQuery(tournament, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return true;
  return [tournament?.name, tournament?.city, tournament?.country, tournament?.start_date]
    .map((value) => String(value || '').toLocaleLowerCase())
    .some((value) => value.includes(needle));
}

/** Active first, then the newest by start date: the one being run is always on top. */
export function sortTournamentsForAdmin(list = []) {
  const rank = (tournament) => (Number(tournament?.active) === 1 ? 0 : 1);
  return [...list].sort((left, right) => {
    const byState = rank(left) - rank(right);
    if (byState !== 0) return byState;
    return String(right?.start_date || '').localeCompare(String(left?.start_date || ''));
  });
}

export function createTournamentsListView() {
  return {
    tournamentSearch: '',

    adminTournamentRows() {
      const list = Array.isArray(this.tournaments) ? this.tournaments : [];
      return sortTournamentsForAdmin(list.filter((item) => tournamentMatchesQuery(item, this.tournamentSearch)))
        .map((tournament) => ({
          tournament,
          id: tournament.id,
          name: tournament.name,
          meta: tournamentMeta(tournament),
          state: tournamentState(tournament),
          isActive: Number(tournament.active) === 1,
        }));
    },

    adminTournamentCount() {
      return (Array.isArray(this.tournaments) ? this.tournaments : []).length;
    },

    /** The create form lives above the list; jump to it and put the cursor in reach. */
    openTournamentCreate() {
      const heading = document.getElementById('adm-new-tournament');
      if (!heading) return;
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      heading.focus({ preventScroll: true });
    },
  };
}
