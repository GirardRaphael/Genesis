import { defineConfig } from '@playwright/test';
import isolated from './playwright.routes.config';

export default defineConfig({
  ...isolated,
  testMatch: '**/orders.browser.spec.ts',
  outputDir: './results/orders',
});
