import { defineConfig } from 'vitest/config';

// Integration tests: real PostGIS via Testcontainers (Docker required).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    globalSetup: ['test/helpers/postgis.global-setup.ts'],
    passWithNoTests: true,
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
