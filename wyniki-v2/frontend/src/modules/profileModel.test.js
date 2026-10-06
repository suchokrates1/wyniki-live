import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileView, isGroupPhase, rivalsOf, tournamentPath } from './profileModel.js';

// Rafał Sudoł's real profile, Wilno 2026 and Leszno 2026, as the API sends it after the fixes.
const sudol = {
  player: { full_name: 'Rafał Sudoł', first_name: 'Rafał', last_name: 'Sudoł', country: 'PL', category: 'B1', gender: 'M', age: 44, photo_url: '' },
  career: { tournaments: 2, matches: 8, wins: 4, losses: 4, medals: { gold: 1, silver: 0, bronze: 0 }, medals_by_category: [{ category: 'B1', gold: 1, silver: 0, bronze: 0 }] },
  tournaments: [
    {
      tournament_id: 31, tournament_name: 'IBTA World Blind Tennis Championships 2026', city: 'Vilnius', start_date: '2026-08-25', end_date: '2026-08-29',
      category_label: 'B1 Men', group_name: 'B1 Men — Grupa A', group_position: 3, group_total: 3, medal: null, knockout_phase: null, wins: 2, losses: 3,
      matches: [
        { opponent: 'Naqi Rizvi', opponent_global_id: 140, opponent_country: 'GB', won: false, phase: 'Grupowa', score: [{ g1: 4, g2: 5, tb: 3 }, { g1: 4, g2: 5, tb: 1 }] },
        { opponent: 'Hideki Furuya', opponent_global_id: 150, opponent_country: 'JP', won: true, phase: 'B1 Men — 06 Consolation Ćwierćfinał', score: [{ g1: 4, g2: 1 }, { g1: 4, g2: 1 }] },
        { opponent: 'Roberto Rivas', opponent_global_id: null, opponent_country: 'AR', won: false, phase: 'Grupowa', score: [{ g1: 4, g2: 5, tb: 5 }, { g1: 2, g2: 4 }] },
        { opponent: 'Sławomir Tolak-Ciszewski', opponent_global_id: 112, opponent_country: 'PL', won: true, phase: 'B1 Men — 07 Consolation Półfinał', score: [{ g1: 5, g2: 4, tb: 3 }, { g1: 4, g2: 2 }] },
        { opponent: 'Luca Parravano', opponent_global_id: 160, opponent_country: 'IT', won: false, phase: 'B1 Men — Consolation Finał', score: [{ g1: 4, g2: 5, tb: 1 }, { g1: 5, g2: 4, tb: 5 }, { g1: 7, g2: 10, stb: true }] },
      ],
    },
    {
      tournament_id: 25, tournament_name: 'III Mistrzostwa Polski w Blind Tenisie', city: 'Leszno', start_date: '2026-05-23', end_date: '2026-05-24',
      category_label: '', group_name: 'B1 Mężczyźni', group_position: 1, group_total: 3, medal: 'gold', knockout_phase: 'B1 Mężczyźni — Finał', wins: 2, losses: 1,
      matches: [
        { opponent: 'Łukasz Chmielewski', opponent_global_id: 113, opponent_country: 'PL', won: true, phase: 'Grupowa', score: [{ g1: 5, g2: 4 }, { g1: 5, g2: 4 }] },
        { opponent: 'Sławomir Tolak-Ciszewski', opponent_global_id: 112, opponent_country: 'PL', won: false, phase: 'Grupowa', score: [{ g1: 4, g2: 5, tb: 4 }, { g1: 5, g2: 4, tb: 5 }, { g1: 6, g2: 10, stb: true }] },
        { opponent: 'Sławomir Tolak-Ciszewski', opponent_global_id: 112, opponent_country: 'PL', won: true, phase: 'B1 Mężczyźni — Finał', score: [{ g1: 5, g2: 3 }, { g1: 2, g2: 4 }, { g1: 10, g2: 6, stb: true }] },
      ],
    },
  ],
};

test('group phases are told apart from knockout rounds in every language the data uses', () => {
  assert.equal(isGroupPhase('Grupowa'), true);
  assert.equal(isGroupPhase('B1 Men — Grupa A'), true);
  assert.equal(isGroupPhase(''), true);
  assert.equal(isGroupPhase('B1 Men — 07 Consolation Półfinał'), false);
});

test('the way through a tournament: the group, then each knockout match won or lost', () => {
  assert.deepEqual(tournamentPath(sudol.tournaments[0]).map((step) => [step.kind, step.phase, step.won]), [
    ['group', 'B1 Men — Grupa A', null],
    ['knockout', 'B1 Men — 06 Consolation Ćwierćfinał', true],
    ['knockout', 'B1 Men — 07 Consolation Półfinał', true],
    ['knockout', 'B1 Men — Consolation Finał', false],
  ]);
});

test('head to head across tournaments, most played first', () => {
  const rivals = rivalsOf(sudol);
  assert.deepEqual(rivals[0], { name: 'Sławomir Tolak-Ciszewski', wins: 2, losses: 1, href: '#players/global/112', country: 'PL', played: 3, tone: 'won' });
  assert.equal(rivals.find((rival) => rival.name === 'Roberto Rivas').href, '');
});

test('the profile view: tiles, her row first and unlinked, the opponent linked', () => {
  const view = buildProfileView(sudol);
  assert.deepEqual(view.tiles, { tournaments: 2, matches: 8, record: '4–4', sets: '10–9', winRate: 50 });
  assert.equal(view.initials, 'RS');
  const [wilno, leszno] = view.tournaments;
  assert.equal(wilno.open, true);
  assert.equal(leszno.open, false);
  assert.deepEqual(wilno.result, { kind: 'group', group: 'B1 Men — Grupa A', place: 3, of: 3 });
  assert.deepEqual(leszno.result, { kind: 'medal', medal: 'gold' });
  const first = wilno.matches[0].card;
  assert.equal(first.rows[0].name, 'Rafał Sudoł');
  assert.equal(first.rows[0].href, '');
  assert.equal(first.rows[1].href, '#players/global/140');
  assert.equal(first.rows[1].tag, 'GB');
  assert.equal(first.rows[1].won, true);
  assert.deepEqual(first.rows[0].games.map((game) => `${game.v}${game.tb ? `(${game.tb})` : ''}`), ['4(3)', '4(1)']);
});
