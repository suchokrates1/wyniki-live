import assert from 'node:assert/strict';
import test from 'node:test';

import {
  courtStreamsPayload,
  fillSharedFromCourts,
  isStreamCourtOn,
  isStreamToday,
  normalizeCourtStreams,
  setSharedStreamUrl,
  setStreamUrl,
  sharedStreamUrl,
  streamUrl,
  toggleStreamCourtOn,
} from './courtStreams.js';

const payload = () => ({
  days: ['2026-09-26', '2026-09-27'],
  today: '2026-09-26',
  courts: [{ kort_id: 't32-1' }, { kort_id: 't32-2' }],
  links: { '2026-09-26': { 't32-1': 'https://youtu.be/a' } },
  shared: {},
  off_courts: [3],
  shared_all_courts: false,
});

test('whatever the API sends, the editor gets every part of the shape', () => {
  const { streams, sharedAll } = normalizeCourtStreams({});
  assert.deepEqual(streams, { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] });
  assert.equal(sharedAll, false);
  assert.deepEqual(normalizeCourtStreams(payload()).streams.off_courts, ['3'], 'court ids are compared as text');
});

test('a link is set for one day and court and read back', () => {
  const { streams } = normalizeCourtStreams(payload());
  assert.equal(streamUrl(streams, '2026-09-26', 't32-1'), 'https://youtu.be/a');
  assert.equal(streamUrl(streams, '2026-09-27', 't32-1'), '');
  setStreamUrl(streams, '2026-09-27', 't32-2', 'https://youtu.be/b');
  assert.equal(streamUrl(streams, '2026-09-27', 't32-2'), 'https://youtu.be/b');
  setSharedStreamUrl(streams, '2026-09-27', 'https://youtu.be/hall');
  assert.equal(sharedStreamUrl(streams, '2026-09-27'), 'https://youtu.be/hall');
});

test('a court can be switched off and back on', () => {
  const { streams } = normalizeCourtStreams(payload());
  assert.ok(isStreamCourtOn(streams, 't32-1'));
  toggleStreamCourtOn(streams, 't32-1');
  assert.ok(!isStreamCourtOn(streams, 't32-1'));
  toggleStreamCourtOn(streams, 't32-1');
  assert.ok(isStreamCourtOn(streams, 't32-1'));
});

test('one link for all courts starts each day from the first link that day had', () => {
  const { streams } = normalizeCourtStreams(payload());
  fillSharedFromCourts(streams);
  assert.equal(streams.shared['2026-09-26'], 'https://youtu.be/a');
  assert.equal(streams.shared['2026-09-27'], '', 'a day with no links starts empty');
  streams.shared['2026-09-26'] = 'https://youtu.be/typed';
  fillSharedFromCourts(streams);
  assert.equal(streams.shared['2026-09-26'], 'https://youtu.be/typed', 'a link already typed is kept');
});

test('today is the day the server says it is, and saving sends the whole editor', () => {
  const { streams } = normalizeCourtStreams(payload());
  assert.ok(isStreamToday(streams, '2026-09-26'));
  assert.ok(!isStreamToday(streams, '2026-09-27'));
  assert.deepEqual(Object.keys(courtStreamsPayload(streams, true)).sort(), ['links', 'off_courts', 'shared', 'shared_all_courts']);
  assert.equal(courtStreamsPayload(streams, 1).shared_all_courts, true);
});
