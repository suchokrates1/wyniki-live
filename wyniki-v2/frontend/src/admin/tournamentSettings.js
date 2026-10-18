/** The settings panel of one tournament: which fields it has and what the four flags mean. */

import { tournamentDates } from './tournamentsList.js';

export const TOURNAMENT_LANGUAGES = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'lt', label: 'Lietuvių' },
];

/** How players level on wins are ordered in a group table (wyniki/database/table_order.py). */
export const TABLE_ORDERS = [
  { value: 'wins_sets_games', label: 'Zwycięstwa, różnica setów, różnica gemów' },
  { value: 'wins_h2h_sets_games', label: 'Zwycięstwa, mecz bezpośredni, różnica setów, różnica gemów' },
  { value: 'itf', label: 'ITF: zwycięstwa; dwoje równych – mecz bezpośredni; troje i więcej – % setów, potem % gemów' },
];

export const TABLE_ORDER_FIELD = {
  key: 'table_order', label: 'Kolejność w tabeli grupy', type: 'select', options: TABLE_ORDERS, wide: true,
  hint: 'Przy równej liczbie zwycięstw. Ustal z organizatorem przed pierwszym meczem.',
};

export const TOURNAMENT_FIELDS = [
  { key: 'name', label: 'Nazwa turnieju', type: 'text', wide: true },
  { key: 'start_date', label: 'Data rozpoczęcia', type: 'date' },
  { key: 'end_date', label: 'Data zakończenia', type: 'date' },
  { key: 'court_count', label: 'Liczba kortów', type: 'number', min: 0, hint: 'Tyle kortów dostaje PIN-y i pojawia się na stronie.' },
  { key: 'city', label: 'Miasto', type: 'text' },
  { key: 'country', label: 'Kraj', type: 'text' },
  { key: 'language', label: 'Język turnieju', type: 'select', options: TOURNAMENT_LANGUAGES, hint: 'Lektor i overlay. B1 i B4 zostają.' },
  TABLE_ORDER_FIELD,
  { key: 'report_email', label: 'E-mail raportów', type: 'email', hint: 'Tam idzie podsumowanie po turnieju.' },
  { key: 'access_key', label: 'Klucz dostępu', type: 'text', hint: 'Potrzebny tylko przy turnieju niepublicznym.' },
];

export const TOURNAMENT_FLAGS = [
  { key: 'active', label: 'Aktywny', hint: 'widoczny w aplikacji sędziego' },
  { key: 'is_public', label: 'Publiczny', hint: 'widoczny na blindtennis.app' },
  { key: 'stats_enabled', label: 'Liczy statystyki', hint: 'wyniki wchodzą do profili zawodników' },
  { key: 'is_simulation', label: 'Symulacja', hint: 'turniej testowy, poza wynikami' },
  { key: 'visibility_lock', label: 'Blokada publikacji', hint: 'organizator serii nie opublikuje turnieju' },
];

/** What the champion is called on the bracket. Unset, the name decides and the panel says so. */
export const TITLE_SCOPES = [
  { value: 'world', label: 'Mistrzostwa świata', example: 'Mistrz świata B1' },
  { value: 'continental', label: 'Mistrzostwa kontynentu', example: 'Mistrz Europy B1' },
  { value: 'national', label: 'Mistrzostwa kraju', example: 'Mistrz Polski B1' },
  { value: 'open', label: 'Turniej otwarty', example: 'Zwycięzca B1' },
];

/** A simulation is never public and never counts: those two switches go dead. */
export function flagsFor(tournament = {}) {
  const simulation = !!tournament.is_simulation;
  return TOURNAMENT_FLAGS.map((flag) => ({
    ...flag,
    disabled: (simulation && (flag.key === 'is_public' || flag.key === 'stats_enabled'))
      || (flag.key === 'is_public' && !!tournament.visibility_lock),
  }));
}

export function fieldsFor(prefix = 'adm-edit') {
  return TOURNAMENT_FIELDS.map((field) => ({ ...field, id: `${prefix}-${field.key.replace(/_/g, '-')}` }));
}

export function tournamentHeadline(tournament = {}) {
  const dates = tournamentDates(tournament);
  const place = [tournament.city, tournament.country].filter(Boolean).join(', ');
  const courts = Number(tournament.court_count || 0);
  return [dates, place, courts ? `${courts} ${courts === 1 ? 'kort' : 'korty'}` : ''].filter(Boolean).join(' · ');
}

export function createTournamentSettingsView() {
  return {
    adminTournamentFields() {
      return fieldsFor('adm-edit');
    },

    adminTournamentFlags() {
      return flagsFor(this.editTournament || {});
    },

    adminTitleScopes() {
      return TITLE_SCOPES;
    },

    adminEditTournamentMeta() {
      return tournamentHeadline(this.editTournament || {});
    },
  };
}
