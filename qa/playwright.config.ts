import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/browser.spec.ts',
  outputDir: './results',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
