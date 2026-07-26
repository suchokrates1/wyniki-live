/**
 * Page object: Office login flow.
 */
export class OfficeLoginPage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async goto(slot) {
    await this.page.goto(`${this.baseUrl}/office/${slot}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 10000 }
    );
  }

  async login(password = 'test') {
    await this.page.getByLabel('Hasło modułu biura').fill(password);
    await this.page.getByRole('button', { name: 'Wejdź do biura' }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Ostatnie mecze'),
      undefined,
      { timeout: 12000 }
    );
  }
}
