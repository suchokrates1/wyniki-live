/**
 * Page object: Office login flow.
 */
export class OfficeLoginPage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async goto(slot) {
    await this.page.goto(`${this.baseUrl}/office/${slot}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 15000 }
    );
  }

  async login(password = 'test') {
    await this.page.locator('input[type="password"]').fill(password);
    await this.page.getByRole('button', { name: 'Wejdź do biura' }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Ostatnie mecze')
        && !document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 20000 }
    );
  }
}
