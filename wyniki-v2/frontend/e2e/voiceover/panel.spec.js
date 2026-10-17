import { voiceOverTest as test } from '@guidepup/playwright';
import { expectReadsWell, walkPage } from './walk.js';

test('the doors page reads from start to end with VoiceOver', async ({ page, voiceOver }) => {
  const items = await walkPage({ page, voiceOver }, { name: 'panel', url: '/panel?lang=pl', ready: 'h1', maxSteps: 40 });
  expectReadsWell(items, ['Dla organizatorów', 'Biuro turnieju', 'Panel organizatora serii', 'contact@blindtennis.app', 'Polityka prywatności']);
});
