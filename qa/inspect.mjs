import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

await fs.mkdir('screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173');
await page.getByRole('heading', { name: 'Tournées de la flotte / Montréal' }).waitFor({ timeout: 20_000 });
await page.screenshot({ path: 'screenshots/overview.png', fullPage: true });
console.log(JSON.stringify({ title: await page.title(), errors, screenshot: 'qa/screenshots/overview.png' }));
await browser.close();
