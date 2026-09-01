export function playerRowClass(isDoubles, selectionIndex) {
  if (selectionIndex < 0) return {};
  if (!isDoubles) return { 'is-on': true };
  return {
    'is-on': true,
    'is-team1': selectionIndex < 2,
    'is-team2': selectionIndex >= 2,
  };
}
