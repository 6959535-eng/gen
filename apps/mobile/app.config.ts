import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Варіанти збірки (змінна APP_VARIANT задається в eas.json):
 *  - development — dev-клієнт для розробки (окремий пакет, можна ставити поруч), з мережею для Metro;
 *  - preview / production — робочий APK: без жодних мережевих дозволів.
 */
/**
 * Ідентифікатор проєкту в EAS. Один раз виконайте `npx eas-cli@latest init` у цій папці
 * і вставте сюди виданий projectId (див. README, розділ «Збірка APK»).
 */
const EAS_PROJECT_ID = '';

const variant = (process.env.APP_VARIANT ?? 'development') as 'development' | 'preview' | 'production';
const isDev = variant === 'development';

/** Дозволи, яких у робочій збірці не має бути взагалі. */
const BLOCKED = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
];
/** Мережа потрібна лише dev-клієнту (підключення до Metro). */
const BLOCKED_RELEASE = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  // додають бібліотеки, але додаток їх не використовує (біометрія, джерело встановлення з Google Play)
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isDev ? 'Генератори (dev)' : 'Облік генераторів',
  slug: 'gen-oblik',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: isDev ? 'genoblik-dev' : 'genoblik',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0e1014',
  ios: {
    supportsTablet: true,
    bundleIdentifier: isDev ? 'ua.gen.oblik.dev' : 'ua.gen.oblik',
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: isDev ? 'ua.gen.oblik.dev' : 'ua.gen.oblik',
    // Для локальної збірки (scripts/build-apk-local.sh); у EAS номер веде сервер (autoIncrement).
    versionCode: Number(process.env.GEN_VERSION_CODE ?? 1),
    adaptiveIcon: {
      backgroundColor: '#0e1014',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Резервне копіювання Android (Google Drive) вимкнено: дані не мають покидати телефон.
    allowBackup: false,
    blockedPermissions: isDev ? BLOCKED : [...BLOCKED, ...BLOCKED_RELEASE],
    // «Відкрити за допомогою» для файлів .gen (месенджери надсилають їх як application/octet-stream)
    intentFilters: [
      {
        action: 'VIEW',
        category: ['DEFAULT'],
        data: [
          { scheme: 'content', mimeType: 'application/octet-stream' },
          { scheme: 'file', mimeType: 'application/octet-stream' },
          { scheme: 'content', mimeType: 'application/x-gen' },
          { scheme: 'file', host: '*', pathPattern: '.*\\\\.gen' },
        ],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    './plugins/withReleaseSigning',
    ['expo-splash-screen', { backgroundColor: '#0e1014', image: './assets/splash-icon.png', imageWidth: 160 }],
  ],
  experiments: { typedRoutes: false },
  extra: { variant, ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}) },
});
