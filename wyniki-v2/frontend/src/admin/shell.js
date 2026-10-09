/**
 * The admin shell: five setup sections instead of nine flat tabs.
 *
 * The day of the tournament belongs to the office module, so the schedule, groups,
 * results and bracket are not in the rail — the admin links out to the office instead.
 * Each section still drives the old `activeTab` values, so the existing views keep working.
 */

export const ADMIN_SECTIONS = [
  { id: 'turnieje', label: 'Turnieje', short: 'Turnieje', tabs: ['tournaments', 'series'] },
  { id: 'zawodnicy', label: 'Zawodnicy', short: 'Zawodnicy', tabs: ['global_players', 'players', 'player_reviews'] },
  { id: 'korty', label: 'Korty i tablety', short: 'Korty', tabs: ['courts', 'devices'] },
  { id: 'overlay', label: 'Overlay TV', short: 'Overlay', tabs: ['settings'] },
  { id: 'system', label: 'System', short: 'System', tabs: ['panic'] },
];

/**
 * On a phone the rail is a bottom bar, and four tabs is all that fits side by side.
 * Overlay and System move behind a "Więcej" menu; on a wide screen they stay in the rail.
 */
export const MORE_SECTION = { id: 'wiecej', label: 'Więcej', short: 'Więcej', tabs: ['more'] };
export const PHONE_TAB_COUNT = 4;

export const MORE_ENTRIES = [
  { section: 'overlay', label: 'Overlay TV', hint: 'układ, elementy, animacje, źródła OBS' },
  { section: 'system', label: 'Panic', hint: 'odbiorcy alarmu na WhatsApp' },
  { section: 'system', label: 'Poczta (SMTP)', hint: 'raporty po turnieju' },
  { section: 'system', label: 'Dostęp do panelu', hint: 'konta administratorów, wylogowanie' },
];

export const SECTION_HEADINGS = {
  turnieje: ['Turnieje', 'zakładanie, dane, aktywacja, serie organizatorów'],
  zawodnicy: ['Zawodnicy', 'baza, zgłoszenia, kategorie'],
  korty: ['Korty i tablety', 'PIN-y, przypisanie, bateria'],
  overlay: ['Overlay TV', 'to, co widzi widz na transmisji'],
  system: ['System', 'poczta, alarmy, dostęp do panelu'],
  wiecej: ['Więcej', 'overlay, system, biuro'],
};

export const SECTION_TAB_LABELS = {
  tournaments: 'Lista turniejów',
  series: 'Serie i konta',
  global_players: 'Baza zawodników',
  players: 'Zgłoszenia do turnieju',
  player_reviews: 'Do sprawdzenia',
  courts: 'Korty',
  devices: 'Tablety',
};


export const DEFAULT_SECTION = ADMIN_SECTIONS[0].id;

export function sectionForTab(tab) {
  if (tab === 'more') return MORE_SECTION.id;
  const found = ADMIN_SECTIONS.find((section) => section.tabs.includes(tab));
  if (found) return found.id;
  return DEFAULT_SECTION;
}

export function sectionById(id) {
  if (id === MORE_SECTION.id) return MORE_SECTION;
  return ADMIN_SECTIONS.find((section) => section.id === id) || null;
}

/** The bottom bar: the three sections used on the day of setup, then the menu.
    Four labels share one line, so each item uses its short name. */
export function phoneSections() {
  return [...ADMIN_SECTIONS.slice(0, PHONE_TAB_COUNT - 1), MORE_SECTION]
    .map((section) => ({ ...section, label: section.short || section.label }));
}

/** Which bar item is lit: on a phone, Overlay and System light up "Więcej". */
export function railSectionFor(section, phone) {
  if (!phone) return section;
  return phoneSections().some((item) => item.id === section) ? section : MORE_SECTION.id;
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

export const PHONE_QUERY = '(max-width: 860px)';

export function createAdminShell() {
  return {
    adminPhone: false,

    adminSection() {
      return sectionForTab(this.activeTab);
    },

    adminSections() {
      return this.adminPhone ? phoneSections() : ADMIN_SECTIONS;
    },

    adminMoreEntries() {
      return MORE_ENTRIES;
    },

    adminSectionTabs() {
      const tabs = tabsForSection(this.adminSection());
      return tabs.length > 1
        ? tabs.map((tab) => ({ tab, label: SECTION_TAB_LABELS[tab] || tab }))
        : [];
    },

    isAdminSection(id) {
      return railSectionFor(this.adminSection(), this.adminPhone) === id;
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
      if (tab === 'more' && !this.adminPhone) return this.openAdminSection('overlay');
      if (tab && tab !== this.activeTab) this.openAdminTab(tab);
    },

    /** The menu is a phone screen: on a wide one its entries are rail items again. */
    adminPhoneChanged(phone) {
      this.adminPhone = phone;
      if (!phone && this.activeTab === 'more') this.openAdminSection('overlay');
    },

    initAdminShell() {
      const query = window.matchMedia?.(PHONE_QUERY);
      if (query) {
        this.adminPhone = query.matches;
        query.addEventListener?.('change', (event) => this.adminPhoneChanged(event.matches));
      }
      this.applyAdminHash();
      window.addEventListener('hashchange', () => this.applyAdminHash());
    },
  };
}
