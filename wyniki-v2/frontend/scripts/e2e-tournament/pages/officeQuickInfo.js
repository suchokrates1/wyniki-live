/**
 * Page object: quick info — "Komunikat dla zawodników" view.
 */
export class OfficeQuickInfoPage {
  constructor(page) {
    this.page = page;
  }

  async ensureVisible() {
    const textarea = this.page.locator('#office-quick-info-message');
    if (!(await textarea.isVisible().catch(() => false))) {
      await this.page.locator('.office-tab').filter({ hasText: 'Komunikat dla zawodników' }).click();
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

  /** The saved text arrives with the dashboard, a moment after the page (re)loads. */
  async getDisplayedContent(timeoutMs = 10000) {
    await this.ensureVisible();
    const textarea = this.page.locator('#office-quick-info-message');
    const deadline = Date.now() + timeoutMs;
    let value = await textarea.inputValue();
    while (!value && Date.now() < deadline) {
      await this.page.waitForTimeout(250);
      value = await textarea.inputValue();
    }
    return value;
  }
}
