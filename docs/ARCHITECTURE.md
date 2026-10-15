# Architecture

Two containers: one Node process serves both the React UI and the JSON API, and one Postgres +
PostGIS database holds 4,187 airports. The API is read-only. Units at the HTTP boundary are miles
and feet; PostGIS works in meters internally. Folder-by-folder details are in
[REPO_STRUCTURE.md](REPO_STRUCTURE.md); how changes are checked (git hooks and GitHub Actions) is
in [CI.md](CI.md).

## Deployment (Docker Compose)

```mermaid
flowchart LR
  browser["Browser"]
  tiles["OpenStreetMap<br/>tile servers"]

  subgraph host["Your machine"]
    subgraph compose["docker compose"]
      subgraph app["app container"]
        nest["NestJS 12 API<br/>:3000 · user node"]
        static["serve-static<br/>built React UI"]
      end
      subgraph db["db container"]
        pg[("Postgres 17<br/>+ PostGIS 3.6<br/>:5432")]
      end
      vol[("volume<br/>db-data")]
    end
  end

  browser -- "GET / and assets" --> static
  browser -- "GET /api/v1/*" --> nest
  browser -- "map tiles" --> tiles
  static --- nest
  nest -- "TypeORM / pg<br/>DB_HOST=db" --> pg
  pg --- vol
```

|              | `app`                                                             | `db`                                                                                   |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Image        | `docker/api/Dockerfile` (multi-stage, production deps only)       | `docker/db/Dockerfile` (`postgres:17` + PGDG PostGIS)                                  |
| Port         | `${APP_PORT:-3000}` → 3000                                        | `${DB_PORT:-5432}` → 5432                                                              |
| Health       | `GET /api/v1/health` via Node `fetch`                             | `pg_isready`                                                                           |
| Starts after | `db` is healthy                                                   |                                                                                        |
| Notes        | `init: true` (tini) so `docker stop` is immediate; runs as `node` | Data persists in `db-data`; the password applies only when the volume is first created |

Both read `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` from the same Compose
variables (root `.env`, falling back to the local default `airports`). `docker-compose.e2e.yml` is
the same pair with a tmpfs database on port 3100, for Playwright.

### Local development (no app container)

```mermaid
flowchart LR
  browser["Browser"] -- ":5173" --> vite["Vite dev server<br/>HMR"]
  vite -- "proxy /api" --> nest["nest start --watch<br/>:3000 on the host"]
  nest -- "localhost:5432" --> pg[("db container")]
  env[/"root .env (optional)"/] -. "--env-file-if-exists" .-> nest
  env -. "${…} substitution" .-> pg
```

`pnpm docker:db` starts only the database; `pnpm dev` runs the API (with `NODE_ENV=development`)
and Vite side by side.

## Container startup

```mermaid
sequenceDiagram
  participant C as docker compose
  participant D as db
  participant E as entrypoint.sh
  participant S as seed.cli.js
  participant M as main.js (Nest)

  C->>D: start
  D-->>C: healthy (pg_isready)
  C->>E: start app
  E->>S: node dist/database/seed/seed.cli.js --if-empty
  S->>S: validateEnv (fails fast in production without POSTGRES_PASSWORD)
  S->>D: run pending migrations
  S->>D: SELECT count(*) FROM airports
  alt table is empty
    S->>S: parse data/gadb…sql, clean 9,300 → 4,187 rows
    S->>D: batched INSERT … ON CONFLICT (icao_code) DO UPDATE
  else already populated
    S-->>E: seed skipped
  end
  E->>M: exec node dist/main.js
  M->>D: connect (TypeORM, up to 5 retries)
  M-->>C: listening on :3000
  loop every 10s
    C->>M: HEALTHCHECK GET /api/v1/health
  end
```

## Inside the API: one request's path

Every `/api/v1` request goes through the same layers. Validation and rate limiting reject bad
traffic before any SQL runs, and every error leaves through one filter with one shape.

