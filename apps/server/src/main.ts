import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildApp } from './app';
import { ensureSetupCode } from './auth';
import { openDb } from './db';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'gen.db'));
const app = buildApp({ db, logger: true, otaDir: process.env.OTA_DIR ?? path.join(DATA_DIR, 'ota') });

const setup = ensureSetupCode(db);
if (setup) {
  const line = '='.repeat(60);
  // Код показується лише в журналі сервера: docker compose logs server
  console.log(`\n${line}\n  КОД ПЕРШОГО НАЛАШТУВАННЯ: ${setup}\n  Введіть його в додатку адміна: Дані й копії → Сервер.\n${line}\n`);
}

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: HOST });
