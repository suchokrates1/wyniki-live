/**
 * Page object: Office results / matches tab.
 */
export class OfficeResultsPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToTab() {
    await this.page.getByRole('button', { name: 'Mecze' }).click();
    await this.page.waitForFunction(
      () => document.querySelector('.office-tab.is-active')?.textContent?.includes('Mecze'),
      undefined,
      { timeout: 8000 }
    );
  }

  async clickStartMatch(player1Partial, player2Partial) {
    const btn = this.page.locator(`button:has-text("Rozpocznij")`).first();
    await btn.click();
    await this.page.waitForTimeout(500);
  }

  async enterScore(setsA, setsB) {
    // Fill score form inputs if visible
    const inputs = this.page.locator('input[type="number"]');
    const count = await inputs.count();
    if (count >= 2) {
      await inputs.nth(0).fill(String(setsA[0] ?? 0));
      await inputs.nth(1).fill(String(setsB[0] ?? 0));
    }
  }

  async submitResult() {
    const saveBtn = this.page.getByRole('button', { name: /Zapisz|Zatwierdź/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await this.page.waitForTimeout(1000);
    }
  }

  async getMatchCount() {
    return this.page.evaluate(() =>
      document.querySelectorAll('[data-match-id], .match-row, .office-match-card').length
    );
  }
}
