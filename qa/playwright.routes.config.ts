import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/routes.browser.spec.ts',
  outputDir: './results/routes',
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command: '"..\\.venv\\Scripts\\python.exe" start_isolated.py',
    url: 'http://127.0.0.1:5174/api/v1/qa/fixture',
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
