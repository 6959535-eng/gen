#!/usr/bin/env node
// Публікація OTA-оновлення (лише JavaScript-частина, без нового APK).
//   node scripts/publish-update.mjs --key /шлях/private-key.pem --out /шлях/до/ota-checkout [--message "Опис"]
// Далі вміст out комітиться в гілку `ota`, сервер підтягує її сам (cron, ~5 хв).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUpdate } from './ota-lib.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
if (!args.key || !args.out) {
  console.error('Використання: --key <private-key.pem> --out <каталог ota> [--message "..."]');
  process.exit(1);
}
const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const env = { ...process.env, APP_VARIANT: 'preview', EXPO_OFFLINE: '1', CI: '1' };

const config = JSON.parse(
  execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { cwd: appDir, env, encoding: 'utf8' }),
);
const runtimeVersion = config.runtimeVersion;
if (typeof runtimeVersion !== 'string') throw new Error('runtimeVersion має бути рядком в app.config.ts');

const exportDir = mkdtempSync(path.join(os.tmpdir(), 'gen-ota-'));
execFileSync('npx', ['expo', 'export', '--platform', 'android', '--output-dir', exportDir], { cwd: appDir, env, stdio: 'inherit' });

const updatesRoot = path.join(path.resolve(args.out), 'updates');
const res = buildUpdate({
  exportDir,
  outRoot: updatesRoot,
  runtimeVersion,
  privateKeyPem: readFileSync(args.key, 'utf8'),
  expoClient: config,
  message: args.message ?? '',
});
rmSync(exportDir, { recursive: true, force: true });

// Зберігаємо лише 3 останні оновлення цієї версії середовища
const rtDir = path.join(updatesRoot, runtimeVersion);
const old = readdirSync(rtDir)
  .filter((d) => statSync(path.join(rtDir, d)).isDirectory())
  .map((d) => ({ d, t: JSON.parse(readFileSync(path.join(rtDir, d, 'manifest.json'), 'utf8')).createdAt }))
  .sort((a, b) => (a.t < b.t ? 1 : -1))
  .slice(3);
for (const o of old) rmSync(path.join(rtDir, o.d), { recursive: true, force: true });

console.log(`\nОновлення ${res.id} (runtime ${runtimeVersion}) готове в ${res.dir}`);
