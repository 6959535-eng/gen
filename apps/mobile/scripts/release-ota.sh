#!/usr/bin/env bash
# Випуск оновлення для всіх телефонів через сервер (гілка `ota`; сервер підтягує її кожні 5 хв).
#
#   Лише OTA (JavaScript):  ./scripts/release-ota.sh --key ~/gen-signing/updates-keys/private-key.pem --message "Що змінилось"
#   + новий APK:            ... --apk dist/oblik-generatoriv-1.4.0-5.apk --version-code 5 --version-name 1.4.0 --notes "Що нового"
#   Лише APK:               ... --apk ... --no-ota
#
# Гілка `ota` містить лише поточний стан (3 останні OTA-оновлення + останній APK) — історія не накопичується.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="" MESSAGE="" APK="" VCODE="" VNAME="" NOTES="" OTA=1
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2;;
    --message) MESSAGE="$2"; shift 2;;
    --apk) APK="$2"; shift 2;;
    --version-code) VCODE="$2"; shift 2;;
    --version-name) VNAME="$2"; shift 2;;
    --notes) NOTES="$2"; shift 2;;
    --no-ota) OTA=0; shift;;
    *) echo "Невідомий параметр: $1"; exit 1;;
  esac
done
[ "$OTA" = 0 ] || [ -f "$KEY" ] || { echo "Потрібен --key (приватний ключ підпису оновлень)"; exit 1; }
REMOTE=$(git remote get-url origin)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if git ls-remote --exit-code --heads origin ota >/dev/null 2>&1; then
  git clone -q --depth 1 --branch ota --single-branch "$REMOTE" "$WORK/ota"
else
  mkdir -p "$WORK/ota" && git -C "$WORK/ota" init -q && git -C "$WORK/ota" remote add origin "$REMOTE"
fi

if [ "$OTA" = 1 ]; then
  node scripts/publish-update.mjs --key "$KEY" --out "$WORK/ota" --message "$MESSAGE"
fi

if [ -n "$APK" ]; then
  [ -n "$VCODE" ] && [ -n "$VNAME" ] || { echo "Для --apk потрібні --version-code і --version-name"; exit 1; }
  rm -rf "$WORK/ota/apk" && mkdir -p "$WORK/ota/apk"
  NAME="oblik-generatoriv-${VNAME}-${VCODE}.apk"
  cp "$APK" "$WORK/ota/apk/$NAME"
  SHA=$(sha256sum "$APK" | cut -d' ' -f1)
  node -e 'const [f,code,name,file,sha,notes]=process.argv.slice(1);require("fs").writeFileSync(f,JSON.stringify({versionCode:Number(code),versionName:name,file,sha256:sha,notes},null,2))' \
    "$WORK/ota/apk/latest.json" "$VCODE" "$VNAME" "$NAME" "$SHA" "$NOTES"
fi

cd "$WORK/ota"
cat > README.md <<'MD'
# Гілка `ota`
Оновлення додатка, які сервер роздає телефонам (OTA — підписані ключем команди; APK).
Створюється скриптом `apps/mobile/scripts/release-ota.sh`; вручну не редагувати.
MD
git checkout -q --orphan release
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-$(git -C "$OLDPWD" config user.name)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git -C "$OLDPWD" config user.email)}" \
  commit -q -m "Оновлення: ${MESSAGE:-$NOTES}" ${OTA_COMMIT_TRAILER:+-m "$OTA_COMMIT_TRAILER"}
git -c push.negotiate=true push -q -f origin release:ota
echo "✅ Опубліковано в гілку ota. Сервер підтягне протягом 5 хвилин, телефони — при наступному запуску."
