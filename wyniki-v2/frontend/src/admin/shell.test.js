import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SECTIONS,
  adminHashFor,
  createAdminShell,
  parseAdminHash,
  sectionForTab,
  tabsForSection,
} from './shell.js';

test('every old tab has a home in the new rail', () => {
  for (const tab of ['tournaments', 'global_players', 'players', 'courts', 'devices', 'settings', 'panic']) {
    const section = sectionForTab(tab);
    assert.ok(tabsForSection(section).includes(tab), `${tab} → ${section}`);
  }
});

test('the office dashboard is not a section of its own but still lands somewhere', () => {
  const railTabs = ADMIN_SECTIONS.flatMap((section) => section.tabs);
  assert.ok(!railTabs.includes('office'));
  assert.equal(sectionForTab('office'), 'turnieje');
  assert.equal(sectionForTab('planning'), 'turnieje', 'an old link still opens something sane');
});

test('the address bar carries the section, and the sub-tab where a section has two', () => {
  assert.equal(adminHashFor('tournaments'), '#/turnieje');
  assert.equal(adminHashFor('devices'), '#/korty/devices');
  assert.deepEqual(parseAdminHash('#/korty/devices'), { section: 'korty', tab: 'devices' });
  assert.deepEqual(parseAdminHash('#/korty'), { section: 'korty', tab: 'courts' });
  assert.deepEqual(parseAdminHash('#/nic-takiego'), { section: 'turnieje', tab: 'tournaments' });
  assert.deepEqual(parseAdminHash(''), { section: 'turnieje', tab: 'tournaments' });
});

test('switching section keeps the sub-tab you were on', () => {
  const shell = Object.assign({ activeTab: 'devices' }, createAdminShell());
  shell.openAdminTab = (tab) => { shell.activeTab = tab; };
  shell.openAdminSection('korty');
  assert.equal(shell.activeTab, 'devices');
  shell.openAdminSection('turnieje');
  assert.equal(shell.activeTab, 'tournaments');
});

test('a section with two tabs lists them, a single-tab section does not', () => {
  const shell = Object.assign({ activeTab: 'courts' }, createAdminShell());
  assert.deepEqual(shell.adminSectionTabs().map((t) => t.tab), ['courts', 'devices']);
  assert.equal(shell.adminSectionTabs()[1].label, 'Tablety');
  shell.activeTab = 'settings';
  assert.deepEqual(shell.adminSectionTabs(), []);
  assert.ok(shell.isAdminSection('overlay'));
});
