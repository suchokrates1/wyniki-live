/**
 * Page object: office hero chrome (stats, tabs, logout, refresh).
 */
export class OfficeChromePage {
  constructor(page) {
    this.page = page;
  }

  async expectStats() {
    await this.page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('postęp')
          && (text.includes('zakończone') || text.includes('zakonczone'))
          && text.includes('pozostało')
          && text.includes('drabinka');
      },
      undefined,
      { timeout: 10000 },
    );
  }

  async expectTabs() {
    for (const name of ['Ostatnie mecze', 'Postęp grup', 'Drabinka', 'Plan turnieju']) {
      const tab = this.page.locator('.office-tab').filter({ hasText: name });
      if (!(await tab.count())) {
        throw new Error(`Missing office tab: ${name}`);
      }
    }
  }

  async openTab(name) {
    await this.page.locator('.office-tab').filter({ hasText: name }).click();
    await this.page.waitForFunction(
      (label) => document.querySelector('.office-tab.is-active')?.textContent?.includes(label),
      name,
      { timeout: 10000 },
    );
  }

  async refresh() {
    await this.page.getByRole('button', { name: 'Odśwież' }).click();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Wyloguj' }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 12000 },
    );
  }
}
