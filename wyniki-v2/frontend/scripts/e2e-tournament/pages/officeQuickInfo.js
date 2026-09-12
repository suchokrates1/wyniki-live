/**
 * Page object: quick info — "Komunikat dla widzów" view.
 */
export class OfficeQuickInfoPage {
  constructor(page) {
    this.page = page;
  }

  async ensureVisible() {
    const textarea = this.page.locator('#office-quick-info-message');
    if (!(await textarea.isVisible().catch(() => false))) {
      await this.page.locator('.office-tab').filter({ hasText: 'Komunikat dla widzów' }).click();
    }
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
  }

  async setContent(text) {
    await this.ensureVisible();
    const textarea = this.page.locator('#office-quick-info-message');
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
