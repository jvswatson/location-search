import { defineConfig } from 'vitest/config';

// E2E tests: full Nest app over HTTP (Supertest) against a seeded container.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globalSetup: ['test/helpers/postgis.global-setup.ts'],
    passWithNoTests: true,
    // Random file and test order every run (seed is printed) to catch shared-state coupling.
    sequence: { shuffle: { files: true, tests: true } },
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
