#!/usr/bin/env bash
# Підтягує оновлення додатка (гілка `ota`: OTA-оновлення й APK) у /var/lib/gen/ota.
# Запускається cron-ом кожні 5 хвилин. Підписи перевіряє телефон, тож GitHub — лише транспорт.
set -euo pipefail
REPO="https://github.com/6959535-eng/gen.git"
DIR=/var/lib/gen/ota
git ls-remote --exit-code --heads "$REPO" ota >/dev/null 2>&1 || exit 0
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q --depth 1 origin ota
  git -C "$DIR" reset -q --hard FETCH_HEAD
  git -C "$DIR" clean -qfdx
else
  rm -rf "$DIR"
  git clone -q --depth 1 --branch ota --single-branch "$REPO" "$DIR"
fi
