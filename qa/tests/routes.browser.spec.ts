import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const API = 'http://127.0.0.1:8061/api/v1';

test.beforeEach(async ({ page }) => {
  // Exercise the application API using a fresh fixture fleet, never the operator database.
  await page.route('**/api/v1/**', async (route) => {
    const response = await route.fetch({ url: route.request().url().replace('http://127.0.0.1:5173/api/v1', API) });
    await route.fulfill({ response });
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

async function selectAddress(page: Page, label: string, text: string) {
  const input = page.getByRole('searchbox', { name: label, exact: true });
  await input.fill(text);
  const searched = page.waitForResponse((response) => response.url().includes('/dispatch/geocode?'));
  await input.press('Enter');
  const results = await (await searched).json();
  expect(results.items.length).toBeGreaterThan(0);
  expect(results.items.every((item: { id?: string }) => typeof item.id === 'string')).toBe(true);
  const list = page.getByRole('list', { name: `Résultats pour ${label.toLowerCase()}` });
  await expect(list).toBeVisible();
  await input.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
}

function expectPlaceFields(body: { depot?: object; deliveries: { pickup: object; dropoff: object }[] }) {
  const places = body.deliveries.flatMap((delivery) => [delivery.pickup, delivery.dropoff]);
  if (body.depot) places.push(body.depot);
  for (const place of places) expect(Object.keys(place).sort()).toEqual(['coordinates', 'label']);
}

test('different entered addresses and multiple deliveries preview without fleet or billing mutations', async ({ page, request }) => {
  await page.goto('/?view=dispatch');
  await expect(page.getByRole('searchbox', { name: 'Dépôt de départ présumé', exact: true })).toHaveValue('');
  const initialTrips = (await (await request.get(`${API}/dispatch/trips?limit=100`)).json()).items;
  const initialSpend = (await (await request.get(`${API}/usage`)).json());
  await selectAddress(page, 'Lieu de ramassage', '4500');
  await selectAddress(page, 'Lieu de livraison', '1050');
  await page.getByRole('button', { name: 'Ajouter cette livraison', exact: true }).click();
  const firstResponse = page.waitForResponse((response) => response.url().endsWith('/dispatch/preview') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Aperçu routier des livraisons', exact: true }).click();
  const firstReply = await firstResponse;
  expectPlaceFields(firstReply.request().postDataJSON());
  expect(firstReply.status()).toBe(200);
  const first = await firstReply.json();
  await expect(page.locator('.dispatch-preview-summary')).toContainText('2 arrêts');
  expect(first.stops.map((stop: { coordinates: number[] }) => stop.coordinates)).toEqual([[-73.582, 45.523], [-73.581, 45.528]]);
  await selectAddress(page, 'Lieu de ramassage', '5300');
  await selectAddress(page, 'Lieu de livraison', '400 rue');
  await page.getByRole('button', { name: 'Ajouter cette livraison', exact: true }).click();
  await expect(page.locator('.dispatch-preview-summary')).toHaveCount(0);
  const secondResponse = page.waitForResponse((response) => response.url().endsWith('/dispatch/preview') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Aperçu routier des livraisons', exact: true }).click();
  const secondReply = await secondResponse;
  expectPlaceFields(secondReply.request().postDataJSON());
  expect(secondReply.status()).toBe(200);
  const second = await secondReply.json();
  await expect(page.locator('.dispatch-preview-summary')).toContainText('4 arrêts');
  expect(second.route.coordinates).not.toEqual(first.route.coordinates);
  expect(second.route.distance_km).toBeGreaterThan(first.route.distance_km);
  const finalTrips = (await (await request.get(`${API}/dispatch/trips?limit=100`)).json()).items;
  expect(finalTrips.map((trip: { id: string }) => trip.id)).toEqual(initialTrips.map((trip: { id: string }) => trip.id));
  expect((await (await request.get(`${API}/usage`)).json())).toEqual(initialSpend);
  await expect(page.locator('.dispatch-map-canvas canvas')).toBeVisible();
  await page.screenshot({ path: 'screenshots/routes-preview.png', fullPage: true });
});

test('manual routes accept selected geocoder addresses without provider IDs', async ({ page, request }) => {
  await page.goto('/?view=dispatch');
  await selectAddress(page, 'Lieu de ramassage', '5300');
  await selectAddress(page, 'Lieu de livraison', '400 rue');
  await page.getByRole('button', { name: 'Ajouter cette livraison', exact: true }).click();
  await page.locator('.dispatch-manual summary').click();
  await page.locator('.dispatch-manual select').selectOption('van4');
  const created = page.waitForResponse((response) => response.url().endsWith('/dispatch/trips') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Créer sans courtier/ }).click();
  const response = await created;
  expectPlaceFields(response.request().postDataJSON());
  expect(response.status()).toBe(201);
  const trip = await response.json();
  try {
    await expect(page.getByRole('button', { name: 'Démarrer la simulation', exact: true })).toBeVisible();
    expect(trip.stops).toHaveLength(2);
    expect(trip.status).toBe('ready');
  } finally {
    expect((await request.post(`${API}/dispatch/trips/${trip.id}/cancel`)).status()).toBe(200);
  }
});

test('completed route history loads an editable draft and preserves historical records', async ({ page, request }) => {
  await page.goto('/?view=dispatch');
  const history = (await (await request.get(`${API}/dispatch/routes`)).json()).items;
  const recurring = history.find((item: { completed_sample_count: number }) => item.completed_sample_count === 2);
  expect(recurring).toBeTruthy();
  const row = page.locator('.dispatch-library tbody tr').filter({ hasText: recurring.name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('2 trajet(s)');
  await row.getByRole('button', { name: /Charger et modifier/ }).click();
  await expect(page.locator('.dispatch-draft li')).toHaveCount(1);
  await expect(page.locator('.dispatch-draft')).toContainText('4500 rue Saint-Denis');
  await page.getByRole('button', { name: 'Modifier la livraison 1', exact: true }).click();
  await selectAddress(page, 'Lieu de livraison', '5300');
  await page.getByRole('button', { name: 'Mettre à jour la livraison 1', exact: true }).click();
  await expect(page.locator('.dispatch-draft')).toContainText('5300 boulevard Saint-Laurent');
  const unchanged = (await (await request.get(`${API}/dispatch/routes/${recurring.id}`)).json());
  expect(unchanged.completed_sample_count).toBe(2);
  expect(unchanged.deliveries[0].dropoff.label).toContain('1050');
  await page.screenshot({ path: 'screenshots/routes-history.png', fullPage: true });
});

test('preview failure, route visibility controls and mobile keyboard accessibility', async ({ page }) => {
  await page.goto('/?view=dispatch');
  await selectAddress(page, 'Dépôt de départ présumé', '5300');
  await page.getByRole('button', { name: 'Exemple facultatif : charger deux livraisons', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Dépôt de départ présumé', exact: true })).toHaveValue('5300 boulevard Saint-Laurent, Montréal');
  await page.route('**/api/v1/dispatch/preview', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'Route provider unavailable for QA' } }) }));
  await page.getByRole('button', { name: 'Aperçu routier des livraisons', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Route provider unavailable for QA' })).toBeVisible();
  await expect(page.locator('.dispatch-preview-summary')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Trajets enregistrés', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Trajets enregistrés', exact: true })).not.toBeChecked();
  await page.getByText('Explications IA et mode de démonstration · facultatifs', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Sans IA · planification déterministe', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  const violations = (await new AxeBuilder({ page }).include('.dispatch').analyze()).violations;
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'screenshots/routes-mobile.png', fullPage: true });
});

test('broker revalidates completed recurring work and exposes zero actual explanation calls', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.goto('/?view=dispatch');
  await selectAddress(page, 'Lieu de ramassage', '4500');
  await selectAddress(page, 'Lieu de livraison', '1050');
  await page.getByRole('button', { name: 'Ajouter cette livraison', exact: true }).click();
  await selectAddress(page, 'Dépôt de départ présumé', '4500');
  await page.getByText('Explications IA et mode de démonstration · facultatifs', { exact: true }).click();
  await page.getByRole('radio', { name: 'Démonstration déterministe sans appel IA', exact: true }).check();
  await page.getByRole('radio', { name: 'Routine · explications ciblées', exact: true }).check();
  for (const van of ['V1', 'V3', 'V4']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${van}\\b`) }).uncheck();
  }
  const firstCreated = page.waitForResponse((response) => response.url().endsWith('/dispatch/plans') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Comparer les tournées/ }).click();
  const first = await firstCreated;
  expectPlaceFields(first.request().postDataJSON());
  expect(first.status()).toBe(202);
  const firstId = (await first.json()).id;
  await expect.poll(async () => (await (await request.get(`${API}/dispatch/plans/${firstId}`)).json()).status, { timeout: 25_000 }).toBe('succeeded');
  const plan = (await (await request.get(`${API}/dispatch/plans/${firstId}`)).json());
  expect(plan.final_kind).toBe('accepted_plan');
  for (const id of plan.created_trip_ids) {
    expect((await request.post(`${API}/dispatch/trips/${id}/start`)).status()).toBe(200);
    await expect.poll(async () => (await (await request.get(`${API}/dispatch/trips/${id}`)).json()).status, { timeout: 20_000 }).toBe('completed');
  }
  // NoPaidModels raises if the history path accidentally attempts generation.
  await page.getByRole('radio', { name: /Routes actuelles/ }).check();
  const secondCreated = page.waitForResponse((response) => response.url().endsWith('/dispatch/plans') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Comparer les tournées/ }).click();
  const second = await secondCreated;
  expect(second.status()).toBe(202);
  const secondId = (await second.json()).id;
  await expect.poll(async () => (await (await request.get(`${API}/dispatch/plans/${secondId}`)).json()).status, { timeout: 25_000 }).toBe('succeeded');
  const reused = (await (await request.get(`${API}/dispatch/plans/${secondId}`)).json());
  expect(reused.route_memory.outcome).toBe('reused');
  expect(reused.route_memory.admission_outcome).toBe('created');
  expect(reused.route_memory.planned_explanation_calls).toBe(0);
  expect(reused.route_memory.omitted_explanation_roles).toHaveLength(5);
  expect(reused.agents.every((agent: { model: string | null; cost: string | null }) => agent.model === null && agent.cost === null)).toBe(true);
  expect((await (await request.get(`${API}/runs/${secondId}/usage`)).json()).attempts).toEqual([]);
  await page.getByText('Détails techniques · cinq étapes, appels et historique', { exact: true }).click();
  await expect(page.getByText('Tournée habituelle revérifiée', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'screenshots/routes-memory-reused.png', fullPage: true });
});
