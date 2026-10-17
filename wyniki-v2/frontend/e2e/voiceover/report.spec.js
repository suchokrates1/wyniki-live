import { mkdirSync, writeFileSync } from 'node:fs';
import { voiceOverTest as test } from '@guidepup/playwright';
import { macOSRecord } from '@guidepup/record';
import { expect } from '@playwright/test';

// The profile's report form with VoiceOver: reach "Zgłoś błąd", press it (VO+Space), hear where
// VoiceOver lands, close with Escape and hear that it is back on the button that opened the form.
const OUT = 'voiceover-results';

test('the report form opens, is read and closes back to its button with VoiceOver', async ({ page, voiceOver }) => {
  mkdirSync(OUT, { recursive: true });
  const stopRecording = macOSRecord(`${OUT}/report.mov`);
  const started = Date.now();
  const timeline = [];
  const say = async (wait = 900) => {
    await page.waitForTimeout(wait);
    const text = (await voiceOver.lastSpokenPhrase()).trim();
    timeline.push({ t: Date.now() - started - wait, text });
    return text;
  };
  try {
    await page.goto('/?lang=pl#players/7', { waitUntil: 'load' });
    await page.locator('.pfv-step').first().waitFor({ state: 'attached' });
    await voiceOver.navigateToWebContent();
    let text = await say(700);
    for (let step = 0; step < 40 && !/Zgłoś błąd/.test(text); step += 1) {
      await voiceOver.next();
      text = await say(700);
    }
    expect(text, 'VoiceOver reaches the report button').toMatch(/Zgłoś błąd/);

    await voiceOver.act();
    const opened = await say(1500);
    expect(await page.locator('#pfv-report-message').evaluate((el) => el === document.activeElement), 'focus is in the text field').toBe(true);
    expect(opened, 'VoiceOver says the field name').toMatch(/Co jest nie tak/);
    expect(opened, 'the field name is said once').not.toMatch(/Co jest nie tak\?.*Co jest nie tak\?/s);

    await voiceOver.press('Escape');
    const closed = await say(1500);
    expect(await page.locator('.pfv-report').isVisible(), 'the form is closed').toBe(false);
    expect(closed, 'VoiceOver is back on the report button').toMatch(/Zgłoś błąd/);
  } finally {
    stopRecording();
    writeFileSync(`${OUT}/report.txt`, timeline.map((entry, index) => `${String(index).padStart(3, '0')}  ${entry.text}`).join('\n') + '\n');
    writeFileSync(`${OUT}/report-timeline.json`, JSON.stringify(timeline, null, 2));
  }
});
