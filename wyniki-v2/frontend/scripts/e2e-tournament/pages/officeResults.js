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

  async _setNumberInput(locator, value) {
    await locator.click();
    await locator.fill('');
    await locator.type(String(value), { delay: 20 });
    await locator.dispatchEvent('input');
    await locator.dispatchEvent('change');
  }

  async enterScore(setsA, setsB) {
    const modal = this.page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' });
    const inputs = modal.locator('input[type="number"]');
    await this._setNumberInput(inputs.nth(0), setsA[0] ?? 6);
    await this._setNumberInput(inputs.nth(1), setsB[0] ?? 4);
    if (setsA[1] != null && setsB[1] != null) {
      await this._setNumberInput(inputs.nth(2), setsA[1]);
      await this._setNumberInput(inputs.nth(3), setsB[1]);
    }
  }

  async ensureGroupPlayersSelected() {
    const modal = this.page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' });
    const visibleSelects = modal.locator('select:visible');
    const count = await visibleSelects.count();
    for (let i = 0; i < count; i += 1) {
      const select = visibleSelects.nth(i);
      const optionValues = await select.locator('option').evaluateAll(
        (opts) => opts.map((o) => o.value).filter(Boolean)
      );
      if (optionValues.length) {
        await select.selectOption(optionValues[0]);
      }
    }
    // Last two visible selects are typically player A / player B.
    if (count >= 2) {
      const playerA = visibleSelects.nth(count - 2);
      const playerB = visibleSelects.nth(count - 1);
      const namesA = await playerA.locator('option').evaluateAll(
        (opts) => opts.map((o) => o.value).filter(Boolean)
      );
      const namesB = await playerB.locator('option').evaluateAll(
        (opts) => opts.map((o) => o.value).filter(Boolean)
      );
      if (namesA.length && namesB.length) {
        await playerA.selectOption(namesA[0]);
        await playerB.selectOption(namesB.find((v) => v !== namesA[0]) || namesB[0]);
      }
    }
  }

  async submitResult() {
    await this.page.getByRole('button', { name: 'Zapisz wynik' }).click();
    try {
      await this.page.waitForFunction(
        () => !document.body.innerText.includes('Zapisz wynik'),
        undefined,
        { timeout: 12000 }
      );
    } catch {
      const toast = await this.page.evaluate(() => document.body.innerText.slice(0, 500));
      throw new Error(`Add-result modal still open after save. UI snippet: ${toast}`);
    }
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
