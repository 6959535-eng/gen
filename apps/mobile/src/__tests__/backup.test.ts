import { DAY, DEFAULT_FUEL_TYPES, HOUR, MINUTE } from '@gen/shared';
import { describe, expect, it } from 'vitest';
import { seedDemo } from '../dev/seed';
import {
  applyImport,
  BACKUP_DIR,
  createExport,
  createManualBackup,
  importIntoEmpty,
  inspectGenFile,
  listLocalBackups,
  openGenFile,
  previewImport,
  restoreFromPayload,
  runAutoBackupIfDue,
  type FileStore,
  type SecretStore,
} from '../services/backupCore';
import { createTestRepos } from './testDb';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASS = 'пароль-команди-2026';

function memFiles(): FileStore & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    list: async (dir) => [...map.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)),
    read: async (p) => {
      const v = map.get(p);
      if (!v) throw new Error('not found');
      return v;
    },
    write: async (p, d) => void map.set(p, d),
    remove: async (p) => void map.delete(p),
  };
}
function memSecrets(): SecretStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
}

async function phone(start = Date.UTC(2026, 10, 19, 10)) {
  const t = createTestRepos(start);
  const files = memFiles();
  const secrets = memSecrets();
  const deps = () => ({ repos: t.repos, files, secrets, appVersion: 'test', now: t.now, scrypt: FAST });
  return { ...t, files, secrets, deps };
}

describe('автоматичні копії', () => {
  it('раз на добу, зберігаються останні 7', async () => {
    const p = await phone();
    await seedDemo(p.repos, p.setActor, p.now());
    expect(await runAutoBackupIfDue(p.deps())).toMatch(/^gen-auto-/);
    expect(await runAutoBackupIfDue(p.deps())).toBeNull(); // ще не минула доба
    for (let i = 0; i < 10; i++) {
      p.advance(DAY + MINUTE);
      await runAutoBackupIfDue(p.deps());
    }
    const list = await listLocalBackups(p.files);
    expect(list).toHaveLength(7);
    expect(list.every((b) => b.kind === 'auto-backup')).toBe(true);
  });

  it('автокопію відкриває лише цей телефон (ключ пристрою)', async () => {
    const p = await phone();
    await seedDemo(p.repos, p.setActor, p.now());
    const name = (await runAutoBackupIfDue(p.deps()))!;
    const bytes = p.files.map.get(`${BACKUP_DIR}/${name}`)!;
    expect(inspectGenFile(bytes).need).toBe('device');
    const { payload } = await openGenFile(p.deps(), bytes);
    expect(payload.tables.generators).toHaveLength(3);
    const other = await phone();
    await expect(openGenFile(other.deps(), bytes)).rejects.toMatchObject({ code: 'bad_password' });
  });
});

describe('ручна копія і відновлення', () => {
  it('ручна копія ставить дату для нагадування; відновлення повертає стан і робить страхувальну копію', async () => {
    const p = await phone();
    const { admin } = await seedDemo(p.repos, p.setActor, p.now());
    const manual = await createManualBackup(p.deps(), PASS);
    expect(p.repos.local.get('last_manual_backup_at')).toBe(String(manual.createdAt));

    // Після копії хтось видалив генератор
    const g = p.repos.generators.list()[0]!;
    p.repos.generators.remove(g.id);
    expect(p.repos.generators.list()).toHaveLength(2);

    const { payload } = await openGenFile(p.deps(), manual.bytes, PASS);
    p.setActor({ id: admin.id, role: 'admin', name: admin.name });
    const res = await restoreFromPayload(p.deps(), payload, 'тест');
    expect(res.safetyBackup).toMatch(/^gen-auto-/);
    expect(p.repos.generators.list()).toHaveLength(3);
    // страхувальна копія містить стан ДО відновлення (2 генератори)
    const safety = await openGenFile(p.deps(), p.files.map.get(`${BACKUP_DIR}/${res.safetyBackup}`)!);
    expect(safety.payload.tables.generators.filter((x) => x.deletedAt === null)).toHaveLength(2);
  });

  it('невірний пароль', async () => {
    const p = await phone();
    await seedDemo(p.repos, p.setActor, p.now());
    const f = await createExport(p.deps(), PASS);
    await expect(openGenFile(p.deps(), f.bytes, 'не-той-пароль')).rejects.toMatchObject({ code: 'bad_password' });
  });
});

describe('перенесення на інший телефон', () => {
  it('новий телефон: імпорт у порожню базу, вхід профілем з файла', async () => {
    const A = await phone();
    const { admin } = await seedDemo(A.repos, A.setActor, A.now());
    const file = await createExport({ ...A.deps(), actorId: admin.id }, PASS);

    const B = await phone(A.now() + HOUR);
    const { payload } = await openGenFile(B.deps(), file.bytes, PASS);
    expect(payload.exportedBy).toBe(admin.id);
    const res = importIntoEmpty(B.repos, payload);
    expect(res.plan.totals.inserts).toBeGreaterThan(50);
    expect(res.integrity).toEqual([]);
    expect(await B.repos.users.verify(admin.id, '1111')).toMatchObject({ ok: true });
    expect(B.repos.deviceId).not.toBe(A.repos.deviceId);
    // у непорожню базу так не можна
    expect(() => importIntoEmpty(B.repos, payload)).toThrow();
  });

  it('обмін в обидва боки: попередній перегляд, злиття, ідемпотентність', async () => {
    const A = await phone();
    const { admin } = await seedDemo(A.repos, A.setActor, A.now());
    const first = await openGenFile(A.deps(), (await createExport(A.deps(), PASS)).bytes, PASS);
    const B = await phone(A.now());
    importIntoEmpty(B.repos, first.payload);
    B.setActor({ id: admin.id, role: 'admin', name: admin.name });

    // На B внесли заправку, на A — надходження
    const g = B.repos.generators.list()[1]!;
    B.advance(10 * MINUTE);
    B.repos.refuels.create({
      generatorId: g.id, fuelTypeId: g.fuelTypeId, at: B.now(), volumeMl: 5_000, isFull: false, source: 'canister', meterMin: null, note: 'з B',
    });
    A.advance(5 * MINUTE);
    A.repos.fuel.receipts.create({ at: A.now(), fuelTypeId: DEFAULT_FUEL_TYPES[2].id, volumeMl: 100_000, supplier: 'з A', note: '' });

    const fromB = await openGenFile(A.deps(), (await createExport(B.deps(), PASS)).bytes, PASS);
    const preview = previewImport(A.repos, fromB.payload);
    expect(preview.entities.refuels.inserts).toHaveLength(1);
    expect(preview.totals.conflicts).toBe(0);
    const r1 = await applyImport(A.deps(), fromB.payload);
    expect(r1.safetyBackup).not.toBeNull();
    expect(A.repos.refuels.listAll().some((r) => r.note === 'з B')).toBe(true);
    const r2 = await applyImport(A.deps(), fromB.payload);
    expect(r2.plan.isNoop).toBe(true);

    const fromA = await openGenFile(B.deps(), (await createExport(A.deps(), PASS)).bytes, PASS);
    await applyImport(B.deps(), fromA.payload);
    const strip = (x: ReturnType<typeof A.repos.data.snapshot>) =>
      Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'auditLog'));
    expect(strip(B.repos.data.snapshot())).toEqual(strip(A.repos.data.snapshot()));
  });
});
