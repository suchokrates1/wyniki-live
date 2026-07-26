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
    const form = this.page.locator('form').filter({ hasText: 'Panel administratora' });
    await form.locator('input[type="password"]').fill(password);
    await form.getByRole('button', { name: /Zaloguj|Login/i }).click();
    await this.page.waitForFunction(
      () => document.body.innerText.includes('Panel Administracyjny')
        && !document.body.innerText.includes('Podaj hasło administratora'),
      undefined,
      { timeout: 10000 }
    );
  }

  async isLoggedIn() {
    const text = await this.page.evaluate(() => document.body.innerText);
    return text.includes('Turnieje') || text.includes('Tournaments');
  }
}