```mermaid
flowchart TB
  req(["HTTP request"]) --> urlcheck{"URL ≤ 8,000 chars?"}
  urlcheck -- "no" --> err
  urlcheck -- "yes" --> express["Express<br/>trust proxy → real client IP"]
  express --> route{"/api/* ?"}
  route -- "no" --> spa["serve-static<br/>index.html (SPA fallback)"]
  route -- "yes" --> throttle["ThrottlerGuard<br/>100 req / 1 s per IP<br/>(/health exempt)"]
  throttle -- "over limit" --> err
  throttle --> pipe["ValidationPipe<br/>DTOs: types, bounds, unknown params"]
  pipe -- "invalid" --> err
  pipe --> ctrl["AirportsController<br/>JSON or GeoJSON"]
  ctrl --> svc["AirportsService<br/>cross-field rules, default sort,<br/>miles ↔ meters, row → DTO"]
  svc -- "rule broken" --> err
  svc --> repo["AirportsRepository<br/>one WHERE builder, bound params only"]
  repo --> strat["SearchStrategy (SEARCH_STRATEGY)<br/>v1: TextSearchStrategy"]
  repo --> pg[("PostGIS")]
  err["HttpExceptionFilter<br/>{ statusCode, error, message }"]
```

## Call patterns: browser to database

### Page load

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (React)
  participant N as Nest (app :3000)
  participant P as PostGIS

  B->>N: GET /
  N-->>B: index.html + JS/CSS (serve-static)
  B->>B: parseState(location.search): no filters
  par table
    B->>N: GET /api/v1/airports?page=1&limit=25
    N->>P: SELECT … ORDER BY name, icao LIMIT 25 OFFSET 0
    N->>P: SELECT count(*) …
    P-->>N: 25 rows · total 4,187
    N-->>B: Paginated<AirportDto>
  and country filter options
    B->>N: GET /api/v1/countries
    N->>P: SELECT country, count(*) … GROUP BY country
    N-->>B: CountryCount[]
  end
  Note over B: No filter active: show the prompt and skip /points (no pins)
```

### Map click and radius (the main flow)

The UI keeps one query state. The circle and inputs update immediately; requests use the settled
state (250 ms debounce for typing and dragging), then fetch the table page and **every** pin in
parallel with the same filters.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser (React)
  participant N as Nest
  participant P as PostGIS

  U->>B: click map (sets center) / pick radius / drag handle
  B->>B: update state, draw circle, mirror to URL (replaceState)
  B->>B: wait for the state to settle (250 ms after the last drag step)
  par table page
    B->>N: GET /api/v1/airports?lat=51.5072&lng=-0.1276&radiusMi=30&page=1&limit=25
    N->>N: validate, default sort = distance, 30 mi → 48,280 m
    N->>P: SELECT …, ST_Distance(geog, center) AS distance_m<br/>WHERE ST_DWithin(geog, center, 48280)<br/>ORDER BY distance_m, icao_code LIMIT 25
    N->>P: SELECT count(*) … WHERE ST_DWithin(…)
    P-->>N: 9 rows (GIST index on geog)
    N-->>B: rows with distanceMi (meters → miles, 0.1)
  and every pin
    B->>N: GET /api/v1/airports/points?lat=…&lng=…&radiusMi=30
    N->>P: SELECT icao_code, ST_Y(…), ST_X(…) … WHERE ST_DWithin(…)
    N-->>B: { data: 9 points, total: 9 }
  end
  B->>U: table with Distance (mi) column + 9 canvas pins
```

### Rectangle (two clicks)

Rectangle mode draws on the client, then searches like the radius flow with `bbox` instead of
`lat`/`lng`/`radiusMi`. Distances are measured from the box's lng/lat midpoint, which the API
returns as `meta.center` for the map's crosshair.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser (React)
  participant N as Nest
  participant P as PostGIS

  U->>B: choose Rectangle (clears any radius)
  U->>B: click first corner
  B->>B: dashed preview follows the cursor (Esc cancels)
  U->>B: click opposite corner
  B->>B: rectangleFromCorners: order corners, normalize world-copy longitudes,<br/>refuse antimeridian or zero-size boxes (no request)
  B->>B: bbox into state + URL (no refit: the user is looking at it)
  par table page
    B->>N: GET /api/v1/airports?bbox=-1,51,1,52&page=1&limit=25
    N->>N: validate, one area only, default sort = distance from (0, 51.5)
    N->>P: SELECT …, ST_Distance(geog, midpoint) AS distance_m<br/>WHERE ST_DWithin(geog, covering circle) AND lng/lat BETWEEN box<br/>ORDER BY distance_m, icao_code
    N-->>B: rows with distanceMi + meta.center {lat: 51.5, lng: 0}
  and every pin
    B->>N: GET /api/v1/airports/points?bbox=-1,51,1,52
    N-->>B: { data: 15 points, total: 15 }
  end
  B->>U: rectangle, crosshair at meta.center, pins, distance column
