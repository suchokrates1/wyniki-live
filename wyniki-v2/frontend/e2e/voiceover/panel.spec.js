import { mkdirSync, writeFileSync } from 'node:fs';
import { voiceOverTest as test } from '@guidepup/playwright';
import { macOSRecord } from '@guidepup/record';
import { expect } from '@playwright/test';

// The doors page with a real VoiceOver: from the first element of the page to the last, one
// "next" at a time (VO+Right), as a VoiceOver user reads it. Kept in voiceover-results/: what
// VoiceOver said, when it said it (for scripts/voiceover-narrate.mjs) and a screen recording.
//
// What counts is the spoken phrase, not Guidepup's item text: the item text of a labelled
// <select> can repeat its name ("Polski Język Język") or come back empty while VoiceOver says
// "Polski Język collapsed pop up button" once — checked against five ways of labelling it.
const OUT = 'voiceover-results';
const SETTLE_MS = 700; // VoiceOver finishes the phrase before it is read back

test('the doors page reads from start to end with VoiceOver', async ({ page, voiceOver }) => {
  mkdirSync(OUT, { recursive: true });
  const stopRecording = macOSRecord(`${OUT}/panel.mov`);
  const started = Date.now();
  try {
    await page.goto('/panel?lang=pl', { waitUntil: 'load' });
    await page.locator('h1').waitFor();
    await voiceOver.navigateToWebContent();

    const timeline = [];
    for (let step = 0; step < 40; step += 1) {
      const t = Date.now() - started;
      await page.waitForTimeout(SETTLE_MS);
      const text = (await voiceOver.lastSpokenPhrase()).trim();
      // at the last element "next" leaves VoiceOver where it is: the same phrase twice is the end
      if (timeline.length && timeline[timeline.length - 1].text === text) break;
      timeline.push({ t, text });
      await voiceOver.next();
    }
    const items = timeline.map((entry) => entry.text);

    writeFileSync(`${OUT}/panel.txt`, items.map((text, index) => `${String(index).padStart(3, '0')}  ${text}`).join('\n') + '\n');
    writeFileSync(`${OUT}/panel-timeline.json`, JSON.stringify(timeline, null, 2));

    const said = items.join('\n');
    for (const name of ['Dla organizatorów', 'Biuro turnieju', 'Panel organizatora serii', 'contact@blindtennis.app', 'Polityka prywatności']) {
      expect(said, `VoiceOver says "${name}"`).toContain(name);
    }
    expect(items.filter((text) => !text || /unlabel|nieoznaczon/i.test(text)), 'elements without a name').toEqual([]);
    expect(said, 'the decorative arrow stays quiet').not.toMatch(/→|right arrow|strzałka/i);
    expect(said, 'the language list is named once').not.toMatch(/Język\s+Język/);
  } finally {
    stopRecording();
  }
});
