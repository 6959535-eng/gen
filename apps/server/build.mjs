// Збирає сервер в один файл dist/main.js (код @gen/shared вбудовується; better-sqlite3 — нативний, лишається зовнішнім).
import { build } from 'esbuild';
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['better-sqlite3'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  sourcemap: true,
  logLevel: 'info',
});
