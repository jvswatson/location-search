import { defineConfig } from 'vitest/config';

// Unit tests: fast, no Docker. Co-located as src/**/*.spec.ts, plus test/scripts/ for checks on
// the package scripts themselves.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/scripts/**/*.spec.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // 80% is a reported target, not a gate (see CLAUDE.md), so no thresholds here.
      exclude: ['src/main.ts', 'src/**/*.module.ts', 'src/database/migrations/**'],
    },
  },
});
