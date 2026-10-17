import { mkdirSync, writeFileSync } from 'node:fs';
import { voiceOverTest as test } from '@guidepup/playwright';
import { macOSRecord } from '@guidepup/record';
import { expect } from '@playwright/test';

// The doors page with a real VoiceOver: from the first element of the page to the last, one
// "next" at a time (VO+Right), as a VoiceOver user reads it. What VoiceOver says is kept in
// voiceover-results/ with a screen recording of the walk.
const OUT = 'voiceover-results';

test('the doors page reads from start to end with VoiceOver', async ({ page, voiceOver }) => {
  mkdirSync(OUT, { recursive: true });
  const stopRecording = macOSRecord(`${OUT}/panel.mov`);
  try {
    await page.goto('/panel?lang=pl', { waitUntil: 'load' });
    await page.locator('h1').waitFor();
    await voiceOver.navigateToWebContent();

    const items = [];
    for (let step = 0; step < 40; step += 1) {
      const text = (await voiceOver.itemText()).trim();
      // at the last element "next" leaves VoiceOver where it is: the same item twice is the end
      if (items.length && items[items.length - 1] === text) break;
      items.push(text);
      await voiceOver.next();
    }

    writeFileSync(`${OUT}/panel.txt`, items.map((text, index) => `${String(index).padStart(3, '0')}  ${text}`).join('\n') + '\n');
    writeFileSync(`${OUT}/panel-spoken.json`, JSON.stringify(await voiceOver.spokenPhraseLog(), null, 2));

    const said = items.join('\n');
    for (const name of ['Dla organizatorów', 'Biuro turnieju', 'Panel organizatora serii', 'contact@blindtennis.app', 'Polityka prywatności']) {
      expect(said, `VoiceOver says "${name}"`).toContain(name);
    }
    // a control without a name, the arrow after a door's name, or an element read empty
    expect(items.filter((text) => !text || /unlabel|nieoznaczon/i.test(text)), 'elements without a name').toEqual([]);
    expect(said, 'the decorative arrow stays quiet').not.toMatch(/→|right arrow|strzałka/i);
  } finally {
    stopRecording();
  }
});
