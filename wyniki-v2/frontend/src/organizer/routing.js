// The organizer's address bar: #/twt (the series), #/twt/t/31 (a tournament),
// #/twt/t/31/zawodnicy (one of its tabs).

export const TOURNAMENT_TABS = [
  { id: 'ustawienia', label: 'Ustawienia' },
  { id: 'kategorie', label: 'Kategorie' },
  { id: 'zawodnicy', label: 'Zawodnicy' },
  { id: 'korty', label: 'Korty i biuro' },
  { id: 'historia', label: 'Historia zmian' },
];
const TAB_IDS = TOURNAMENT_TABS.map((tab) => tab.id);

export function parseOrganizerHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const slug = parts[0] || '';
  if (parts[1] === 't' && /^\d+$/.test(parts[2] || '')) {
    const tab = TAB_IDS.includes(parts[3]) ? parts[3] : TAB_IDS[0];
    return { slug, tournamentId: Number(parts[2]), tab };
  }
  return { slug, tournamentId: null, tab: '' };
}

export function organizerHash({ slug, tournamentId = null, tab = '' }) {
  if (!slug) return '';
  if (!tournamentId) return `#/${slug}`;
  return tab && tab !== TAB_IDS[0] ? `#/${slug}/t/${tournamentId}/${tab}` : `#/${slug}/t/${tournamentId}`;
}
