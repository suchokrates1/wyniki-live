function clock(offsetSec) {
  const started = new Date(Date.now() - offsetSec * 1000).toISOString();
  return {
    seconds: offsetSec,
    running: true,
    offset_seconds: 0,
    started_ts: started,
    finished_ts: null,
    resume_ts: started,
    auto_resume: true,
  };
}

function player(name, extras = {}) {
  return {
    surname: name,
    full_name: name,
    points: extras.points ?? '0',
    set1: extras.set1 ?? 0,
    set2: extras.set2 ?? 0,
    set3: extras.set3 ?? 0,
    current_games: extras.current_games ?? 0,
    flag_url: extras.flag_code ? `https://flagcdn.com/w80/${extras.flag_code.toLowerCase()}.png` : null,
    flag_code: extras.flag_code || null,
    flag_url_partner: extras.flag_code_partner
      ? `https://flagcdn.com/w80/${extras.flag_code_partner.toLowerCase()}.png`
      : null,
    flag_code_partner: extras.flag_code_partner || null,
    flag_lookup_surname: null,
    category: extras.category || null,
  };
}

function court(spec) {
  return {
    court_name: spec.courtName,
    A: spec.A,
    B: spec.B,
    current_set: spec.currentSet,
    super_tiebreak_active: !!spec.superTB,
    serve: spec.serve,
    mode: null,
    tie: spec.tie || { A: 0, B: 0, visible: false, locked: false },
    match_time: clock(spec.clockSec),
    match_status: { active: true, last_completed: null },
    history_meta: { phase: spec.phase, category: spec.category },
    overlay_visible: true,
    sets_detail: spec.setsDetail || [],
    stats: spec.stats || {},
  };
}

/** Four TV-board samples for admin overlay preview (not sent to OBS unless Demo is pushed). */
export const OVERLAY_PREVIEW_MOCKS = [
  court({
    courtName: 'Court 1',
    category: 'Men B2',
    phase: 'Ćwierćfinał',
    currentSet: 2,
    serve: 'A',
    clockSec: 47 * 60 + 12,
    A: player('Dawid Suchodolski', { flag_code: 'PL', category: 'B2', points: '40', set1: 4, set2: 3, current_games: 3 }),
    B: player('James Thompson', { flag_code: 'GB', category: 'B2', points: '30', set1: 2, set2: 2, current_games: 2 }),
    setsDetail: [{ p1: 4, p2: 2, tb: null, stb: false }],
  }),
  court({
    courtName: 'Court 2',
    category: 'Women B1',
    phase: 'Grupowa',
    currentSet: 1,
    serve: 'B',
    clockSec: 18 * 60 + 41,
    A: player('Nowak / Lis', { flag_code: 'PL', flag_code_partner: 'CZ', category: 'B1', points: 'ADV', set1: 3, current_games: 3 }),
    B: player('Kovács / Horváth', { flag_code: 'HU', category: 'B1', points: '40', set1: 3, current_games: 3 }),
    setsDetail: [],
  }),
  court({
    courtName: 'Court 3',
    category: 'Men B3',
    phase: 'Półfinał',
    currentSet: 2,
    serve: 'A',
    clockSec: 61 * 60 + 8,
    A: player('García', { flag_code: 'ES', category: 'B3', points: '6', set1: 4, set2: 4, current_games: 4 }),
    B: player('Schmidt', { flag_code: 'DE', category: 'B3', points: '5', set1: 4, set2: 4, current_games: 4 }),
    setsDetail: [{ p1: 4, p2: 4, tb: 7, stb: false }],
    tie: { A: 6, B: 5, visible: true, locked: false },
  }),
  court({
    courtName: 'Court 4',
    category: 'Men B2',
    phase: 'Finał',
    currentSet: 3,
    serve: 'B',
    superTB: true,
    clockSec: 92 * 60 + 4,
    A: player('González', { flag_code: 'AR', category: 'B2', points: '7', set1: 4, set2: 2, current_games: 0 }),
    B: player('Rossi', { flag_code: 'IT', category: 'B2', points: '4', set1: 1, set2: 4, current_games: 0 }),
    setsDetail: [
      { p1: 4, p2: 1, tb: null, stb: false },
      { p1: 2, p2: 4, tb: null, stb: false },
    ],
    tie: { A: 7, B: 4, visible: true, locked: false },
  }),
];

export function previewMockCourt(courtToken) {
  const n = Number.parseInt(String(courtToken ?? '1'), 10);
  const idx = Number.isFinite(n) && n > 0 ? (n - 1) % OVERLAY_PREVIEW_MOCKS.length : 0;
  return OVERLAY_PREVIEW_MOCKS[idx];
}

export function courtLooksEmpty(court) {
  if (!court || typeof court !== 'object') return true;
  if (court.match_status?.active) return false;
  const a = court.A || {};
  const b = court.B || {};
  const nameA = String(a.surname || a.full_name || '').trim();
  const nameB = String(b.surname || b.full_name || '').trim();
  const emptyName = (name) => !name || name === '-' || name === '—';
  return emptyName(nameA) && emptyName(nameB);
}
