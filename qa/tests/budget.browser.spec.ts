import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const API = 'http://127.0.0.1:8061/api/v1';
const guard = {
  known_cost_usd: '0', held_usd: '0', budget_limit_usd: '50', budget_limit_cad: '100',
  budget_valued_cost_cad: '0', budget_valued_held_cad: '0', remaining_budget_cad: '100',
  cad_per_usd_policy: '2', frozen: false, cad_source: 'QA policy valuation',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const response = await route.fetch({ url: route.request().url().replace('http://127.0.0.1:5173/api/v1', API) });
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test('real alert endpoint reports setup needed without hiding the global ledger', async ({ page }) => {
  await page.goto('/?view=overview');
  await expect(page.getByRole('heading', { name: 'Coût API global des opérations', exact: true })).toBeVisible();
  await expect(page.locator('.budget-alert')).toContainText('Configuration requise');
  await expect(page.locator('.budget-alert')).toContainText('.env privé');
  await expect(page.locator('.overall-cost .meter-summary')).toContainText('100');
  const violations = (await new AxeBuilder({ page }).include('.overall-cost').analyze()).violations;
  expect(violations).toEqual([]);
  await page.screenshot({ path: 'screenshots/budget-email-setup.png', fullPage: true });
});

test('SMTP acceptance, uncertain delivery and stale status preserve privacy and budget visibility', async ({ page }) => {
  let state = 'sent';
  let unavailable = false;
  await page.route('**/api/v1/budget-alerts', (route) => {
    if (unavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'private-password@private-mail.test' }) });
    return route.fulfill({ json: { configured: true, configuration_error: null, guard,
      event: { id: 'fixture-budget-alert', reason: 'budget_reached',
        snapshot: { ...guard, known_cost_usd: '50', budget_valued_cost_cad: '100', remaining_budget_cad: '0', blocked_amount_usd: null },
        delivery_state: state, attempt_count: 1, next_retry_at: null,
        error_code: state === 'uncertain' ? 'smtp_delivery_uncertain' : null,
        created_at: '2026-10-10T18:00:00.000+00:00', updated_at: '2026-10-10T18:00:05.000+00:00', sent_at: state === 'sent' ? '2026-10-10T18:00:05.000+00:00' : null,
      } } });
  });
  await page.goto('/?view=overview');
  await expect(page.locator('.budget-alert .badge')).toHaveText('Acceptée par le serveur SMTP');
  await expect(page.locator('.budget-alert')).toContainText('ne confirme pas la réception');
  state = 'uncertain';
  await expect(page.locator('.budget-alert .badge')).toHaveText('Envoi incertain', { timeout: 8_000 });
  await expect(page.locator('.budget-alert')).toContainText('Code : smtp_delivery_uncertain');
  await expect(page.locator('.budget-alert')).toContainText('aucune nouvelle tentative automatique');
  unavailable = true;
  await expect(page.locator('.budget-alert')).toContainText('Dernier état connu', { timeout: 8_000 });
  await expect(page.locator('.overall-cost .meter-summary')).toBeVisible();
  await expect(page.locator('.budget-alert')).not.toContainText('private-password');
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).include('.overall-cost').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'screenshots/budget-email-uncertain-mobile.png', fullPage: true });
});

test('stalled mail status cannot stall global cost loading', async ({ page }) => {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/budget-alerts', async (route) => {
    await wait;
    await route.fulfill({ json: { configured: false, configuration_error: 'not_configured', guard, event: null } });
  });
  await page.goto('/?view=overview');
  try {
    await expect(page.locator('.overall-cost .meter-summary')).toBeVisible();
    await expect(page.locator('.budget-alert')).toContainText('Chargement de l’état du courriel');
  } finally {
    release();
  }
  await expect(page.locator('.budget-alert')).toContainText('Configuration requise');
});
