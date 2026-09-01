/** Playwright must run the umpire PWA as a phone or tablet, never desktop. */
export const UMPIRE_E2E_VIEWPORTS = Object.freeze({
  phone: {
    name: 'phone',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  tablet: {
    name: 'tablet',
    viewport: { width: 800, height: 1280 },
    isMobile: true,
    hasTouch: true,
  },
  tabletLandscape: {
    name: 'tablet-landscape',
    viewport: { width: 1280, height: 800 },
    isMobile: true,
    hasTouch: true,
  },
});

export const UMPIRE_E2E_PROJECTS = Object.freeze(Object.values(UMPIRE_E2E_VIEWPORTS));
