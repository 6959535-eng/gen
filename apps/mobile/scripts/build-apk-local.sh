#!/usr/bin/env bash
# Локальна збірка робочого APK (без EAS).
# Потрібно: JDK 17+, Android SDK (ANDROID_HOME), файл з ключем підпису:
#   GEN_SIGNING_ENV=/шлях/до/signing.env GEN_VERSION_CODE=2 ./scripts/build-apk-local.sh
# signing.env містить GEN_KEYSTORE_FILE, GEN_KEYSTORE_PASSWORD, GEN_KEY_ALIAS, GEN_KEY_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ANDROID_HOME:?Задайте ANDROID_HOME (шлях до Android SDK)}"
: "${GEN_SIGNING_ENV:?Задайте GEN_SIGNING_ENV (файл signing.env з ключем підпису)}"
: "${GEN_VERSION_CODE:?Задайте GEN_VERSION_CODE (ціле число, більше за попередню збірку)}"
set -a; source "$GEN_SIGNING_ENV"; set +a
export APP_VARIANT=preview GEN_VERSION_CODE

cp package.json /tmp/gen-package.json.bak
rm -rf android
CI=1 npx expo prebuild --platform android --no-install
cp /tmp/gen-package.json.bak package.json   # prebuild переписує скрипти — повертаємо як було

cd android
# Повторні спроби завантаження залежностей (повільна / обмежена мережа)
./gradlew --no-daemon assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
  -Dorg.gradle.internal.repository.max.retries=12 \
  -Dorg.gradle.internal.repository.initial.backoff=3000 \
  ${GRADLE_EXTRA_ARGS:-}
OUT=app/build/outputs/apk/release/app-release.apk
VERSION=$(node -p "require('../package.json').version")
mkdir -p ../dist
cp "$OUT" "../dist/oblik-generatoriv-${VERSION}-${GEN_VERSION_CODE}.apk"
echo "Готово: apps/mobile/dist/oblik-generatoriv-${VERSION}-${GEN_VERSION_CODE}.apk"
