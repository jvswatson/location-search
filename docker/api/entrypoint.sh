#!/bin/sh
set -e

# Apply migrations and seed the airports table on first start only.
node dist/database/seed/seed.cli.js --if-empty

# exec so Node replaces the shell and receives SIGTERM/SIGINT directly.
exec node dist/main.js
