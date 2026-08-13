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

  async expectLoginScreen() {
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Wejście do biura zawodów')
        && document.body.innerText.includes('Hasło modułu biura')
        && document.querySelector('#officeLangSelect'),
      undefined,
      { timeout: 15000 },
    );
  }

  async loginExpectFail(password) {
    await this.page.locator('input[type="password"]').fill(password);
    await this.page.getByRole('button', { name: 'Wejdź do biura' }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Błędne hasło')
        || document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 8000 },
    );
    const stillLogin = await this.page.evaluate(
      () => document.body.innerText.includes('Wejście do biura zawodów'),
    );
    if (!stillLogin) throw new Error('Wrong password unexpectedly entered the office');
  }
}
