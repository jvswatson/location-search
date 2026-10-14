import { defineConfig, devices } from '@playwright/test';

// Runs against a full stack (Nest serving the built UI + seeded PostGIS):
//   pnpm docker:e2e:up && pnpm --filter @location-search/web test:e2e && pnpm docker:e2e:down
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Chromium-based phone profile: checks the stacked layout at phone width.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
