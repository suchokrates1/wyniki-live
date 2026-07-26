/**
 * Page object: Office planning tab (groups, draw).
 */
export class OfficePlanningPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.getByRole('button', { name: 'Drabinka' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Drabinka'),
      undefined,
      { timeout: 8000 }
    );
  }

  async waitForGroups() {
    await this.page.waitForFunction(
      () => document.body.innerText.toLocaleLowerCase('pl-PL').includes('grupa'),
      undefined,
      { timeout: 8000 }
    );
  }

  async hasKnockoutGenerated() {
    const text = await this.page.evaluate(() => document.body.innerText.toLocaleLowerCase('pl-PL'));
    return text.includes('wygenerowane');
  }
}
