import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ANDROID_RES = path.resolve(
  'C:/Users/sucho/Vest Tennis/android-tennis-referee/app/src/main/res',
);
const OUT = path.resolve('src/umpire/i18nAndroid.json');

const MAP = {
  appName: 'app_name',
  languageTitle: 'select_language',
  tournamentTitle: 'select_tournament',
  courtTitle: 'select_court',
  pinTitle: 'court_pin_title',
  pinMessage: 'court_pin_message',
  pinInvalid: 'pin_invalid',
  pinBack: 'back',
  cancel: 'cancel',
  refresh: 'refresh',
  settings: 'settings',
  settingsLanguage: 'change_language',
  appearance: 'appearance',
  theme: 'theme',
  themeLight: 'theme_light',
  themeDark: 'theme_dark',
  themeSystem: 'theme_system',
  matchHistory: 'match_history_title',
  confirmDeleteMatch: 'confirm_delete_match',
  confirmDeleteAllMatches: 'confirm_delete_all_matches',
  diagnostics: 'diagnostics',
  diagnosticsAppVersion: 'diagnostics_app_version',
  diagnosticsBackend: 'diagnostics_backend',
  diagnosticsDevice: 'diagnostics_device',
  diagnosticsLocale: 'diagnostics_locale',
  diagnosticsTimezone: 'diagnostics_timezone',
  diagnosticsSyncStatus: 'diagnostics_sync_status',
  diagnosticsLastUpdate: 'diagnostics_last_update',
  diagnosticsLastError: 'diagnostics_last_error',
  diagnosticsNoError: 'diagnostics_no_error',
  diagnosticsNever: 'diagnostics_never',
  diagnosticsCopy: 'diagnostics_copy',
  diagnosticsCopied: 'diagnostics_copied',
  occupied: 'court_occupied',
  emptyCourts: 'no_courts_available',
  emptyTournaments: 'no_tournaments_available',
  playersTitle: 'select_players',
  singles: 'doubles_checkbox',
  doubles: 'doubles',
  searchPlayers: 'search_players',
  addPlayer: 'add_player',
  firstName: 'player_first_name',
  lastName: 'player_last_name',
  country: 'player_country',
  savePlayer: 'save',
  next: 'next',
  suggestion: 'suggested_match_title',
  applySuggestion: 'suggested_match_use',
  configTitle: 'match_config_title',
  umpireName: 'umpire_name',
  gamesPerSet: 'games_per_set',
  setsToWin: 'sets_to_win',
  tiebreak: 'tiebreak_points',
  superTiebreak: 'super_tiebreak_points',
  noAdvantage: 'no_advantage',
  tiebreakOnly: 'tiebreak_only',
  basic: 'stats_mode_basic',
  advanced: 'stats_mode_advanced',
  serveTitle: 'who_serves_first',
  mixed: 'mixed_doubles',
  loading: 'loading',
  error: 'error',
  back: 'back',
  undo: 'undo',
  finish: 'finish',
  confirmUndo: 'confirm_undo',
  yes: 'yes',
  no: 'no',
  ok: 'ok',
  leaveTitle: 'leave_match_title',
  leaveMessage: 'leave_match_message',
  swapSides: 'swap_sides',
  playerServes: 'player_serves',
  firstServe: 'first_serve',
  secondServe: 'second_serve',
  secondServeButton: 'second_serve_button',
  doubleFaultButton: 'double_fault_button',
  win: 'win_point',
  continue: 'continue_game',
  skipSides: 'skip_side_change',
  announceSideChange: 'change_sides',
  announceSideChangeMsg: 'change_sides_message',
  announceTiebreak: 'tiebreak_announcement',
  announceTiebreakMsg: 'tiebreak_announcement_message',
  announceSuperTiebreak: 'super_tiebreak_announcement',
  announceSuperTiebreakMsg: 'super_tiebreak_announcement_message',
  announceDecidingPoint: 'deciding_point',
  announceDecidingPointMsg: 'deciding_point_message',
  matchFinished: 'match_finished',
  winnerLabel: 'winner_label',
  nextSame: 'next_match_same_setup',
  nextNew: 'next_match_new_setup',
  finishPrompt: 'finish_reason_prompt',
  finishNormal: 'finish_reason_normal',
  finishTest: 'finish_reason_test',
  finishRetirement: 'finish_reason_retirement',
  finishWalkover: 'finish_reason_walkover',
  finishRetirementPrompt: 'who_retired',
  finishWalkoverPrompt: 'who_wins_walkover',
  syncIdle: 'sync_status_idle',
  syncSyncing: 'sync_status_syncing',
  syncSynced: 'sync_status_synced',
  syncFailed: 'sync_status_failed',
  syncOffline: 'sync_status_offline',
  matchTypeSingles: 'match_type_singles',
  matchTypeDoubles: 'match_type_doubles',
  matchTypeMixed: 'match_type_mixed',
  aces: 'aces',
  doubleFaults: 'double_faults',
  winnersStat: 'winners_stat',
  unforcedErrors: 'unforced_errors_stat',
  firstServePct: 'first_serve_percentage',
  matchTitle: 'match',
  ace: 'ace',
  fault: 'fault',
  footFault: 'foot_fault',
  ballInPlay: 'ball_in_play',
  winner: 'winner',
  forcedError: 'forced_error',
  unforcedError: 'unforced_error',
};

function parseAndroid(file) {
  const xml = readFileSync(file, 'utf8');
  const out = {};
  const re = /<string name="([^"]+)">([\s\S]*?)<\/string>/g;
  let match;
  while ((match = re.exec(xml))) {
    out[match[1]] = match[2]
      .replaceAll('\\n', ' ')
      .replaceAll("\\'", "'")
      .replaceAll('%1$s', '{name}')
      .replaceAll('%1$d', '{count}')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  return out;
}

const langs = ['de', 'en', 'es', 'fr', 'it', 'lt', 'pl'];
const result = {};
for (const lang of langs) {
  const file = lang === 'en'
    ? path.join(ANDROID_RES, 'values-en', 'strings.xml')
    : path.join(ANDROID_RES, `values-${lang}`, 'strings.xml');
  const android = parseAndroid(file);
  const mapped = {};
  for (const [ours, theirs] of Object.entries(MAP)) {
    if (android[theirs]) mapped[ours] = android[theirs];
  }
  if (mapped.pinMessage) mapped.pinMessage = mapped.pinMessage.replace('{name}', '{court}');
  if (mapped.playerServes) mapped.playerServes = mapped.playerServes.replace(/\s+/g, ' ').trim();
  result[lang] = mapped;
}

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
for (const lang of langs) {
  console.log(lang, Object.keys(result[lang]).length);
}
