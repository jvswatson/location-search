# syntax=docker/dockerfile:1
# App image: NestJS API + built React UI served by Nest. Based on the multi-arch official node
# image, so it builds natively on Apple Silicon (arm64) and amd64 CI runners.
# Build context is the repo root:  docker build -f docker/api/Dockerfile .

FROM node:24-bookworm-slim AS base
ENV HUSKY=0 CI=true
# corepack reads the exact pnpm version from the root package.json "packageManager" field.
RUN corepack enable
WORKDIR /repo

# --- fetch: populate the pnpm store from the lockfile alone. This layer only changes when
# pnpm-lock.yaml changes, so source edits never re-download dependencies.
FROM base AS fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# --- build: install offline from that store, then build shared -> api -> web.
FROM fetch AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm build:shared \
  && pnpm --filter @location-search/api build \
  && pnpm --filter @location-search/web build
# `pnpm deploy` creates a self-contained copy of the api package with production dependencies
# only. In pnpm 12 it works on a plain workspace (no `inject-workspace-packages` or `--legacy`
# needed): the workspace dependency @location-search/shared is copied into node_modules
# (not symlinked) together with its already-built dist/, so it resolves at runtime. Not `--offline`: deploy re-verifies the minimumReleaseAge
# policy against registry metadata, which the fetched store does not contain.
RUN pnpm --filter @location-search/api deploy --prod /deploy/api

# --- runtime: no pnpm, no sources, no dev dependencies. The repo-relative layout is kept because
# the seeder resolves ../../../../../data/... from dist/database/seed.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
  PORT=3000 \
  WEB_DIST_PATH=/app/apps/web/dist
WORKDIR /app/apps/api
COPY --from=build --chown=node:node /deploy/api/package.json ./package.json
COPY --from=build --chown=node:node /deploy/api/node_modules ./node_modules
COPY --from=build --chown=node:node /deploy/api/dist ./dist
COPY --from=build --chown=node:node /repo/data/gadb_postgresql_create_airports_table.sql /app/data/gadb_postgresql_create_airports_table.sql
COPY --from=build --chown=node:node /repo/apps/web/dist /app/apps/web/dist
COPY --chown=node:node docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["entrypoint.sh"]
