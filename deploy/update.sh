#!/usr/bin/env bash
# Оновлення сервера до останньої версії з GitHub (дані зберігаються).
set -euo pipefail
DIR=/opt/gen
[ "$(id -u)" = 0 ] || { echo "Запустіть від root"; exit 1; }
sqlite3 /var/lib/gen/gen.db ".backup '/var/backups/gen/gen-before-update-$(date +%F-%H%M).db'" || true
git -C "$DIR" pull --ff-only
cd "$DIR/deploy"
docker compose --env-file .env up -d --build
docker image prune -f >/dev/null
echo "Оновлено. Стан: docker compose -f $DIR/deploy/docker-compose.yml ps"
