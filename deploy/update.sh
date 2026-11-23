#!/usr/bin/env bash
# Оновлення сервера до останньої версії з GitHub (дані зберігаються).
# Тіло — у функції: bash спершу читає її повністю, тож `git pull`, що змінює цей файл, нічого не зламає.
set -euo pipefail
main() {
  local DIR=/opt/gen
  [ "$(id -u)" = 0 ] || { echo "Запустіть від root"; exit 1; }
  mkdir -p /var/backups/gen
  sqlite3 /var/lib/gen/gen.db ".backup '/var/backups/gen/gen-before-update-$(date +%F-%H%M).db'" || true
  git -C "$DIR" pull -q --ff-only
  # Оновлення додатка з гілки `ota` — кожні 5 хвилин
  chmod +x "$DIR/deploy/ota-sync.sh"
  echo "*/5 * * * * root $DIR/deploy/ota-sync.sh >/dev/null 2>&1" > /etc/cron.d/gen-ota
  "$DIR/deploy/ota-sync.sh" || echo "Увага: не вдалося отримати гілку ota (буде повтор за 5 хв)"
  cd "$DIR/deploy"
  docker compose --env-file .env up -d --build
  docker image prune -f >/dev/null
  echo
  echo "✅ Оновлено. Стан: docker compose -f $DIR/deploy/docker-compose.yml ps"
  exit 0
}
main "$@"
