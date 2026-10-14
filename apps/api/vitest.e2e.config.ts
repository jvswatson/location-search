import { defineConfig } from 'vitest/config';

// E2E tests: full Nest app over HTTP (Supertest) against a seeded container.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    passWithNoTests: true,
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
