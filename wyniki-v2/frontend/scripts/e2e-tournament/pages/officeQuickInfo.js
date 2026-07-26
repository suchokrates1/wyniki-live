/**
 * Page object: Office quick info tab.
 */
export class OfficeQuickInfoPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.getByRole('button', { name: /Info|Szybka informacja/i }).click();
    await this.page.waitForFunction(
      () => {
        const active = document.querySelector('.office-tab.is-active');
        return active && /Info|Szybka/i.test(active.textContent);
      },
      undefined,
      { timeout: 8000 }
    );
  }

  async setContent(text) {
    const textarea = this.page.locator('textarea').first();
    await textarea.fill(text);
  }

  async save() {
    const saveBtn = this.page.getByRole('button', { name: /Zapisz/i }).first();
    await saveBtn.click();
    await this.page.waitForTimeout(500);
  }

  async getDisplayedContent() {
    return this.page.evaluate(() => {
      const ta = document.querySelector('textarea');
      return ta ? ta.value : '';
    });
  }
}
