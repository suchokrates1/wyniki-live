import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHashRoute, buildHashFromState } from './routing.js';

function fakeApp(extra = {}) {
  const calls = [];
  const stub = (name) => () => calls.push(name);
  return {
    calls,
    fetchBracket: stub('fetchBracket'), fetchSchedule: stub('fetchSchedule'), fetchHistory: stub('fetchHistory'),
    fetchInitialData: stub('fetchInitialData'), fetchTournaments: stub('fetchTournaments'), onTournamentSelected: stub('onTournamentSelected'),
    fetchAllPlayers: stub('fetchAllPlayers'), fetchPlayerProfile: stub('fetchPlayerProfile'),
    ...extra,
  };
}

test('a bracket link carries its category and the pinned player both ways', () => {
  const app = fakeApp({ activeTab: 'tournaments', selectedTournamentId: '31', historySubTab: 'bracket', tournamentBracketCategory: 'B3/B4 Men Doubles', bracketPinName: 'Ewan Hayward / Arato Katsuda-Green' });
  const hash = buildHashFromState(app);
  assert.equal(hash, 'tournaments/31/bracket/B3/B4 Men Doubles?pin=Ewan Hayward / Arato Katsuda-Green');

  const back = fakeApp();
  applyHashRoute(back, `#${encodeURIComponent(hash)}`);
  assert.equal(back.selectedTournamentId, '31');
  assert.equal(back.historySubTab, 'bracket');
  assert.equal(back._pendingTournamentCategory, 'B3/B4 Men Doubles');
  assert.equal(back.bracketPinName, 'Ewan Hayward / Arato Katsuda-Green');
});

test('the live bracket keeps its category; other pages drop the pin from the address', () => {
  assert.equal(buildHashFromState({ activeTab: 'live', liveSubTab: 'bracket', bracketCategory: 'B1 Men', bracketPinName: '' }), 'live/bracket/B1 Men');
  assert.equal(buildHashFromState({ activeTab: 'live', liveSubTab: 'schedule', bracketPinName: 'X' }), 'live/schedule');

  const app = fakeApp();
  applyHashRoute(app, '#live%2Fbracket%2FB1%20Men%3Fpin%3DJani%20Kallunki');
  assert.equal(app.liveSubTab, 'bracket');
  assert.equal(app._pendingCategory, 'B1 Men');
  assert.equal(app.bracketPinName, 'Jani Kallunki');

  const plain = fakeApp({ bracketPinName: 'Jani Kallunki' });
  applyHashRoute(plain, '#live%2Fbracket');
  assert.equal(plain.bracketPinName, '');
});
