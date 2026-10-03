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
    // The panel is in once the section rail is drawn and the login dialog is gone.
    // (Before the 2026-10 redesign this waited for an "Panel Administracyjny" heading,
    // which the new shell does not have.)
    await this.page.waitForFunction(
      () => document.querySelectorAll('.adm-rail__item').length > 0
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
