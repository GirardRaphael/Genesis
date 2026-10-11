import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const validCsv = readFileSync('fixtures/orders-valid.csv', 'utf8');
const invalidCsv = readFileSync('fixtures/orders-invalid.csv', 'utf8');
const API = '/api/v1';

test.beforeEach(async ({ page, request }) => {
  const identity = await (await request.get(`${API}/qa/fixture`)).json();
  expect(identity.synthetic).toBe(true);
  expect(identity.models).toBe('forbidden');
  await page.goto('/?view=dispatch');
  await expect(page.locator('.order-board .orders-list')).toHaveAttribute('aria-busy', 'false');
});

async function upload(page: Page, csv: string | Buffer) {
  const panel = page.locator('.orders-intake-panel').filter({ hasText: 'Importer des commandes CSV' });
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel('Fichier CSV UTF-8', { exact: true }).setInputFiles({
    name: 'commandes-synthetiques.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
}

async function chooseAddress(page: Page, label: string, query: string) {
  const input = page.getByRole('searchbox', { name: label, exact: true });
  await input.fill(query);
  await input.press('Enter');
  await expect(page.getByRole('list', { name: `Résultats pour ${label.toLowerCase()}` })).toBeVisible();
  await input.press('ArrowDown');
  await page.keyboard.press('Enter');
}

test('CSV preview is read-only, commit persists quoted UTF-8 values and repeated import is idempotent', async ({ page, request }) => {
  const before = (await (await request.get(`${API}/orders`)).json()).total;
  await upload(page, invalidCsv);
  await expect(page.locator('.orders-preview [role=alert]')).toContainText('parcels');
  await expect(page.locator('.orders-preview button')).toBeDisabled();
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before);

  const csv = validCsv.replaceAll('QA-U18-', `QA-CSV-${Date.now()}-`);
  await upload(page, '\ufeff' + csv);
  await expect(page.locator('.orders-preview')).toContainText('2 commande(s) valide(s) · 0 erreur(s)');
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before);
  await page.getByRole('button', { name: 'Enregistrer les 2 commandes', exact: true }).click();
  await expect(page.locator('.orders-notice')).toContainText('2 commande(s) importée(s)');
  await page.reload();
  await expect(page.locator('.orders-card').filter({ hasText: 'Client synthétique, Montréal' })).toBeVisible();
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before + 2);
  await upload(page, csv);
  await page.getByRole('button', { name: 'Enregistrer les 2 commandes', exact: true }).click();
  await expect(page.locator('.orders-notice')).toContainText('2 commande(s) importée(s)');
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before + 2);

  await upload(page, csv.replace('Client synthétique, Montréal', 'Client modifié, Montréal'));
  await page.getByRole('button', { name: 'Enregistrer les 2 commandes', exact: true }).click();
  await expect(page.locator('.orders-intake [role=alert]')).toContainText(/reference|référence/i);
  await page.getByRole('button', { name: 'Actualiser les commandes', exact: true }).click();
  await expect(page.locator('.orders-list')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.orders-intake [role=alert]')).toBeVisible();
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before + 2);
});

test('invalid UTF-8 and oversized files are rejected before preview requests', async ({ page, request }) => {
  let previewRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/orders/import/preview')) previewRequests++;
  });
  const before = (await (await request.get(`${API}/orders`)).json()).total;
  await upload(page, Buffer.from([0xc3, 0x28]));
  await expect(page.locator('.orders-intake [role=alert]')).toContainText('encodé en UTF-8');
  await upload(page, 'x'.repeat(16 * 1024 + 1));
  await expect(page.locator('.orders-intake [role=alert]')).toContainText('dépasse 16 Kio');
  expect(previewRequests).toBe(0);
  expect((await (await request.get(`${API}/orders`)).json()).total).toBe(before);
});

