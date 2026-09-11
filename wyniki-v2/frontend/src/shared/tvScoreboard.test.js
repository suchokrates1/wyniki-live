import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeTvHtml, renderTvScoreboard, tvFlagSpans } from './tvScoreboard.js';

test('escapeTvHtml encodes markup and quotes', () => {
  assert.equal(escapeTvHtml('A <b>X</b> & "Y"'), 'A &lt;b&gt;X&lt;/b&gt; &amp; &quot;Y&quot;');
});

test('visual TV HTML has no live region and keeps the board class', () => {
  const html = renderTvScoreboard({
    courtId: 'tv-aria',
    courtName: 'Court 1',
    court: {
      match_status: { active: true },
      serve: 'A',
      current_set: 1,
      A: { full_name: 'Ada Nowak', points: '15', set1: 2 },
      B: { full_name: 'Ewa Lis', points: '30', set1: 3 },
    },
  });
  assert.match(html, /class="sb-tv/);
  assert.match(html, /Court 1/);
  assert.equal(html.includes('aria-live'), false);
  assert.equal(html.includes('role="status"'), false);
});

test('player names and flag URLs are escaped in visual HTML', () => {
  const html = renderTvScoreboard({
    courtId: 'tv-escape',
    courtName: 'Kort <2>',
    court: {
      match_status: { active: true },
      serve: 'B',
      current_set: 1,
      A: {
        full_name: 'Ana <script>alert(1)</script>',
        flag_url: 'https://flags.test/a.png")</style>',
        points: '0',
        set1: 0,
      },
      B: { full_name: 'Bo & "quote"', points: '0', set1: 0 },
    },
  });
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /Ana &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Bo &amp; &quot;quote&quot;/);
  assert.match(html, /Kort &lt;2&gt;/);
  assert.match(html, /https:\/\/flags\.test\/a\.png&quot;\)/);
});

test('tvFlagSpans splits only when partner country differs', () => {
  const split = tvFlagSpans({
    flag_url: 'https://flagcdn.com/w80/pl.png',
    flag_code: 'PL',
    flag_url_partner: 'https://flagcdn.com/w80/de.png',
    flag_code_partner: 'DE',
  });
  assert.match(split, /flag-split/);
  assert.match(split, /is-a/);
  assert.match(split, /is-b/);

  const same = tvFlagSpans({
    flag_url: 'https://flagcdn.com/w80/pl.png',
    flag_code: 'PL',
    flag_url_partner: 'https://flagcdn.com/w80/pl.png',
    flag_code_partner: 'PL',
  });
  assert.equal(same.includes('flag-split'), false);
});
