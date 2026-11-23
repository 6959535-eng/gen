import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

/**
 * Роздача оновлень додатка:
 *  - OTA за протоколом expo-updates v1: GET /api/updates/manifest (204 — немає нового;
 *    multipart з підписаним маніфестом — є), файли: /api/updates/assets/<runtime>/<id>/<file>;
 *  - APK: GET /api/app/latest (версія) і /api/app/apk/<file>.
 * Каталог otaDir наповнюється з гілки `ota` репозиторію (cron на сервері). Ключа підпису на сервері немає.
 */
const SAFE = /^[A-Za-z0-9._-]+$/;
const MIME: Record<string, string> = {
  '.hbc': 'application/javascript',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
  '.apk': 'application/vnd.android.package-archive',
};

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function registerUpdateRoutes(app: FastifyInstance, otaDir: string) {
  const updatesDir = path.join(otaDir, 'updates');
  const apkDir = path.join(otaDir, 'apk');

  app.get('/api/updates/manifest', async (req, reply) => {
    const h = req.headers;
    const q = req.query as Record<string, string | undefined>;
    const runtime = String(h['expo-runtime-version'] ?? q['runtime-version'] ?? '');
    const platform = String(h['expo-platform'] ?? q.platform ?? '');
    const current = String(h['expo-current-update-id'] ?? '');
    reply.header('expo-protocol-version', '1').header('expo-sfv-version', '0').header('cache-control', 'private, max-age=0');

    if (platform && platform !== 'android') return reply.code(204).send();
    if (!runtime || !SAFE.test(runtime)) return reply.code(400).send({ error: 'Немає expo-runtime-version' });
    const latest = readJson<{ id: string }>(path.join(updatesDir, runtime, 'latest.json'));
    if (!latest || !SAFE.test(latest.id) || latest.id === current) return reply.code(204).send();

    const dir = path.join(updatesDir, runtime, latest.id);
    if (!existsSync(path.join(dir, 'manifest.json'))) return reply.code(204).send();
    const manifest = readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    const signature = readFileSync(path.join(dir, 'manifest.sig'), 'utf8').trim();

    const boundary = `gen-${latest.id.replace(/-/g, '')}`;
    const body =
      `--${boundary}\r\n` +
      'content-disposition: form-data; name="manifest"\r\n' +
      'content-type: application/json; charset=utf-8\r\n' +
      `expo-signature: ${signature}\r\n` +
      '\r\n' +
      `${manifest}\r\n` +
      `--${boundary}--\r\n`;
    return reply.header('content-type', `multipart/mixed; boundary=${boundary}`).send(body);
  });

  app.get('/api/updates/assets/:runtime/:id/:file', async (req, reply) => {
    const { runtime, id, file } = req.params as { runtime: string; id: string; file: string };
    if (![runtime, id, file].every((s) => SAFE.test(s) && s !== '.' && s !== '..')) return reply.code(400).send();
    const p = path.join(updatesDir, runtime, id, file);
    if (!existsSync(p) || !statSync(p).isFile()) return reply.code(404).send();
    return reply
      .header('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(p));
  });

  app.get('/api/app/latest', async (_req, reply) => {
    const latest = readJson<{ versionCode: number; versionName: string; file: string; sha256: string; notes?: string }>(
      path.join(apkDir, 'latest.json'),
    );
    if (!latest) return reply.code(404).send({ error: 'Немає опублікованого APK' });
    return { ...latest, url: `/api/app/apk/${latest.file}` };
  });

  app.get('/api/app/apk/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!SAFE.test(file) || !file.endsWith('.apk')) return reply.code(400).send();
    const p = path.join(apkDir, file);
    if (!existsSync(p)) return reply.code(404).send();
    return reply
      .header('content-type', MIME['.apk'])
      .header('content-length', String(statSync(p).size))
      .header('content-disposition', `attachment; filename="${file}"`)
      .send(createReadStream(p));
  });
}
