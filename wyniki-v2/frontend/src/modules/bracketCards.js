import { knockoutSlotWinner, groupMatchWinner } from './bracket.js';
import { competitorKey } from './knockoutLayout.js';
import { isPendingCompetitorName } from '../shared/labelDisplay.js';

// One match card for every place a match is shown: the tree, a group's matches, results, a profile.
// Two rows: tag (seed or country), name (a link to the global profile when the player is known),
// the sets. The winner's row is bold; a tie-break's points sit on the loser's games of that set.

const PAIR = /\s*\/\s*/;

export function isDecidedName(name) {
  const text = String(name || '').trim();
  return Boolean(text) && !isPendingCompetitorName(text);
}

/** "J. Kallunki" for one player, surnames for a pair: the tree has room for no more. */
export function shortName(name) {
  const text = String(name || '').trim();
  if (!isDecidedName(text)) return text;
  const people = text.split(PAIR);
  if (people.length > 1) return people.map((person) => person.split(' ').pop()).join(' / ');
  const parts = text.split(' ');
  return parts.length < 2 ? text : `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
}

/** "Grupa A" → "A"; a category with one group has no letter. */
export function groupLetter(groupName) {
  const tail = String(groupName || '').split(' — ').pop().trim();
  const match = tail.match(/(?:^|\s)([A-Z])$/);
  return match ? match[1] : '';
}

/** Where each competitor finished in their group: "A1", "E2". */
export function seedMap(groups = []) {
  const seeds = new Map();
  groups.forEach((group) => {
    const letter = groupLetter(group.name);
    (group.standings || []).forEach((row, index) => {
      if (row?.name && !row._placeholder) seeds.set(competitorKey(row.name), `${letter}${index + 1}`);
    });
  });
  return seeds;
}

export function profileHref(name, players = {}) {
  const entry = players?.[String(name || '').trim()];
  if (entry?.global_player_id) return `#players/global/${entry.global_player_id}`;
  if (entry?.player_id) return `#players/${entry.player_id}`;
  return '';
}

export function countryOf(name, players = {}) {
  const text = String(name || '').trim();
  const people = text.split(PAIR);
  const codes = people.map((person) => players?.[person]?.country || '').filter(Boolean);
  if (!codes.length) return players?.[text]?.country || '';
  return [...new Set(codes)].join('/');
}

function games(mine, theirs) {
  return mine.map((value, index) => {
    const other = theirs[index] || {};
    const won = Number(value.g) > Number(other.g);
    const lost = Number(value.g) < Number(other.g);
    return {
      v: value.g,
      tb: lost && !value.stb && value.tb !== null && value.tb !== undefined ? String(value.tb) : '',
      won,
      stb: !!value.stb,
    };
  });
}

function sides(sets = []) {
  const list = Array.isArray(sets) ? sets : [];
  return [
    list.map((set) => ({ g: set.g1, tb: set.tb, stb: set.stb })),
    list.map((set) => ({ g: set.g2, tb: set.tb, stb: set.stb })),
  ];
}

function row(name, winnerKey, ctx, own, other) {
  const key = competitorKey(name);
  const decided = isDecidedName(name);
  return {
    key,
    name: String(name || '').trim(),
    short: ctx.useShort ? shortName(name) : String(name || '').trim(),
    tag: ctx.tagMode === 'country' ? countryOf(name, ctx.players) : (ctx.seeds?.get(key) || ''),
    href: decided ? profileHref(name, ctx.players) : '',
    decided,
    won: Boolean(winnerKey) && key === winnerKey,
    pinned: Boolean(ctx.pinKey) && key === ctx.pinKey,
    bye: false,
    games: games(own, other),
  };
}

/** A match as two rows. `a`/`b` are names, `sets` as the API sends them ({g1, g2, tb, stb}). */
export function matchCard({ a, b, sets, winner }, ctx = {}) {
  const decidedWinner = isDecidedName(a) && isDecidedName(b) && (winner === a || winner === b) ? winner : '';
  const winnerKey = decidedWinner ? competitorKey(decidedWinner) : '';
  const [setsA, setsB] = sides(sets);
  const rows = [row(a, winnerKey, ctx, setsA, setsB), row(b, winnerKey, ctx, setsB, setsA)];
  return {
    rows,
    winnerKey,
    keys: rows.map((entry) => entry.key).filter(Boolean),
    pinned: rows.some((entry) => entry.pinned),
    played: Array.isArray(sets) && sets.length > 0,
  };
}

export function slotCard(slot, ctx) {
  return matchCard({ a: slot?.player1, b: slot?.player2, sets: slot?.sets, winner: knockoutSlotWinner(slot) }, ctx);
}

export function groupMatchCard(match, ctx) {
  return matchCard({ a: match?.player_a, b: match?.player_b, sets: match?.sets, winner: groupMatchWinner(match) }, ctx);
}

/** A player who skipped a round: one real row and an empty one. */
export function byeCard(player, ctx = {}) {
  const key = competitorKey(player);
  const first = row(player, key, ctx, [], []);
  return {
    rows: [first, { key: '', name: '', short: '', tag: '', href: '', decided: false, won: false, pinned: false, bye: true, games: [] }],
    winnerKey: key,
    keys: [key],
    pinned: first.pinned,
    played: false,
    bye: true,
  };
}

/** A group's table and matches; `qualified` says who went on to the main draw. */
export function groupView(group, ctx, { qualified = () => false, reachOf = () => null } = {}) {
  const standings = (group?.standings || []).filter((entry) => entry?.name && !entry._placeholder);
  return {
    name: group?.name || '',
    letter: groupLetter(group?.name),
    rows: standings.map((entry, index) => {
      const key = competitorKey(entry.name);
      return {
        key,
        pos: index + 1,
        name: entry.name,
        href: profileHref(entry.name, ctx.players),
        country: countryOf(entry.name, ctx.players),
        qualifies: qualified(key, index),
        wl: `${entry.wins ?? 0}–${entry.losses ?? 0}`,
        sets: `${entry.sets_won ?? 0}:${entry.sets_lost ?? 0}`,
        games: `${entry.games_won ?? 0}:${entry.games_lost ?? 0}`,
        reach: reachOf(key),
        pinned: Boolean(ctx.pinKey) && key === ctx.pinKey,
      };
    }),
    matches: (group?.matches || []).map((match) => groupMatchCard(match, { ...ctx, tagMode: 'country', useShort: false })),
  };
}
