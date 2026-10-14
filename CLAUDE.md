# Location Search — project guide

Read-only airport search: NestJS + PostGIS API, React + Leaflet UI, docker-compose.

## Layout

```
apps/api         NestJS 12 (ESM), TypeORM 1.x, PostGIS. Vitest + Supertest + Testcontainers.
apps/web         React 19, Vite 8, Tailwind 4, react-leaflet 5, TanStack Query. Vitest + RTL + MSW, Playwright.
packages/shared  API contract types + unit helpers. ESM, built to dist/ (run `pnpm build:shared`).
data/            GADB source SQL (MIT, Arash Partow). Parsed by the seed script — never executed.
docker/          db/ (Postgres + PostGIS, multi-arch) and api/ (app image) Dockerfiles.
```

## Toolchain facts (verified, newer than many references)

- **pnpm 12** pinned via `packageManager`. `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320`
  (3 days, strict) and `allowBuilds` (install scripts are denied unless listed `true`). Unknown
  workspace settings are errors.
- **TypeScript 6.0.x** — do NOT upgrade to 7 (typescript-eslint requires `<6.1`).
- **NestJS 12 is ESM-only.** API uses `"type": "module"`, `module: nodenext`; relative imports
  need `.js` extensions. Tests use **Vitest**, not Jest (Nest 12's official ESM template).
- **TanStack Table is not used** — the table is a plain component (sorting/paging are server-side).
- `msw` pinned to `^2` (Vitest's mocker peer range).

## Commands

```
pnpm install
pnpm typecheck | pnpm lint | pnpm format:check
pnpm test:unit                 # no Docker
pnpm test:integration          # Testcontainers, Docker Desktop must be running
pnpm test:e2e
```

## Domain decisions (agreed with the user)

- Data: airports from `data/gadb_postgresql_create_airports_table.sql`. Drop rows with
  `name = 'N/A'`, `0/0` coordinates, or `'U'` lat/lon direction; drop known-bad rows on an explicit
  list (`PCIS` Canton Island — wrong longitude). `iata_code 'N/A'` → NULL. Expected **4,187** rows.
- ICAO is the natural key (unique). IATA is nullable and NOT unique (14 duplicates).
- Title-case name/city/country at import; codes stay uppercase. Countries otherwise kept as-is
  (including source typos like `Engalnd`).
- **Imperial units:** altitude converted meters → whole feet at import (`altitude_ft`);
  distances/radii in **miles** in the API and UI. PostGIS still works in meters internally.
- API is read-only, under `/api/v1`. Rate limit 100 req/s per IP (env-configurable), `/health`
  exempt.
- Search: text + filters + map radius all combine. `SearchStrategy` seam in the service layer
  (v1 = text: exact code match > full-text rank > trigram). No vector search in v1.
- UI: prompt to click the map or search; the table lists all airports until a filter is active.
  Pins cover **every** match (via `/airports/points`), not just the current page. Pins are
  display-only (no click handlers).

## Conventions

- Conventional Commits, enforced by commitlint. Scopes: api, web, shared, db, seed, docker, ci,
  deps, repo.
- Husky: pre-commit = lint-staged; pre-push = typecheck + unit tests; commit-msg = commitlint.
- **`main` is protected** (ruleset `protect-main`, no bypass, applies to admins too): never commit
  to or push `main` directly. Work on a branch and open a PR; it merges only when all five CI
  checks pass. Definition: `.github/rulesets/protect-main.json` (see docs/CI.md). Renaming a CI
  job means updating the ruleset's required checks too.
- Coverage target ~80% is reported, not a CI gate. Don't write brittle tests just to hit it.
- Tests: unit `src/**/*.spec.ts` (api, shared) / `src/**/*.test.tsx` (web); integration
  `test/integration/**/*.int-spec.ts`; e2e `test/e2e/**/*.e2e-spec.ts`; Playwright `apps/web/e2e/`.
- **DB tests must be order-independent.** Integration/e2e configs shuffle file and test order on
  every run and run files in parallel. Each suite gets its own database via
  `connectTestDataSource()` / `disposeTestDataSource()` (test/helpers/data-source.ts); do setup
  (migrate, seed) in `beforeAll`, and a test that mutates shared rows must restore them itself.
