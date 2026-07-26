/** Merge Alpine admin modules while preserving getters/setters. */
export function mergeAdminModules(...modules) {
  const result = {};
  for (const mod of modules) {
    Object.defineProperties(result, Object.getOwnPropertyDescriptors(mod));
  }
  return result;
}