```

### Text search combined with filters

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant N as Nest
  participant S as TextSearchStrategy
  participant P as PostGIS

  U->>B: types "heathrw" (+ country, altitude, radius…)
  B->>B: debounce 250 ms, then reset to page 1
  B->>N: GET /api/v1/airports?q=heathrw&…
  N->>S: apply(params, "heathrw")
  S-->>N: WHERE + rank fragments
  Note over S,N: match = exact ICAO/IATA OR search_vector @@ to_tsquery('heathrw:*') OR 'heathrw' <% name/city<br/>rank = exact code, ts_rank, word_similarity
  N->>P: SELECT … WHERE (text match) AND country = ANY(…) AND altitude_ft >= … AND ST_DWithin(…)<br/>ORDER BY code match DESC, ts_rank DESC, similarity DESC, icao_code
  Note over P: btree (codes), GIN (search_vector), GIN trigram (name, city), GIST (geog)
  P-->>N: Heathrow first (typo matched by trigram)
  N-->>B: Paginated<AirportDto>
```

### Errors and rate limiting

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nest
  participant P as PostGIS

  B->>N: GET /api/v1/airports?radiusMi=10 (no lat/lng)
  N-->>B: 400 { statusCode: 400, error: "Bad Request", message: ["lat, lng and radiusMi must be given together"] }
  Note over N,P: rejected before any SQL

  loop more than 100 requests in 1 s from one IP
    B->>N: GET /api/v1/…
  end
  N-->>B: 429 + Retry-After { statusCode: 429, … }
  B->>B: alert above the table: "Too many requests. Please wait a moment and try again."
```

## Data model

```mermaid
erDiagram
  AIRPORTS {
    serial id PK
    char icao_code UK "4 chars, ^[A-Z0-9]{4}$"
    char iata_code "3 chars, nullable, not unique"
    text name
    text city
    text country "kept as in source, e.g. Engalnd"
    integer altitude_ft "converted from meters at import"
    geography geog "Point, SRID 4326"
    tsvector search_vector "GENERATED from codes, name, city, country"
  }
```

| Index                                      | Type               | Serves                                                                                   |
| ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `airports_icao_code_key`                   | unique btree       | `/airports/:icao`, exact code match, upserts                                             |
| `airports_iata_code`                       | btree              | exact IATA match, `hasIata`                                                              |
| `airports_geog_gist`                       | GIST               | `ST_DWithin` radius, bbox prefilter, KNN `<->` for `/nearest`, `ST_Covers` for `/within` |
| `airports_search_vector_gin`               | GIN                | full-text prefix search                                                                  |
| `airports_name_trgm`, `airports_city_trgm` | GIN `gin_trgm_ops` | typo-tolerant `<%` matching                                                              |
| `airports_country`, `airports_altitude_ft` | btree              | country and altitude filters                                                             |

Index use is asserted by `apps/api/test/integration/airports.query-plans.int-spec.ts`.

## Where each concern lives

| Concern                                                                             | Enforced in                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request shape and bounds                                                            | DTOs + global `ValidationPipe`                                                                                                                   |
| Cross-field rules (lat/lng/radius together, one area only, sort needs q or an area) | `search/search-criteria.ts`                                                                                                                      |
| SQL injection safety                                                                | `AirportsRepository` + `SqlParams` (bound parameters only); `tsquery.ts` sanitizes text                                                          |
| Rate limiting                                                                       | `ThrottlerGuard`, keyed on client IP across routes (`TRUST_PROXY` decides which hops to trust)                                                   |
| Request size (50 countries, 100-char `q`, 8,000-char URL)                           | DTO validation, `common/url-length.middleware.ts` (414) and the same checks in the web client; `common/request-size.spec.ts` pins the worst case |
| Error shape                                                                         | `HttpExceptionFilter`                                                                                                                            |
| Units                                                                               | `packages/shared/src/units.ts`, applied in the service                                                                                           |
| Production configuration safety                                                     | `config/env.validation.ts` (password required in production)                                                                                     |
| Data quality                                                                        | the seed pipeline (`database/seed/*`), pinned by tests to 4,187 rows                                                                             |
