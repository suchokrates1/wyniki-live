import { mkdirSync, writeFileSync } from 'node:fs';
import { macOSRecord } from '@guidepup/record';
import { expect } from '@playwright/test';

// One page with a real VoiceOver: from the first element to the last, one "next" at a time
// (VO+Right), as a VoiceOver user reads it. Kept in voiceover-results/: what VoiceOver said
// (<name>.txt), when it said it (<name>-timeline.json, for scripts/voiceover-narrate.mjs) and a
// screen recording (<name>.mov).
//
// What counts is the spoken phrase, not Guidepup's item text: the item text of a labelled
// <select> can repeat its name ("Polski Język Język") or come back empty while VoiceOver says
// "Polski Język collapsed pop up button" once — checked against five ways of labelling it.
const OUT = 'voiceover-results';
const SETTLE_MS = 700; // VoiceOver finishes the phrase before it is read back

export async function walkPage({ page, voiceOver }, { name, url, ready, maxSteps = 120 }) {
  mkdirSync(OUT, { recursive: true });
  const stopRecording = macOSRecord(`${OUT}/${name}.mov`);
  const started = Date.now();
  const timeline = [];
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.locator(ready).first().waitFor({ state: 'attached' });
    await voiceOver.navigateToWebContent();
    for (let step = 0; step < maxSteps; step += 1) {
      const t = Date.now() - started;
      await page.waitForTimeout(SETTLE_MS);
      const text = (await voiceOver.lastSpokenPhrase()).trim();
      // past the last element VoiceOver says nothing new, or the same phrase again: the end
      if (!text || (timeline.length && timeline[timeline.length - 1].text === text)) break;
      timeline.push({ t, text });
      if (/^end of main$/i.test(text) && name === 'panel') break; // the doors page has no footer outside main
      await voiceOver.next();
    }
  } finally {
    stopRecording();
    writeFileSync(`${OUT}/${name}.txt`, timeline.map((entry, index) => `${String(index).padStart(3, '0')}  ${entry.text}`).join('\n') + '\n');
    writeFileSync(`${OUT}/${name}-timeline.json`, JSON.stringify(timeline, null, 2));
  }
  return timeline.map((entry) => entry.text);
}

/** What every page must get right with VoiceOver, plus the names this page must say. */
export function expectReadsWell(items, names) {
  const said = items.join('\n');
  for (const name of names) expect(said, `VoiceOver says "${name}"`).toContain(name);
  expect(items.filter((text) => /unlabel|nieoznaczon/i.test(text)), 'elements without a name').toEqual([]);
  expect(said, 'decorative arrows stay quiet').not.toMatch(/→|right arrow|strzałka/i);
  expect(said, 'the language list is named once').not.toMatch(/Język\s+Język/);
  // a name read twice in one breath ("Kort 1 Kort 1"), as a hidden copy of visible text would make
  expect(items.filter((text) => /\b(.{6,})\s+\1\b/.test(text)), 'a name said twice in one phrase').toEqual([]);
}
