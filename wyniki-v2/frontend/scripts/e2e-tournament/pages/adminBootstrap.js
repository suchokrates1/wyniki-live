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
    // Without a session /admin hands over to its own sign-in page, /admin/login.
    await this.page.waitForURL(/\/admin\/login/, { timeout: 10000 });
    const form = this.page.locator('form').filter({ hasText: 'Panel administratora' });
    await form.locator('input[type="password"]').fill(password);
    await form.getByRole('button', { name: /Zaloguj|Login/i }).click();
    // The panel is in once the sign-in sent us back and the section rail is drawn.
    await this.page.waitForFunction(
      () => !location.pathname.startsWith('/admin/login') && document.querySelectorAll('.adm-rail__item').length > 0,
      undefined,
      { timeout: 10000 }
    );
  }

  async isLoggedIn() {
    const text = await this.page.evaluate(() => document.body.innerText);
    return text.includes('Turnieje') || text.includes('Tournaments');
  }
}
