/**
 * Page object: quick info hero block (not a tab).
 */
export class OfficeQuickInfoPage {
  constructor(page) {
    this.page = page;
  }

  async ensureVisible() {
    await this.page.waitForSelector('#office-quick-info-message, textarea', { timeout: 10000 });
  }

  async setContent(text) {
    await this.ensureVisible();
    const textarea = this.page.locator('#office-quick-info-message, textarea').first();
    await textarea.fill(text);
    const checkbox = this.page.locator('#office-quick-info-active');
    if (await checkbox.count()) {
      await checkbox.check({ force: true }).catch(() => {});
    }
  }

  async save() {
    await this.page.getByRole('button', { name: 'Opublikuj' }).first().click();
    await this.page.waitForTimeout(1000);
  }

  async getDisplayedContent() {
    return this.page.evaluate(() => {
      const ta = document.querySelector('#office-quick-info-message') || document.querySelector('textarea');
      return ta ? ta.value : '';
    });
  }
}
