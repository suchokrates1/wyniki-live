/**
 * Page object: schedule board — "Terminarz" view.
 */
export class OfficeSchedulePage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.locator('.office-tab').filter({ hasText: 'Terminarz' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Terminarz'),
      undefined,
      { timeout: 10000 }
    );
  }

  async waitForEntries() {
    await this.page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('Opublikuj')
          || text.includes('Generuj')
          || text.includes('Kort')
          || document.querySelectorAll('[data-schedule-entry]').length > 0;
      },
      undefined,
      { timeout: 12000 }
    );
  }

  async publishAll() {
    const btn = this.page.getByRole('button', { name: /Opublikuj wszystkie/i });
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(1000);
    }
  }

  async getEntryCount() {
    return this.page.evaluate(() => document.querySelectorAll('[data-schedule-entry]').length);
  }
}
