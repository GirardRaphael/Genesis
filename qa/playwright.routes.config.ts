import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/routes.browser.spec.ts',
  outputDir: './results/routes',
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command: '"..\\.venv\\Scripts\\python.exe" route_memory_server.py',
    url: 'http://127.0.0.1:8061/api/v1/dispatch/config',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
