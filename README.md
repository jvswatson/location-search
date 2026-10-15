# Location Search

A read-only airport search app. A NestJS + PostGIS API serves 4,187 airports from the GADB dataset;
a React + Leaflet UI lets you search by text, filter, and narrow results by clicking the map to
search within a radius, by clicking two corners to search a rectangle, or by clicking points to
outline any polygon. Everything combines: text, filters and the map area apply together.

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): containers, request pipeline, and browser-to-database
  call diagrams
- [docs/REPO_STRUCTURE.md](docs/REPO_STRUCTURE.md): what each folder (and notable file) is for
- [docs/CI.md](docs/CI.md): git hooks and the GitHub Actions workflow, and what runs on push vs
  what needs a manual step

## Prerequisites

- **Docker Desktop** (runs Postgres/PostGIS, the app image and the Testcontainers-based tests).
- **Node 24** (see `.nvmrc`). On macOS with Homebrew, `node@24` is keg-only, so put it on your
  PATH: `export PATH="$(brew --prefix node@24)/bin:$PATH"`.
- **pnpm 12**, provided by corepack: `corepack enable`. The exact version comes from the
  `packageManager` field in `package.json`.

## Quick start (Docker only)

```sh
docker compose up --build
```

Then open <http://localhost:3000>. The API docs are at <http://localhost:3000/api/docs>. On first
start the app container applies migrations and seeds the airports table; later starts skip seeding.
Set `APP_PORT` / `DB_PORT` to change the published ports. `docker compose down -v` also removes the
database volume.

The images build natively on both Apple Silicon (arm64) and amd64.

## Local development

```sh
corepack enable
pnpm install
pnpm docker:db      # start only the database (localhost:5432)
cp .env.example .env
pnpm --filter @location-search/api seed   # needs a build first: pnpm build:shared && pnpm --filter @location-search/api build
pnpm dev            # builds shared, then runs api and web in watch mode
```

`.env.example` lists the variables you are most likely to change (`DB_HOST`, `DB_PORT`,
`POSTGRES_*`, `PORT`, `RATE_LIMIT_LIMIT`, `RATE_LIMIT_TTL_MS`). `DATABASE_URL` is accepted as an
alternative to the individual DB variables. The API also reads `LOG_LEVEL` (default `info`),
`DB_LOGGING` (default `false`), `TRUST_PROXY` (Express `trust proxy`, default
`loopback, linklocal, uniquelocal`), `WEB_DIST_PATH` (serve the built UI from this directory; the
app image sets it) and `NODE_ENV` (below). The full schema, with defaults, is
`apps/api/src/config/env.validation.ts`.

One `.env` at the repo root configures everything: Docker Compose reads it for `${…}`
substitution, and the api's `dev`, `seed` and `migration:run` scripts load it with
`node --env-file-if-exists`, so it is optional. Variables already set in your shell win over the
file. Postgres applies `POSTGRES_PASSWORD` only when its data volume is first created; after
changing it, either `ALTER USER` in psql or reset with `pnpm docker:down -v` (re-seeds on the next
start).

`NODE_ENV` defaults to `production`, and in production the API and seed CLI refuse to start
without `POSTGRES_PASSWORD` (or a `DATABASE_URL`); there is no fallback password. The `dev` and
`seed` scripts set `NODE_ENV=development`, where the local password `airports` is the default.
The compose files pass the password explicitly, so `docker compose up` needs nothing extra; for
any real deployment, set your own `POSTGRES_PASSWORD`.

## Tests

| Command                 | Scope                                                    | Needs                              |
| ----------------------- | -------------------------------------------------------- | ---------------------------------- |
| `pnpm test:unit`        | api, shared and web unit tests                           | nothing                            |
| `pnpm test:integration` | API against a real PostGIS (Testcontainers)              | Docker running                     |
| `pnpm test:e2e`         | API e2e (Supertest) and Playwright                       | Docker; Playwright needs the stack |
| `pnpm docker:e2e:up`    | Start the throwaway e2e stack on `http://localhost:3100` | Docker                             |
| `pnpm docker:e2e:down`  | Stop it and delete its database                          | Docker                             |

Playwright specs live in `apps/web/e2e` and read the target from `E2E_BASE_URL`:

```sh
pnpm docker:e2e:up
pnpm --filter @location-search/web exec playwright install chromium   # once
E2E_BASE_URL=http://localhost:3100 pnpm --filter @location-search/web test:e2e
pnpm docker:e2e:down
```

