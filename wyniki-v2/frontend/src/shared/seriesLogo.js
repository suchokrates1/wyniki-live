// Which version of a series' logo reads on a page: the dark-background version on a dark page,
// the logo itself on a light one. Missing the right one, the other stands on a plate of the
// colour it was drawn for (a white plate under dark ink, a dark one under light ink).

/** {src, plate: '' | 'light' | 'dark'} or null when the series has no logo at all. */
export function pickSeriesLogo(series, dark) {
  const light = series?.logo_path || '';
  const night = series?.logo_dark_path || '';
  if (dark) {
    if (night) return { src: night, plate: '' };
    return light ? { src: light, plate: 'light' } : null;
  }
  if (light) return { src: light, plate: '' };
  return night ? { src: night, plate: 'dark' } : null;
}

/** The two versions, as the panels list them for upload. */
export const LOGO_VARIANTS = [
  { variant: '', field: 'logo_path', ground: 'light' },
  { variant: 'dark', field: 'logo_dark_path', ground: 'dark' },
];
