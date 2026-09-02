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
  settingsLanguage: 'select_language',
  appearance: 'appearance',
  theme: 'theme',
  themeLight: 'theme_light',
  themeDark: 'theme_dark',
  themeSystem: 'theme_system',
  matchHistory: 'match_history_title',
  openMatchHistory: 'open_match_history',
  historyEmpty: 'no_matches_saved',
  confirmDeleteMatch: 'confirm_delete_match',
  confirmDeleteAllMatches: 'confirm_delete_all_matches',
  deleteAll: 'delete_all_matches',
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
  available: 'court_available',
  courtName: 'court_name',
  emptyCourts: 'no_courts_available',
  emptyTournaments: 'no_tournaments_available',
  playersTitle: 'select_players',
  singles: 'match_type_singles',
  doubles: 'doubles_checkbox',
  gameTypeSingles: 'game_type_singles',
  searchPlayers: 'search_players',
  addPlayer: 'add_player',
  firstName: 'player_first_name',
  lastName: 'player_last_name',
  country: 'player_country',
  savePlayer: 'save',
  next: 'next',
  suggestion: 'suggested_match_title',
  applySuggestion: 'suggested_match_use',
  chooseManually: 'suggested_match_manual',
  selectedCount: 'selected_info',
  configTitle: 'match_config_title',
  umpireName: 'match_config_umpire_hint',
  manualTime: 'match_config_manual_datetime_title',
  manualTimeEmpty: 'match_config_manual_datetime_empty',
  setTime: 'match_config_set_datetime',
  clearTime: 'match_config_clear_datetime',
  gamesPerSet: 'match_config_games_per_set',
  setsToWin: 'match_config_sets_to_win',
  tiebreak: 'match_config_tiebreak_to',
  superTiebreak: 'match_config_super_tiebreak_to',
  noAdvantage: 'no_advantage_mode',
  noAdvantageDesc: 'no_advantage_desc',
  tiebreakOnly: 'match_config_tb_only',
  tiebreakOnlyDesc: 'match_config_tb_only_desc',
  basic: 'stats_mode_basic',
  advanced: 'stats_mode_advanced',
  basicHint: 'stats_mode_basic_short',
  advancedHint: 'stats_mode_advanced_short',
  serveTitle: 'who_serves_first',
  mixed: 'match_type_mixed',
  loading: 'loading',
  error: 'error',
  back: 'back',
  undo: 'undo',
  finish: 'finish',
  finishMatch: 'finish_match',
  confirmUndo: 'confirm_undo',
  yes: 'yes',
  no: 'no',
  ok: 'ok',
  leaveTitle: 'confirm_exit_title',
  leaveMessage: 'confirm_exit_message',
  swapSides: 'swap_sides',
  playerServes: 'player_serves',
  firstServe: 'first_serve',
  secondServe: 'second_serve',
  secondServeButton: 'second_serve_button',
  doubleFaultButton: 'double_fault_button',
  win: 'win_point',
  continue: 'continue_btn',
  skipSides: 'dont_change_sides',
  announceSideChange: 'announce_side_change',
  announceSideChangeMsg: 'announce_side_change_msg',
  announceTiebreak: 'announce_tiebreak',
  announceTiebreakMsg: 'announce_tiebreak_msg',
  announceSuperTiebreak: 'announce_super_tiebreak',
  announceSuperTiebreakMsg: 'announce_super_tiebreak_msg',
  announceDecidingPoint: 'deciding_point',
  announceDecidingPointMsg: 'deciding_point_msg',
  matchFinished: 'match_finished_title',
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
  umpireMeta: 'match_metadata_umpire',
  aces: 'aces',
  doubleFaults: 'double_faults',
  winnersStat: 'winners_stat',
  unforcedErrors: 'unforced_errors_stat',
  firstServePct: 'first_serve_pct',
  matchTitle: 'match',
  scoreboardPlayer: 'scoreboard_player',
  scoreboardPoints: 'scoreboard_points',
  scoreboardSet1: 'scoreboard_set1',
  scoreboardSet2: 'scoreboard_set2',
  tiebreakMode: 'tiebreak_mode',
  superTiebreakMode: 'super_tiebreak_mode',
  bracketWarningTitle: 'bracket_warning_title',
  bracketWarningDifferentGroups: 'bracket_warning_different_groups',
  bracketWarningFriendly: 'bracket_warning_friendly',
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
  const re = /<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
  let match;
  while ((match = re.exec(xml))) {
    out[match[1]] = match[2]
      .replaceAll("\\'", "'")
      .replaceAll('\\n', '\n')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  return out;
}

function formatValue(key, raw) {
  let value = raw;
  if (key === 'announceTiebreakMsg') {
    return value.replaceAll('%1$d', '{games}').replace('%2$d', '{points}');
  }
  if (key === 'announceSuperTiebreakMsg') {
    return value.replaceAll('%1$d', '{sets}').replace('%2$d', '{points}');
  }
  if (key === 'selectedCount') {
    return value.replace('%1$d', '{count}').replace('%2$d', '{total}');
  }
  if (key === 'pinMessage') {
    return value.replace('%1$s', '{court}');
  }
  if (key === 'tiebreakMode' || key === 'superTiebreakMode' || key === 'tiebreak' || key === 'superTiebreak') {
    return value.replace('%1$d', '{points}');
  }
  return value
    .replaceAll('%1$s', '{name}')
    .replaceAll('%1$d', '{count}')
    .replaceAll('%2$d', '{total}')
    .replaceAll('%2$s', '{extra}');
}

const langs = ['de', 'en', 'es', 'fr', 'it', 'lt', 'pl'];
const fallback = {
  ...parseAndroid(path.join(ANDROID_RES, 'values', 'strings.xml')),
  ...parseAndroid(path.join(ANDROID_RES, 'values-en', 'strings.xml')),
};
const result = {};
for (const lang of langs) {
  const file = lang === 'en'
    ? path.join(ANDROID_RES, 'values-en', 'strings.xml')
    : path.join(ANDROID_RES, `values-${lang}`, 'strings.xml');
  const android = { ...fallback, ...parseAndroid(file) };
  const mapped = {};
  for (const [ours, theirs] of Object.entries(MAP)) {
    if (android[theirs]) mapped[ours] = formatValue(ours, android[theirs]);
  }
  if (mapped.playerServes) mapped.playerServes = mapped.playerServes.replace(/\s+/g, ' ').trim();
  result[lang] = mapped;
}

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log('wrote', OUT);
for (const lang of langs) {
  console.log(lang, Object.keys(result[lang]).length, result[lang].languageTitle, result[lang].singles);
}
