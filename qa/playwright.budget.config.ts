import { defineConfig } from '@playwright/test';
import routes from './playwright.routes.config';

export default defineConfig({
  ...routes,
  testMatch: '**/budget.browser.spec.ts',
  outputDir: './results/budget',
});
