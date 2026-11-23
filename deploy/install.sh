#!/usr/bin/env bash
# Встановлення сервера синхронізації «Облік генераторів» на чистий Ubuntu (24.04 / 26.04).
# Запуск від root:
#   curl -fsSL https://raw.githubusercontent.com/6959535-eng/gen/main/deploy/install.sh | bash
# Власний домен (необовʼязково):  ... | DOMAIN=gen.example.ua bash
set -euo pipefail

REPO="https://github.com/6959535-eng/gen.git"
DIR=/opt/gen
DATA=/var/lib/gen
BACKUPS=/var/backups/gen

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Запустіть від root (sudo -i)"; exit 1; }

say "1/6 Встановлення Docker, git, sqlite3, брандмауера"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git sqlite3 ufw >/dev/null
if ! command -v docker >/dev/null; then
  apt-get install -y -qq docker.io docker-compose-v2 >/dev/null || curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-v2 >/dev/null || apt-get install -y -qq docker-compose-plugin >/dev/null
systemctl enable --now docker >/dev/null

say "2/6 Завантаження коду в $DIR"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q --ff-only; else git clone -q --depth 1 "$REPO" "$DIR"; fi

say "3/6 Адреса сервера"
if [ -z "${DOMAIN:-}" ]; then
  IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
  case "$IP" in 10.*|192.168.*|172.1[6-9].*|172.2?.*|172.3[01].*|"") IP=$(curl -4 -fsS https://api.ipify.org);; esac
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "DOMAIN=$DOMAIN" > "$DIR/deploy/.env"
echo "Адреса: https://$DOMAIN"

say "4/6 Брандмауер: відкрито лише SSH, 80, 443"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

say "5/6 Збірка й запуск (перший раз — кілька хвилин)"
mkdir -p "$DATA" "$BACKUPS"
chown 1000:1000 "$DATA"
cd "$DIR/deploy"
docker compose --env-file .env up -d --build

say "6/6 Щоденна резервна копія бази (03:15, зберігаються 30 днів)"
cat > /etc/cron.d/gen-backup <<CRON
15 3 * * * root sqlite3 $DATA/gen.db ".backup '$BACKUPS/gen-\$(date +\\%F).db'" && find $BACKUPS -name 'gen-*.db' -mtime +30 -delete
CRON

# Оновлення додатка (OTA та APK) з гілки `ota` — кожні 5 хвилин
chmod +x "$DIR/deploy/ota-sync.sh"
echo "*/5 * * * * root $DIR/deploy/ota-sync.sh >/dev/null 2>&1" > /etc/cron.d/gen-ota
"$DIR/deploy/ota-sync.sh" || true

echo "Очікування HTTPS-сертифіката…"
for i in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/v1/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 5
done

CODE=$(docker compose logs server 2>/dev/null | grep -o 'КОД ПЕРШОГО НАЛАШТУВАННЯ: [A-Z0-9]*' | tail -1 | awk '{print $NF}')
echo
echo "=================================================================="
if [ "${OK:-0}" = 1 ]; then echo " ✅ Сервер працює: https://$DOMAIN"; else echo " ⚠️  Сервер запущено, але HTTPS ще не відповідає. Перевірте: docker compose -f $DIR/deploy/docker-compose.yml logs caddy"; fi
echo
echo " Адреса для телефона:  $DOMAIN"
if [ -n "$CODE" ]; then echo " Код першого налаштування:  $CODE"; else echo " (Телефони вже підключено — код налаштування не потрібен)"; fi
echo
echo " На телефоні адміна: Дані й копії → Сервер → адреса + код → Підключити."
echo " Оновлення сервера:  bash $DIR/deploy/update.sh"
echo "=================================================================="