Other checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`. Coverage (~80% target) is reported
by `vitest --coverage`, not enforced. Integration and e2e suites are order-independent: each gets
its own database and files run shuffled in parallel.

## API

Base path `/api/v1`. Interactive docs: `/api/docs`. Distances and radii are in **miles**, altitudes
in **feet**. Response and parameter types live in `packages/shared/src/airports.ts`.
`/airports` and `/airports/points` return GeoJSON `FeatureCollection`s instead of JSON with
`format=geojson` or an `Accept: application/geo+json` header.

| Method | Path                      | Description                                                                                                                                                                                                   |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/airports`               | Paginated search. Params: `q`, `country` (repeatable), `iata`, `hasIata`, `minAltitudeFt`, `maxAltitudeFt`, `lat`+`lng`+`radiusMi`, `bbox`, `polygon`, `sort`, `order`, `page`, `limit` (default 25, max 100) |
| GET    | `/airports/points`        | Every match as minimal `{icaoCode, lat, lng}` for map pins; same filters as `/airports`                                                                                                                       |
| GET    | `/airports/:icao`         | One airport by ICAO code                                                                                                                                                                                      |
| GET    | `/airports/:icao/nearest` | Nearest airports to the given one: `k` (default 5, max 50)                                                                                                                                                    |
| GET    | `/airports/distance`      | Distance in miles between two airports (`from`, `to`: ICAO codes), measured on the spheroid                                                                                                                   |
| GET    | `/countries`              | Countries with airport counts                                                                                                                                                                                 |
| GET    | `/health`                 | Liveness and database/PostGIS status                                                                                                                                                                          |

**Map areas.** A search takes at most one area: a radius (`lat`+`lng`+`radiusMi`), a rectangle
(`bbox=minLng,minLat,maxLng,maxLat`) or a polygon (`polygon=lng,lat;lng,lat;…`). Sending more than
one is a 400. Rectangles and polygons have straight edges as drawn on the (Web Mercator) map and
must not cross the antimeridian; polygons must also not self-intersect. The API enforces every rule
itself, whatever the client checked. With any area, rows carry `distanceMi` from its center,
distance is the default sort, and `meta.center` reports that center: the radius center, the bbox's
lng/lat midpoint, or the polygon's centroid (which can lie outside a concave polygon).
(`POST /airports/within` was removed; the `polygon` filter replaces it.)

**Limits.** These keep every request far below common proxy URL limits (e.g. nginx's 8 KB);
a unit test builds the worst-case URL from the real data (4,793 characters today, with a 100-point
polygon) and fails if it reaches 75% of the cap.

| Limit                    | Value             | Over the limit                     |
| ------------------------ | ----------------- | ---------------------------------- |
| `q`                      | 100 characters    | 400                                |
| `country` values         | 50                | 400 (the UI stops selection at 50) |
| `limit` (page size)      | 100               | 400                                |
| `radiusMi`               | 1–3,000           | 400                                |
| `polygon` points         | 3–100             | 400 (the UI stops at 100)          |
| Request URL (path+query) | 8,000 characters  | 414 (the UI refuses to send it)    |
| Rate                     | 100 requests/s/IP | 429                                |

Search `q` ranks exact ICAO/IATA matches first, then full-text, then fuzzy name/city. Requests are
rate limited per IP (default 100 per second, `RATE_LIMIT_LIMIT` / `RATE_LIMIT_TTL_MS`); `/health`
is exempt.

## Data

Source: the GADB airports table in `data/gadb_postgresql_create_airports_table.sql`, MIT licensed,
copyright Arash Partow (<https://www.partow.net>). The seed script **parses** the file; it never
executes it. Cleaning rules:

- Drop rows with name `N/A`, `0/0` coordinates, or a `U` latitude/longitude direction, plus a short
  explicit list of known-bad rows (`PCIS` Canton Island has a wrong longitude).
- `iata_code` of `N/A` becomes NULL. ICAO is the unique natural key; IATA is nullable and not
  unique (14 duplicates).
- Names, cities and countries are title-cased at import; codes stay uppercase.
- Altitude is converted from meters to whole feet (`altitude_ft`).
- Source typos are kept as-is (for example the country `Engalnd`).

The result is **4,187** airports.

## Repository layout

```
apps/api         NestJS 12 (ESM), TypeORM, PostGIS
apps/web         React 19, Vite, Tailwind, react-leaflet, TanStack Query
packages/shared  API contract types and unit helpers (built to dist/)
data/            GADB source SQL
docker/db        Postgres + PostGIS image
docker/api       App image (API + built web UI) and entrypoint
docker-compose.yml        db + app
docker-compose.e2e.yml    throwaway stack for Playwright (port 3100)
```

The app image runs as the non-root `node` user, runs migrations and seeds an empty database on
start (`seed.cli.js --if-empty`), then serves the API and the built UI on port 3000.

## Conventions

- **Conventional Commits**, enforced by commitlint. Scopes: `api`, `web`, `shared`, `db`, `seed`,
  `docker`, `ci`, `deps`, `repo`.
- **Husky hooks:** pre-commit runs lint-staged (ESLint + Prettier), commit-msg runs commitlint,
  pre-push runs typecheck and unit tests.
- **`main` is protected:** changes go through a pull request and merge only when all five CI checks
  pass; direct pushes are rejected for everyone. See [docs/CI.md](docs/CI.md#branch-protection).
- **Supply-chain settings** in `pnpm-workspace.yaml`: `minimumReleaseAge` refuses package versions
  published less than 3 days ago, and `allowBuilds` blocks dependency install scripts unless
  explicitly allowed.
- CI (`.github/workflows/ci.yml`) runs lint/format/typecheck, unit, integration, e2e (API e2e plus
  Playwright against the e2e compose stack) and Docker image builds.
