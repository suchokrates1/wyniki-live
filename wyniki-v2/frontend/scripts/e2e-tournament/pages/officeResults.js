/**
 * Page object: office match results (Dodaj wynik / Popraw wynik).
 */
export class OfficeResultsPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToHistory() {
    await this.page.getByRole('button', { name: 'Ostatnie mecze' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Ostatnie mecze'),
      undefined,
      { timeout: 10000 }
    );
  }

  async openAddResult() {
    await this.page.getByRole('button', { name: 'Dodaj wynik' }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Zapisz wynik'),
      undefined,
      { timeout: 10000 }
    );
  }

  async enterScore(setsA, setsB) {
    const modal = this.page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' });
    const inputs = modal.locator('input[type="number"]');
    await inputs.nth(0).fill(String(setsA[0] ?? 6));
    await inputs.nth(1).fill(String(setsB[0] ?? 4));
    if (setsA[1] != null && setsB[1] != null) {
      await inputs.nth(2).fill(String(setsA[1]));
      await inputs.nth(3).fill(String(setsB[1]));
    }
  }

  async submitResult() {
    await this.page.getByRole('button', { name: 'Zapisz wynik' }).click();
    await this.page.waitForTimeout(1500);
  }

  async openEditFirst() {
    const editBtn = this.page.getByRole('button', { name: 'Popraw wynik' }).first();
    await editBtn.click();
    await this.page.waitForTimeout(800);
  }

  async getHistoryPlayerSnippet() {
    return this.page.evaluate(() => document.body.innerText);
  }
}
