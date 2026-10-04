/**
 * Which translation keys does no source file read?
 *
 * The site reads its texts in three ways, and a key counts as used if any of them can
 * reach it: by full path (`t('history.title')`), by a path the office helper prefixes
 * itself (`ot('planning.step1Title')` for `office.planning.step1Title`), by a path built
 * in the template (`ot(\`path.state${…}\`)`), or as a property through an alias
 * (`b.legendWins` where `b = t.bracket`). A key reachable none of these ways is dead.
 *
 * The check is generous on purpose: it may keep a dead key whose name happens to match
 * a property elsewhere, but it never reports a key the page actually shows.
 */

export function leafKeys(dict, prefix = '') {
  return Object.entries(dict).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value) ? leafKeys(value, path) : [path];
  });
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isKeyUsed(key, code) {
  if (code.includes(key)) return true;
  const parts = key.split('.');
  const leaf = parts.pop();
  const parent = parts.join('.');
  const localPath = [...parts.slice(1), leaf].join('.');
  const localParent = parts.slice(1).join('.');

  if (localPath && new RegExp(`['"\`]${escape(localPath)}['"\`]`).test(code)) return true;
  for (const base of [parent, localParent]) {
    if (!base) continue;
    if (code.includes(`${base}.\${`) || code.includes(`'${base}.' +`)) return true;
  }
  // A path assembled from a fixed start and a variable end: `path.state${step}`.
  for (let cut = 1; cut < leaf.length; cut += 1) {
    const head = leaf.slice(0, cut);
    if (localParent && code.includes(`${localParent}.${head}\${`)) return true;
  }
  if (new RegExp(`\\.${escape(leaf)}\\b`).test(code)) return true;
  return new RegExp(`['"\`]${escape(leaf)}['"\`]`).test(code);
}

export function findUnusedKeys(dict, code) {
  return leafKeys(dict).filter((key) => !isKeyUsed(key, code));
}
