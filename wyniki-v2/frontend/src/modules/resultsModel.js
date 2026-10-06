import { matchCard } from './bracketCards.js';
import { getMatchSets, getMatchWinner, matchEndedDateKey } from './history.js';

// Finished matches as the results page shows them: one section per day, newest first,
// each match the bracket's card (country tags, names linked to profiles) with its court, phase and length.

export function historyCard(match, players = {}) {
  const sets = getMatchSets(match).map((set) => ({ g1: set.a, g2: set.b, tb: set.tb, stb: Boolean(set.isSuperTB) }));
  const side = getMatchWinner(match);
  const winner = side === 'A' ? match.player_a : (side === 'B' ? match.player_b : '');
  return matchCard({ a: match.player_a, b: match.player_b, sets, winner }, { players, tagMode: 'country', useShort: false });
}

/** `matches` already filtered and sorted newest first; the day order follows them. */
export function resultsByDay(matches = [], players = {}) {
  const days = [];
  const byKey = new Map();
  matches.forEach((match, index) => {
    const key = matchEndedDateKey(match) || 'unknown';
    if (!byKey.has(key)) {
      const day = { key, matches: [] };
      byKey.set(key, day);
      days.push(day);
    }
    byKey.get(key).matches.push({
      key: `${match.id ?? ''}-${match.match_id ?? ''}-${match.ended_ts ?? index}`,
      match,
      card: historyCard(match, players),
    });
  });
  return days;
}
