/**
 * Page object: Office schedule tab.
 */
export class OfficeSchedulePage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.getByRole('button', { name: 'Harmonogram' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Harmonogram'),
      undefined,
      { timeout: 8000 }
    );
  }

  async waitForEntries() {
    await this.page.waitForFunction(
      () => document.querySelectorAll('[data-schedule-entry]').length > 0
        || document.body.innerText.includes('Zaplanowane'),
      undefined,
      { timeout: 8000 }
    );
  }

  async getEntryCount() {
    return this.page.evaluate(() => document.querySelectorAll('[data-schedule-entry]').length);
  }
}
