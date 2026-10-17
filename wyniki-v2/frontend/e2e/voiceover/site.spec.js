import { voiceOverTest as test } from '@guidepup/playwright';
import { expectReadsWell, walkPage } from './walk.js';

// The public site's main screens with VoiceOver, on the mock data the TalkBack walk uses
// (scripts/talkback/golden): the same names must be said here.
const SCREENS = [
  {
    name: 'live', url: '/?lang=pl', ready: '[id^="heading-"]', maxSteps: 80,
    names: ['Analityka odwiedzin', 'Menu główne', 'Kort 1: Anna Nowak kontra Béla Kovács', 'Kort 2: brak meczu', 'Polityka prywatności'],
  },
  {
    name: 'tournament-schedule', url: '/?lang=pl#tournaments/28/schedule', ready: '.schedule-card', maxSteps: 220,
    names: ['Plan turnieju', 'Mecz: Dana Granowski kontra Simone Kaminski', 'Kort 2', 'Faza grupowa'],
  },
  {
    name: 'tournament', url: '/?lang=pl#tournaments/28', ready: '.btv', maxSteps: 200,
    names: ['Drabinka', 'Grupy', 'Sety: 0 do 0', 'Bilans: 0 do 0', '1. B1 Men – 2. B1 Men'],
  },
  {
    name: 'profile', url: '/?lang=pl#players/7', ready: '.pfv-step, h2', maxSteps: 160,
    names: ['Anna Przykład', 'Kraj: Polska', 'Kategoria: B3', 'Złoto: 1', 'Bilans: 1 do 0', 'Historia kategorii'],
  },
];

for (const screen of SCREENS) {
  test(`${screen.name} reads from start to end with VoiceOver`, async ({ page, voiceOver }) => {
    const items = await walkPage({ page, voiceOver }, screen);
    expectReadsWell(items, screen.names);
  });
}
