import assert from 'node:assert/strict';
import test from 'node:test';
import { StatsMode } from './match-engine/models.js';
import { buildMatchConfig, DEFAULT_MATCH_CONFIG_FORM, startDraft } from './matchConfigForm.js';

test('default form matches Android dialog defaults', () => {
  const config = buildMatchConfig(DEFAULT_MATCH_CONFIG_FORM, StatsMode.BASIC);
  assert.equal(config.gamesPerSet, 4);
  assert.equal(config.setsToWin, 2);
  assert.equal(config.tiebreakPoints, 7);
  assert.equal(config.superTiebreakPoints, 10);
  assert.equal(config.tiebreakOnly, false);
  assert.equal(config.statsMode, StatsMode.BASIC);
});

test('tiebreak-only uses STB points and one set', () => {
  const config = buildMatchConfig({
    ...DEFAULT_MATCH_CONFIG_FORM,
    tiebreakOnly: true,
    tbOnlyPoints: 7,
    noAdvantage: true,
  }, StatsMode.ADVANCED);
  assert.equal(config.tiebreakOnly, true);
  assert.equal(config.setsToWin, 1);
  assert.equal(config.superTiebreakPoints, 7);
  assert.equal(config.noAdvantage, true);
  assert.equal(config.statsMode, StatsMode.ADVANCED);
});

test('startDraft stores players and TB-only flag for serve screen', () => {
  const config = buildMatchConfig({ ...DEFAULT_MATCH_CONFIG_FORM, tiebreakOnly: true }, StatsMode.BASIC);
  const draft = startDraft({
    selectedPlayers: [
      { id: 1, first_name: 'Jan', last_name: 'Kowalski', name: 'Jan Kowalski' },
      { id: 2, first_name: 'Adam', last_name: 'Nowak', name: 'Adam Nowak' },
    ],
    isDoubles: false,
    courtId: 't31-1',
    courtName: 'Kort 1',
    config,
    umpireName: '  Anna  ',
  });
  assert.equal(draft.players.length, 2);
  assert.equal(draft.umpireName, 'Anna');
  assert.equal(draft.startInSuperTiebreak, true);
  assert.equal(draft.matchConfig.tiebreakOnly, true);
});
