/**
 * Підпис release-збірки власним ключем при локальній збірці.
 * Ключ і паролі беруться зі змінних середовища (GEN_KEYSTORE_FILE, GEN_KEYSTORE_PASSWORD,
 * GEN_KEY_ALIAS, GEN_KEY_PASSWORD) — у репозиторії їх немає.
 * Якщо змінних немає (напр., збірка в EAS, яка підписує своїм ключем) — нічого не змінюється.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (System.getenv('GEN_KEYSTORE_FILE')) {
                storeFile file(System.getenv('GEN_KEYSTORE_FILE'))
                storePassword System.getenv('GEN_KEYSTORE_PASSWORD')
                keyAlias System.getenv('GEN_KEY_ALIAS')
                keyPassword System.getenv('GEN_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (s.includes("System.getenv('GEN_KEYSTORE_FILE')")) return cfg;
    // 1) конфігурація підпису release поряд із debug
    s = s.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
    // 2) release-збірка: власний ключ, якщо заданий
    s = s.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('GEN_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = s;
    return cfg;
  });
};
