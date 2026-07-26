/**
 * Page object: Admin panel bootstrap (login + tournament creation via UI).
 * Used by 01_bootstrap to verify admin panel is accessible.
 */
export class AdminBootstrapPage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

  async login(password = 'e2e-admin') {
    await this.page.getByPlaceholder(/hasło|password/i).fill(password);
    await this.page.getByRole('button', { name: /Zaloguj|Login/i }).click();
    await this.page.waitForFunction(
      () => !document.body.innerText.includes('Zaloguj') || document.body.innerText.includes('Turnieje'),
      undefined,
      { timeout: 10000 }
    );
  }

  async isLoggedIn() {
    const text = await this.page.evaluate(() => document.body.innerText);
    return text.includes('Turnieje') || text.includes('Tournaments');
  }
}
