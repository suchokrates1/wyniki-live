import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_LANGUAGES } from '../i18n/locale.js';
import { applyTranslationPatches } from '../i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from '../i18n/translations.js';
import { createLiveRuntimeView } from './liveRuntimeView.js';

test('the home page says there is no tournament only once the snapshot has none', () => {
  const view = createLiveRuntimeView();
  assert.equal(view.noActiveTournament(), false, 'not while loading');

  view.loading = false;
  view.applySnapshot({ courts: {}, tournament_name: null });
  assert.equal(view.noActiveTournament(), true);

  view.applySnapshot({ courts: {}, tournament_name: 'RAKIETY ATNiS VII' });
  assert.equal(view.noActiveTournament(), false);

  view.applySnapshot({ courts: {} });
  view.error = 'offline';
  assert.equal(view.noActiveTournament(), false, 'an unreachable server is not an empty calendar');
});

test('every language of the public page has the no-tournament text', () => {
  applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);
  for (const lang of SUPPORTED_LANGUAGES) {
    const text = TRANSLATIONS[lang]?.noActiveTournament;
    assert.ok(text?.title && text?.text, lang);
  }
});
