#!/usr/bin/env bash
set -euo pipefail

CONTAINER=fryte-dev-pg
VOLUME=fryte-dev-pgdata
PG_PORT="${PG_PORT:-54320}"
APP_PORT="${PORT:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--reset" ]]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  echo "dev database wiped"
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker is not running" >&2
  exit 1
fi

stop_db() {
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
}
trap stop_db EXIT

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" >/dev/null
else
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=app \
    -v "$VOLUME":/var/lib/postgresql/data \
    -p "127.0.0.1:${PG_PORT}:5432" \
    postgres:17-alpine >/dev/null
fi

echo "waiting for postgres on :${PG_PORT}"
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d app >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -d app >/dev/null

cd "$ROOT/app"
if [[ ! -d node_modules ]]; then
  npm install --no-audit --no-fund
fi

echo "app on http://localhost:${APP_PORT} (restarts on file changes; ctrl-c stops the app and the database)"
DATABASE_URL="postgres://postgres:pw@localhost:${PG_PORT}/app" \
  PORT="$APP_PORT" \
  TEAM_NAME="${TEAM_NAME:-stg-fryte}" \
  node --watch --watch-path=. server.js
