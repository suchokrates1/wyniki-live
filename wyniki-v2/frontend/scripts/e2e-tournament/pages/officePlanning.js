/**
 * Page object: Office planning tab (groups + schedule board).
 */
export class OfficePlanningPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.getByRole('button', { name: 'Plan turnieju' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Plan turnieju'),
      undefined,
      { timeout: 10000 }
    );
  }

  /** Completed groups collapse step 1 (Debel badge, play-format, pair list). */
  async expandStep1() {
    await this.waitForGroups();
    const toggle = this.page.locator('.office-panel').filter({ hasText: 'Grupy startowe' }).locator('span.btn');
    await toggle.first().waitFor({ state: 'visible', timeout: 8000 });
    const label = ((await toggle.first().innerText()) || '').trim();
    if (label === 'Edytuj') {
      await toggle.first().click();
    }
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Zwiń'),
      undefined,
      { timeout: 8000 },
    );
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

  async hasKnockoutGenerated() {
    const text = await this.page.evaluate(() => document.body.innerText.toLocaleLowerCase('pl-PL'));
    return text.includes('wygenerowane') || text.includes('półfinał') || text.includes('finał')
      || text.includes('nie została jeszcze wygenerowana');
  }
}
