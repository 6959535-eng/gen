import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — JS-модуль без типів
import { buildUpdate } from '../../mobile/scripts/ota-lib.mjs';
import { buildApp } from '../src/app';
import { openDb } from '../src/db';

function fakeExport() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'exp-'));
  mkdirSync(path.join(dir, '_expo/static/js/android'), { recursive: true });
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, '_expo/static/js/android/entry-abc.hbc'), 'BUNDLE-BYTES');
  writeFileSync(path.join(dir, 'assets/0a328cd9c1afd0afe8e3b1ec5165b1b4'), 'PNG-BYTES');
  writeFileSync(
    path.join(dir, 'metadata.json'),
    JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          bundle: '_expo/static/js/android/entry-abc.hbc',
          assets: [{ path: 'assets/0a328cd9c1afd0afe8e3b1ec5165b1b4', ext: 'png' }],
        },
      },
    }),
  );
  return dir;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function setup() {
  const ota = mkdtempSync(path.join(os.tmpdir(), 'ota-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const app = buildApp({ db: openDb(':memory:'), otaDir: ota });
  const publish = () =>
    buildUpdate({
      exportDir: fakeExport(),
      outRoot: path.join(ota, 'updates'),
      runtimeVersion: '1',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      expoClient: { name: 'test' },
      message: 'тест',
    }) as { id: string };
  const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });
  return { app, ota, publicKey, publish, get };
}

const H = { 'expo-runtime-version': '1', 'expo-platform': 'android', 'expo-protocol-version': '1' };

/** Розбір multipart так само, як клієнт: частина manifest + її заголовки. */
function parseMultipart(contentType: string, body: string) {
  const boundary = /boundary=([^;]+)/.exec(contentType)![1]!;
  const part = body.split(`--${boundary}`)[1]!;
  const [rawHeaders, ...rest] = part.replace(/^\r\n/, '').split('\r\n\r\n');
  const headers = Object.fromEntries(
    rawHeaders!.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]),
  );
  return { headers, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') };
}

describe('OTA-оновлення', () => {
  it('немає оновлень — 204 з protocol-version 1', async () => {
    const s = setup();
    const r = await s.get('/api/updates/manifest', H);
    expect(r.statusCode).toBe(204);
    expect(r.headers['expo-protocol-version']).toBe('1');
  });

  it('є оновлення — multipart, підпис валідний, хеші збігаються з файлами', async () => {
    const s = setup();
    const { id } = s.publish();
    const r = await s.get('/api/updates/manifest', H);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/^multipart\/mixed; boundary=/);
    const part = parseMultipart(String(r.headers['content-type']), r.body);
    expect(part.headers['content-disposition']).toBe('form-data; name="manifest"');

    const sig = /sig="([^"]+)"/.exec(part.headers['expo-signature']!)![1]!;
    expect(part.headers['expo-signature']).toContain('keyid="main"');
    expect(verify('sha256', Buffer.from(part.body, 'utf8'), s.publicKey, Buffer.from(sig, 'base64'))).toBe(true);

    const m = JSON.parse(part.body);
    expect(m).toMatchObject({ id, runtimeVersion: '1', metadata: {} });
    expect(m.launchAsset.url).toMatch(/^\/api\/updates\/assets\/1\//);
    for (const a of [m.launchAsset, ...m.assets]) {
      const file = await s.get(a.url);
      expect(file.statusCode).toBe(200);
      expect(b64url(createHash('sha256').update(file.rawPayload).digest())).toBe(a.hash);
      expect(a.key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
    expect(m.assets[0]).toMatchObject({ key: '0a328cd9c1afd0afe8e3b1ec5165b1b4', fileExtension: '.png', contentType: 'image/png' });
  });

  it('вже встановлене оновлення — 204; інший runtime — 204', async () => {
    const s = setup();
    const { id } = s.publish();
    expect((await s.get('/api/updates/manifest', { ...H, 'expo-current-update-id': id })).statusCode).toBe(204);
    expect((await s.get('/api/updates/manifest', { ...H, 'expo-runtime-version': '2' })).statusCode).toBe(204);
  });

  it('підробка шляху до файлу відхиляється', async () => {
    const s = setup();
    s.publish();
    expect((await s.get('/api/updates/assets/1/..%2F..%2Fgen.db/x')).statusCode).toBe(400);
    expect((await s.get('/api/updates/assets/1/x/..')).statusCode).toBeGreaterThanOrEqual(400);
  });

  it('APK: версія й завантаження', async () => {
    const s = setup();
    expect((await s.get('/api/app/latest')).statusCode).toBe(404);
    mkdirSync(path.join(s.ota, 'apk'));
    writeFileSync(path.join(s.ota, 'apk', 'oblik-1.3.0-4.apk'), 'APK');
    writeFileSync(
      path.join(s.ota, 'apk', 'latest.json'),
      JSON.stringify({ versionCode: 4, versionName: '1.3.0', file: 'oblik-1.3.0-4.apk', sha256: 'x' }),
    );
    const latest = (await s.get('/api/app/latest')).json();
    expect(latest).toMatchObject({ versionCode: 4, url: '/api/app/apk/oblik-1.3.0-4.apk' });
    const apk = await s.get(latest.url);
    expect(apk.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(apk.body).toBe('APK');
    expect((await s.get('/api/app/apk/..%2Fgen.db')).statusCode).toBe(400);
  });
});
