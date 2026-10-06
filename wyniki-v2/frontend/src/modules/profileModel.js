import { matchCard } from './bracketCards.js';
import { competitorKey } from './knockoutLayout.js';

// The player profile as the page shows it: tiles, each tournament with the way through it and
// its matches as the same cards the bracket uses (her row first, the opponent linked), and
// head-to-head records across every tournament.

const GROUP = /grup|group|gruppe|girone|grupo|groupe|grupė/i;

export function isGroupPhase(phase) {
  return !phase || GROUP.test(String(phase));
}

function setsOf(score = []) {
  let won = 0;
  let lost = 0;
  (score || []).forEach((set) => {
    if (Number(set.g1) > Number(set.g2)) won += 1;
    else if (Number(set.g2) > Number(set.g1)) lost += 1;
  });
  return [won, lost];
}

function profileHrefFor(id) {
  return id ? `#players/global/${id}` : '';
}

function card(selfName, match) {
  const opponent = String(match?.opponent || '').trim();
  const players = {
    [opponent]: { global_player_id: match?.opponent_global_id || null, country: match?.opponent_country || '' },
  };
  const built = matchCard({ a: selfName, b: opponent, sets: match?.score || [], winner: match?.won ? selfName : opponent }, {
    players, tagMode: 'country', useShort: false,
  });
  // her own row is never a link to the page she is on
  built.rows[0].href = '';
  return built;
}

function result(tournament) {
  if (tournament?.medal && ['gold', 'silver', 'bronze'].includes(tournament.medal)) return { kind: 'medal', medal: tournament.medal };
  if (tournament?.knockout_phase) return { kind: 'phase', phase: tournament.knockout_phase };
  if (tournament?.group_name && tournament?.group_position) {
    return { kind: 'group', group: tournament.group_name, place: tournament.group_position, of: tournament.group_total };
  }
  return { kind: 'none' };
}

/** The way through one tournament: the group and where she finished, then each knockout match. */
export function tournamentPath(tournament) {
  const steps = [];
  if (tournament?.group_name) {
    steps.push({ kind: 'group', phase: tournament.group_name, place: tournament.group_position, won: null });
  }
  (tournament?.matches || []).forEach((match) => {
    if (isGroupPhase(match.phase)) return;
    steps.push({ kind: 'knockout', phase: match.phase, won: Boolean(match.won) });
  });
  return steps;
}

export function rivalsOf(profile, limit = 8) {
  const byKey = new Map();
  (profile?.tournaments || []).forEach((tournament) => (tournament.matches || []).forEach((match) => {
    const name = String(match.opponent || '').trim();
    if (!name) return;
    const key = competitorKey(name);
    const entry = byKey.get(key) || { name, wins: 0, losses: 0, href: '', country: '' };
    if (match.won) entry.wins += 1;
    else entry.losses += 1;
    entry.href = entry.href || profileHrefFor(match.opponent_global_id);
    entry.country = entry.country || match.opponent_country || '';
    byKey.set(key, entry);
  }));
  return [...byKey.values()]
    .map((entry) => ({ ...entry, played: entry.wins + entry.losses, tone: entry.wins > entry.losses ? 'won' : (entry.wins < entry.losses ? 'lost' : 'even') }))
    .sort((left, right) => right.played - left.played || left.name.localeCompare(right.name))
    .slice(0, limit);
}

export function buildProfileView(profile) {
  if (!profile?.player) return null;
  const self = profile.player.full_name || [profile.player.first_name, profile.player.last_name].filter(Boolean).join(' ');
  const tournaments = (profile.tournaments || []).map((tournament, index) => {
    const matches = tournament.matches || [];
    return {
      id: tournament.tournament_id,
      name: tournament.tournament_name,
      city: tournament.city || '',
      start: tournament.start_date || '',
      end: tournament.end_date || '',
      category: tournament.category_label || '',
      open: index === 0,
      result: result(tournament),
      wins: tournament.wins ?? matches.filter((match) => match.won).length,
      losses: tournament.losses ?? matches.filter((match) => !match.won).length,
      path: tournamentPath(tournament),
      matches: matches.map((match, matchIndex) => ({
        key: `${tournament.tournament_id}-${matchIndex}`,
        phase: match.phase,
        date: match.date,
        duration: match.duration || 0,
        won: Boolean(match.won),
        card: card(self, match),
      })),
    };
  });

  let setsWon = 0;
  let setsLost = 0;
  (profile.tournaments || []).forEach((tournament) => (tournament.matches || []).forEach((match) => {
    const [won, lost] = setsOf(match.score);
    setsWon += won;
    setsLost += lost;
  }));
  const career = profile.career || {};
  const played = (career.wins || 0) + (career.losses || 0);

  return {
    name: self,
    initials: `${profile.player.first_name?.[0] || ''}${profile.player.last_name?.[0] || ''}`,
    photo: profile.player.photo_url || '',
    country: profile.player.country || '',
    medals: career.medals || { gold: 0, silver: 0, bronze: 0 },
    tiles: {
      tournaments: career.tournaments || 0,
      matches: career.matches || 0,
      record: `${career.wins || 0}–${career.losses || 0}`,
      sets: `${setsWon}–${setsLost}`,
      winRate: played ? Math.round(((career.wins || 0) / played) * 100) : null,
    },
    tournaments,
    rivals: rivalsOf(profile),
    medalsByCategory: career.medals_by_category || [],
  };
}
