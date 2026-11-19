import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepositories } from '../repositories';
import { createTestDb } from './testDb';

describe('міграції', () => {
  it('повторний запуск міграцій на існуючій базі зберігає дані', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gen-')), 'app.db');
    const first = createTestDb(file);
    const repos = createRepositories(first.db, { actor: () => null });
    await repos.users.createFirstAdmin('Адмін', '1111');
    const deviceId = repos.deviceId;
    first.sqlite.close();

    const second = createTestDb(file); // «оновлення APK»: міграції проганяються знову
    const repos2 = createRepositories(second.db, { actor: () => null });
    expect(repos2.deviceId).toBe(deviceId);
    expect(repos2.users.list().map((u) => u.name)).toEqual(['Адмін']);
    second.sqlite.close();
  });
});
