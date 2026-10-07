import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeriesMarkView, seriesLine, seriesOf } from './seriesMark.js';

const TWT = { id: 1, name: 'Takei World Tennis Tour', logo_path: '/data/series-logos/twt-1.png', tier: 'CH50' };

test('a tournament of a series carries its name and rank; one outside carries nothing', () => {
  assert.equal(seriesOf({ series: [TWT] }), TWT);
  assert.equal(seriesOf({ series: [] }), null);
  assert.equal(seriesOf({}), null);
  assert.equal(seriesLine(TWT), 'Takei World Tennis Tour · Challenger 50');
  assert.equal(seriesLine({ name: 'Other Tour', tier: '' }), 'Other Tour');
  assert.equal(seriesLine(null), '');
});

test('the open tournament and the live one find their series', () => {
  const view = { ...createSeriesMarkView(), tournaments: [{ id: 28, series: [TWT] }, { id: 29, series: [] }], selectedTournamentId: '28' };
  assert.equal(view.selectedTournamentSeries(), TWT);
  view.selectedTournamentId = '29';
  assert.equal(view.selectedTournamentSeries(), null);
  assert.equal(view.liveSeries(), null);
  view.tournamentSeries = [TWT];
  assert.equal(view.liveSeries(), TWT);
});