test('saved order enters the default no-model planner and simulation starts only on explicit action', async ({ page, request }) => {
  test.setTimeout(90_000);
  const reference = `QA-PLAN-${Date.now()}`;
  await chooseAddress(page, 'Lieu de ramassage', '4500');
  await chooseAddress(page, 'Lieu de livraison', '1050');
  await page.getByRole('button', { name: 'Ajouter cette livraison', exact: true }).click();
  await page.locator('.orders-intake-panel').filter({ hasText: 'Enregistrer le brouillon' }).locator('summary').click();
  await page.getByLabel('Référence *', { exact: true }).fill(reference);
  await page.getByLabel('Client', { exact: true }).fill('Client synthétique clavier');
  await page.getByRole('button', { name: 'Enregistrer le lot', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: `Sélectionner la commande ${reference}`, exact: true });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'Préparer ces commandes', exact: true }).click();
  await expect(page.locator('.dispatch')).toContainText('Ces livraisons restent liées à leurs commandes');
  await chooseAddress(page, 'Dépôt de départ présumé', '4500');
  const created = page.waitForResponse((response) => response.url().endsWith('/dispatch/plans') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Comparer les tournées/ }).click();
  const response = await created;
  expect(response.status()).toBe(202);
  expect(response.request().postDataJSON().explanation_policy).toBe('none');
  expect(response.request().postDataJSON().order_ids).toHaveLength(1);
  const runId = (await response.json()).id;
  await expect.poll(async () => (await (await request.get(`${API}/dispatch/plans/${runId}`)).json()).status, { timeout: 35_000 }).toBe('succeeded');
  const plan = await (await request.get(`${API}/dispatch/plans/${runId}`)).json();
  expect(plan.certificate.valid).toBe(true);
  expect(plan.agents).toHaveLength(5);
  expect((await (await request.get(`${API}/runs/${runId}/usage`)).json()).attempts).toEqual([]);
  expect(plan.created_trip_ids).toHaveLength(1);
  const tripId = plan.created_trip_ids[0];
  const trip = await (await request.get(`${API}/dispatch/trips/${tripId}`)).json();
  expect(trip.status).toBe('ready');
  expect(trip.started_at).toBeNull();
  await page.getByRole('button', { name: 'Démarrer la simulation', exact: true }).click();
  await expect.poll(async () => (await (await request.get(`${API}/dispatch/trips/${tripId}`)).json()).status, { timeout: 35_000 }).toBe('completed');
  const order = (await (await request.get(`${API}/orders?q=${reference}`)).json()).items[0];
  expect(order.status).toBe('planned');
  expect(order.plan_id).toBe(runId);
});

test('mobile order controls remain keyboard usable and analytics CSV downloads its coverage', async ({ page }) => {
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('button', { name: 'Préparer ces commandes', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  const query = page.getByRole('searchbox', { name: 'Référence ou client', exact: true });
  await query.focus();
  await page.keyboard.type('QA-');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('État', { exact: true })).toBeFocused();
  await expect(page.locator('.orders-list')).toHaveAttribute('aria-busy', 'false');
  expect((await new AxeBuilder({ page }).include('.order-board').analyze()).violations).toEqual([]);

  await page.goto('/?view=analytics');
  const exportButton = page.getByRole('button', { name: 'Exporter le CSV', exact: true });
  await expect(exportButton).toBeEnabled();
  const download = page.waitForEvent('download');
  await exportButton.focus();
  await page.keyboard.press('Enter');
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/^genesis-analyses-.*\.csv$/);
  const csv = readFileSync((await artifact.path())!, 'utf8');
  expect(csv.startsWith('\ufeff')).toBe(true);
  for (const field of ['export_utc', 'couverture', 'coût', 'USD', 'CAD', 'horloge', 'portée_tables']) expect(csv).toContain(field);
  expect(csv).not.toContain('Client synthétique');
  await expect(page.getByRole('status').filter({ hasText: 'Export CSV préparé' })).toBeVisible();
});
