/**
 * Page object: Office planning — "Grupy startowe" view (categories, players, teams, draw).
 * The schedule board lives in the "Terminarz" view (see officeSchedule.js).
 */
export class OfficePlanningPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.locator('.office-tab').filter({ hasText: 'Grupy startowe' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Grupy startowe'),
      undefined,
      { timeout: 10000 }
    );
  }

  /** Step 1 has its own view now and never collapses; kept so specs read the same. */
  async expandStep1() {
    await this.waitForGroups();
  }

  async waitForGroups() {
    await this.page.waitForFunction(
      () => {
        const text = document.body.innerText.toLocaleLowerCase('pl-PL');
        return text.includes('grupa') || text.includes('grupy startowe');
      },
      undefined,
      { timeout: 12000 }
    );
  }

  async openKnockoutTab() {
    await this.page.getByRole('button', { name: 'Drabinka' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Drabinka'),
      undefined,
      { timeout: 10000 }
    );
  }

  async openProgressTab() {
    await this.page.locator('.office-tab').filter({ hasText: 'Faza grupowa' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Faza grupowa'),
      undefined,
      { timeout: 10000 },
    );
  }

  async hasKnockoutGenerated() {
    const text = await this.page.evaluate(() => document.body.innerText.toLocaleLowerCase('pl-PL'));
    return text.includes('wygenerowane') || text.includes('półfinał') || text.includes('finał')
      || text.includes('nie została jeszcze wygenerowana');
  }
}
