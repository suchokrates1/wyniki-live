/**
 * The admin shell: five setup sections instead of nine flat tabs.
 *
 * The day of the tournament belongs to the office module, so the schedule, groups,
 * results and bracket are not in the rail — the admin links out to the office instead.
 * Each section still drives the old `activeTab` values, so the existing views keep working.
 */

export const ADMIN_SECTIONS = [
  { id: 'turnieje', label: 'Turnieje', tabs: ['tournaments'] },
  { id: 'zawodnicy', label: 'Zawodnicy', tabs: ['global_players', 'players'] },
  { id: 'korty', label: 'Korty i tablety', tabs: ['courts', 'devices'] },
  { id: 'overlay', label: 'Overlay TV', tabs: ['settings'] },
  { id: 'system', label: 'System', tabs: ['panic'] },
];

export const SECTION_HEADINGS = {
  turnieje: ['Turnieje', 'zakładanie, dane, aktywacja'],
  zawodnicy: ['Zawodnicy', 'baza, zgłoszenia, klasy sportowe'],
  korty: ['Korty i tablety', 'PIN-y, przypisanie, bateria'],
  overlay: ['Overlay TV', 'to, co widzi widz na transmisji'],
  system: ['System', 'poczta, alarmy, dostęp do panelu'],
};

export const SECTION_TAB_LABELS = {
  global_players: 'Baza zawodników',
  players: 'Zgłoszenia do turnieju',
  courts: 'Korty',
  devices: 'Tablety',
};

// Tabs the office owns: reachable from inside a section, never from the rail.
const GUEST_TABS = { office: 'turnieje', planning: 'turnieje' };

export const DEFAULT_SECTION = ADMIN_SECTIONS[0].id;

export function sectionForTab(tab) {
  const found = ADMIN_SECTIONS.find((section) => section.tabs.includes(tab));
  if (found) return found.id;
  return GUEST_TABS[tab] || DEFAULT_SECTION;
}

export function sectionById(id) {
  return ADMIN_SECTIONS.find((section) => section.id === id) || null;
}

export function tabsForSection(id) {
  return sectionById(id)?.tabs || [];
}

/** '#/korty/tablety' → {section, tab}; an unknown hash falls back to the first section. */
export function parseAdminHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const section = sectionById(parts[0]);
  if (!section) return { section: DEFAULT_SECTION, tab: tabsForSection(DEFAULT_SECTION)[0] };
  const tab = section.tabs.includes(parts[1]) ? parts[1] : section.tabs[0];
  return { section: section.id, tab };
}

export function adminHashFor(tab) {
  const section = sectionForTab(tab);
  const tabs = tabsForSection(section);
  return tabs.length > 1 && tabs.includes(tab) ? `#/${section}/${tab}` : `#/${section}`;
}

export function createAdminShell() {
  return {
    adminSection() {
      return sectionForTab(this.activeTab);
    },

    adminSections() {
      return ADMIN_SECTIONS;
    },

    adminSectionTabs() {
      const tabs = tabsForSection(this.adminSection());
      return tabs.length > 1
        ? tabs.map((tab) => ({ tab, label: SECTION_TAB_LABELS[tab] || tab }))
        : [];
    },

    isAdminSection(id) {
      return this.adminSection() === id;
    },

    adminSectionTitle() {
      return (SECTION_HEADINGS[this.adminSection()] || [])[0] || '';
    },

    adminSectionHint() {
      return (SECTION_HEADINGS[this.adminSection()] || [])[1] || '';
    },

    /** The tournament the public site and the umpire app are pointed at right now. */
    adminActiveTournamentName() {
      const list = Array.isArray(this.tournaments) ? this.tournaments : [];
      const active = list.find((item) => Number(item?.active) === 1 && Number(item?.is_simulation) !== 1);
      return active?.name || '';
    },

    openAdminSection(id) {
      const tabs = tabsForSection(id);
      if (!tabs.length) return;
      this.openAdminTab(tabs.includes(this.activeTab) ? this.activeTab : tabs[0]);
    },

    openAdminTab(tab) {
      this.activeTab = tab;
      const hash = adminHashFor(tab);
      if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
      if (tab === 'devices') this.loadDevices?.();
      if (tab === 'panic') this.loadPanic?.();
      if (tab === 'settings') this.$nextTick?.(() => { this.updateCanvasScale?.(); this._fitPreviewNames?.(); });
    },

    applyAdminHash() {
      const { tab } = parseAdminHash(window.location.hash);
      if (tab && tab !== this.activeTab) this.openAdminTab(tab);
    },

    initAdminShell() {
      this.applyAdminHash();
      window.addEventListener('hashchange', () => this.applyAdminHash());
    },
  };
}
