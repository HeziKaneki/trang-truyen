import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: process.env.CI ? 1 : 0,
  timeout: 90000, expect: { timeout: 15000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.APP_URL || 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_EXTERNAL_SERVER === 'true' ? undefined : { command: 'pnpm dev', url: `${process.env.APP_URL || 'http://localhost:3000'}/api/health`, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
