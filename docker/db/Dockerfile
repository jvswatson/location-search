# Postgres + PostGIS, built from the official multi-arch postgres image so it runs natively on
# Apple Silicon (arm64) as well as amd64 CI runners. The official postgis/postgis image is
# amd64-only.
ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}

# The base image already configures the PGDG apt repository, keyed to $PG_MAJOR.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    "postgresql-${PG_MAJOR}-postgis-3" \
    "postgresql-${PG_MAJOR}-postgis-3-scripts" \
  && rm -rf /var/lib/apt/lists/*

# Extensions are created by the app's migrations; this only makes them available up front
# for anyone connecting with psql to a fresh database.
COPY init-extensions.sql /docker-entrypoint-initdb.d/10-extensions.sql
