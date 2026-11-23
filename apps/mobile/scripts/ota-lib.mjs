// Збирання OTA-оновлення за протоколом expo-updates (v1) з виводу `expo export`.
// Сервер лише віддає готові файли; підпис робиться тут ключем, якого на сервері немає.
import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json',
  xml: 'application/xml', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
};

export const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const sha256b64url = (buf) => b64url(createHash('sha256').update(buf).digest());

/** Підпис тіла маніфесту: значення заголовка expo-signature (структуроване поле). */
export function signManifest(body, privateKeyPem, keyid = 'main') {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign('sha256', Buffer.from(body, 'utf8'), key).toString('base64');
  return `sig="${sig}", keyid="${keyid}", alg="rsa-v1_5-sha256"`;
}

/**
 * exportDir — результат `expo export --platform android`; outRoot — корінь сховища оновлень
 * (<outRoot>/<runtime>/<id>/...). URL файлів відносні від хоста (/api/updates/assets/...),
 * тож оновлення не привʼязане до домену сервера.
 */
export function buildUpdate({ exportDir, outRoot, runtimeVersion, privateKeyPem, expoClient, message = '', now = new Date() }) {
  const meta = JSON.parse(readFileSync(path.join(exportDir, 'metadata.json'), 'utf8'));
  const android = meta.fileMetadata?.android;
  if (!android?.bundle) throw new Error('У metadata.json немає Android-бандла');
  const id = randomUUID();
  const dir = path.join(outRoot, runtimeVersion, id);
  mkdirSync(dir, { recursive: true });
  const urlFor = (file) => `/api/updates/assets/${encodeURIComponent(runtimeVersion)}/${id}/${file}`;

  const bundleBuf = readFileSync(path.join(exportDir, android.bundle));
  const bundleHash = sha256b64url(bundleBuf);
  copyFileSync(path.join(exportDir, android.bundle), path.join(dir, 'bundle.hbc'));
  const launchAsset = {
    hash: bundleHash,
    key: `bundle-${bundleHash.slice(0, 16).replace(/[^A-Za-z0-9]/g, 'x')}`,
    fileExtension: '.bundle',
    contentType: 'application/javascript',
    url: urlFor('bundle.hbc'),
  };

  const assets = [];
  const seen = new Set();
  for (const a of android.assets ?? []) {
    const key = path.basename(a.path);
    if (seen.has(key)) continue;
    seen.add(key);
    const buf = readFileSync(path.join(exportDir, a.path));
    const file = `${key}.${a.ext}`;
    copyFileSync(path.join(exportDir, a.path), path.join(dir, file));
    assets.push({
      hash: sha256b64url(buf),
      key,
      fileExtension: `.${a.ext}`,
      contentType: MIME[a.ext] ?? 'application/octet-stream',
      url: urlFor(file),
    });
  }

  const manifest = {
    id,
    createdAt: now.toISOString(),
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: { expoClient, message },
  };
  const body = JSON.stringify(manifest);
  const signature = signManifest(body, privateKeyPem);
  writeFileSync(path.join(dir, 'manifest.json'), body);
  writeFileSync(path.join(dir, 'manifest.sig'), signature);
  const latest = { id, createdAt: manifest.createdAt, message, assets: assets.length };
  writeFileSync(path.join(outRoot, runtimeVersion, 'latest.json'), JSON.stringify(latest, null, 2));
  return { id, dir, manifest, signature };
}
