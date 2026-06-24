#!/bin/sh
set -e

echo "[entrypoint] running database migrations..."
npm run migration:run:prod

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] seeding initial data..."
  npm run seed:prod || echo "[entrypoint] seed skipped/failed (probably already seeded)"
fi

echo "[entrypoint] starting API + UI on port ${PORT:-3000}..."
exec node dist/main.js
