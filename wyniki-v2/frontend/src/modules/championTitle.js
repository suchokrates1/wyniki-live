import { parseBracketCategory } from './bracket.js';
import { formatCategoryDisplay } from '../shared/categories.js';

// The line over the main draw's winner: "Mistrz świata B1", "Mistrzyni Polski B2",
// "Mistrzowie Europy B3/4", "Zwycięzca B1". The tournament's rank says which world;
// the category says woman or man, single or pair. An own line from the office wins.

const SCOPES = new Set(['world', 'continental', 'national', 'open']);

function pick(source, path) {
  const value = path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), source);
  return typeof value === 'string' ? value : '';
}

export function titleForm(categoryName) {
  const parsed = parseBracketCategory(categoryName);
  const women = parsed.gender === 'women';
  if (parsed.doubles) return women ? 'pf' : 'pm';
  return women ? 'f' : 'm';
}

/**
 * @param tournament {title_scope, title_override, country} from the bracket payload
 * @param t the `bracketView` texts: titles.{scope}.{m,f,pm,pf} with {cat} and {country},
 *          countries.{CODE} (the form a title needs), titles.nationalFallback.
 */
export function championTitle(tournament = {}, categoryName = '', t = {}) {
  const override = String(tournament?.title_override || '').trim();
  if (override) return override;
  const scope = SCOPES.has(tournament?.title_scope) ? tournament.title_scope : 'open';
  const form = titleForm(categoryName);
  const cat = formatCategoryDisplay(parseBracketCategory(categoryName).division) || '';
  const code = String(tournament?.country || '').toUpperCase();
  const country = code ? pick(t, `countries.${code}`) : '';
  const set = scope === 'national' && !country ? 'nationalFallback' : scope;
  const template = pick(t, `titles.${set}.${form}`) || pick(t, `titles.${set}.m`);
  return template.replace('{cat}', cat).replace('{country}', country).replace(/\s+/g, ' ').trim();
}
