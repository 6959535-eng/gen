import {
  buildExportPayload,
  checkIntegrity,
  DEFAULT_FUEL_TYPES,
  HOUR,
  MINUTE,
  parseExportPayload,
  type User,
} from '@gen/shared';
import { describe, expect, it } from 'vitest';
import { auditLog, outbox } from '../db/schema';
import { RepoError } from '../repositories';
import { seedDemo } from '../dev/seed';
import { createTestRepos } from './testDb';

const DT = DEFAULT_FUEL_TYPES[2].id;

async function setup() {
  const t = createTestRepos();
  const admin = await t.repos.users.createFirstAdmin('Адмін', '1111');
  t.setActor({ id: admin.id, role: 'admin', name: admin.name });
  const operator = await t.repos.users.create({ name: 'Оператор', role: 'operator', pin: '2222' });
  const gen = t.repos.generators.create({
    name: 'Г-1', inventoryNo: '', model: '', powerW: null, fuelTypeId: DT, tankMl: 50_000, normMlPerH: 5_000,
    initialHoursMin: 6000, serviceIntervalMin: 15000, status: 'active', responsible: '', note: '',
  });
  const asAdmin = () => t.setActor({ id: admin.id, role: 'admin', name: admin.name });
  const asOperator = () => t.setActor({ id: operator.id, role: 'operator', name: operator.name });
  return { ...t, admin, operator, gen, asAdmin, asOperator };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as RepoError).code;
  }
  return 'ok';
};

describe('профілі та PIN', () => {
  it('перший адмін створюється лише раз', async () => {
    const t = await setup();
    await expect(t.repos.users.createFirstAdmin('Ще', '1234')).rejects.toMatchObject({ code: 'conflict_state' });
  });

  it('невірний PIN 5 разів → блокування, вірний після паузи — вхід', async () => {
    const t = await setup();
    for (let i = 0; i < 4; i++) expect(await t.repos.users.verify(t.operator.id, '0000')).toMatchObject({ reason: 'wrong' });
    expect(await t.repos.users.verify(t.operator.id, '0000')).toMatchObject({ reason: 'wrong', attemptsLeft: 0 });
    expect(await t.repos.users.verify(t.operator.id, '2222')).toMatchObject({ reason: 'locked' });
    t.advance(61_000);
    expect(await t.repos.users.verify(t.operator.id, '2222')).toMatchObject({ ok: true });
  });

  it('заблокований (неактивний) профіль не входить; останнього адміна не можна прибрати', async () => {
    const t = await setup();
    t.repos.users.update(t.operator.id, { isActive: false });
    expect(await t.repos.users.verify(t.operator.id, '2222')).toMatchObject({ reason: 'inactive' });
    expect(code(() => t.repos.users.update(t.admin.id, { role: 'operator' }))).toBe('conflict_state');
  });

  it('хеш PIN не потрапляє в журнал змін', async () => {
    const t = await setup();
    const rows = t.db.select().from(auditLog).all();
    const userEntries = rows.filter((r) => r.entity === 'users');
    expect(userEntries.length).toBe(2);
    for (const r of userEntries) expect(r.afterJson).toMatch(/"pinHash":"\*\*\*[0-9a-f]{6}"/);
  });
});

describe('запис: outbox, журнал, службові поля', () => {
  it('create/update/delete пишуть outbox і журнал, version зростає, видалення мʼяке', async () => {
    const t = await setup();
    const before = t.db.select().from(outbox).all().length;
    const r = t.repos.refuels.create({
      generatorId: t.gen.id, fuelTypeId: 'ignored-will-be-replaced' as never, at: t.now() - HOUR,
      volumeMl: 10_000, isFull: false, source: 'warehouse', meterMin: null, note: '',
    });
    expect(r.fuelTypeId).toBe(DT);
    t.advance(MINUTE);
    const u = t.repos.refuels.update(r.id, { volumeMl: 12_000 });
    expect(u.version).toBe(2);
    t.advance(MINUTE);
    const d = t.repos.refuels.remove(r.id);
    expect(d.deletedAt).not.toBeNull();
    expect(t.repos.refuels.get(r.id)).toBeTruthy(); // запис фізично лишився
    const ops = t.db.select().from(outbox).all().slice(before).map((o) => o.op);
    expect(ops).toEqual(['insert', 'update', 'delete']);
    const audit = t.repos.audit.list({ entityId: r.id });
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'delete', 'update']);
    const upd = audit.find((a) => a.action === 'update')!;
    expect(JSON.parse(upd.beforeJson!).volumeMl).toBe(10_000);
    expect(JSON.parse(upd.afterJson!).volumeMl).toBe(12_000);
  });

  it('updated_at зростає навіть якщо годинник телефона перевели назад', async () => {
    const t = await setup();
    const g = t.repos.generators.update(t.gen.id, { note: 'a' });
    t.advance(-3 * HOUR);
    const g2 = t.repos.generators.update(t.gen.id, { note: 'b' });
    expect(g2.updatedAt).toBeGreaterThan(g.updatedAt);
  });
});

describe('права', () => {
  it('оператор не керує генераторами та налаштуваннями', async () => {
    const t = await setup();
    t.asOperator();
    expect(code(() => t.repos.generators.update(t.gen.id, { name: 'x' }))).toBe('forbidden');
    expect(code(() => t.repos.settings.set('autoLockMinutes', 10))).toBe('forbidden');
    expect(code(() => t.repos.audit.list())).toBe('forbidden');
  });

  it('оператор редагує й видаляє свої записи 24 год, чужі — ні', async () => {
    const t = await setup();
    const adminRefuel = t.repos.refuels.create({
      generatorId: t.gen.id, fuelTypeId: DT, at: t.now() - HOUR, volumeMl: 1000, isFull: false, source: 'other', meterMin: null, note: '',
    });
    t.asOperator();
    const own = t.repos.refuels.create({
      generatorId: t.gen.id, fuelTypeId: DT, at: t.now(), volumeMl: 1000, isFull: false, source: 'other', meterMin: null, note: '',
    });
    expect(code(() => t.repos.refuels.update(adminRefuel.id, { volumeMl: 2000 }))).toBe('forbidden');
    t.advance(23 * HOUR);
    expect(code(() => t.repos.refuels.update(own.id, { volumeMl: 2000 }))).toBe('ok');
    t.advance(2 * HOUR);
    expect(code(() => t.repos.refuels.remove(own.id))).toBe('forbidden');
  });

  it('оператор може зупинити генератор, запущений іншим', async () => {
    const t = await setup();
    const s = t.repos.sessions.start(t.gen.id);
    t.advance(30 * HOUR);
    t.asOperator();
    expect(t.repos.sessions.stop(s.id).endedAt).toBe(t.now());
  });
});

describe('сесії, заправки: валідація', () => {
  it('другий запуск того ж генератора — помилка', async () => {
    const t = await setup();
    t.repos.sessions.start(t.gen.id);
    expect(code(() => t.repos.sessions.start(t.gen.id))).toBe('validation');
  });

  it('мотогодини не зменшуються; генератор у ремонті не запускається', async () => {
    const t = await setup();
    const s = t.repos.sessions.start(t.gen.id, { startMeterMin: 6100 });
    t.advance(HOUR);
    expect(code(() => t.repos.sessions.stop(s.id, { endMeterMin: 6000 }))).toBe('validation');
    t.repos.sessions.stop(s.id, { endMeterMin: 6160 });
    t.repos.generators.update(t.gen.id, { status: 'repair' });
    expect(code(() => t.repos.sessions.start(t.gen.id))).toBe('validation');
  });

  it('заправка більше бака — потрібне підтвердження', async () => {
    const t = await setup();
    const f = { generatorId: t.gen.id, fuelTypeId: DT, at: t.now(), volumeMl: 70_000, isFull: true, source: 'warehouse' as const, meterMin: null, note: '' };
    expect(t.repos.refuels.validate(f).warnings[0]!.code).toBe('over_tank');
    expect(code(() => t.repos.refuels.create(f))).toBe('needs_confirmation');
    expect(code(() => t.repos.refuels.create(f, { confirm: true }))).toBe('ok');
  });
});

describe('імпорт між телефонами', () => {
  async function exportFrom(t: Awaited<ReturnType<typeof setup>>) {
    const payload = buildExportPayload(t.repos.data.snapshot(), {
      kind: 'export', appVersion: 'test', deviceId: t.repos.deviceId, exportedAt: t.now(), exportedBy: t.admin.id,
    });
    const parsed = parseExportPayload(JSON.parse(JSON.stringify(payload)));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.payload;
  }

  it('новий телефон: перший імпорт переносить усе; повторний — нічого не змінює', async () => {
    const A = await setup();
    A.repos.sessions.start(A.gen.id);
    const file = await exportFrom(A);

    // Телефон B: тимчасовий адмін, щоб мати право імпорту
    const B = createTestRepos();
    const tmp = await B.repos.users.createFirstAdmin('Тимчасовий', '9999');
    B.setActor({ id: tmp.id, role: 'admin', name: tmp.name });
    expect(B.repos.deviceId).not.toBe(A.repos.deviceId);

    const preview = B.repos.data.planImport(file.tables);
    expect(preview.totals.inserts).toBeGreaterThan(0);
    expect(preview.totals.conflicts).toBe(0); // дефолтні типи пального й налаштування однакові
    B.repos.data.applyImport(file.tables, { sourceDeviceId: file.deviceId, exportedAt: file.exportedAt });
    expect(B.repos.generators.list().map((g) => g.name)).toEqual(['Г-1']);
    expect(B.repos.sessions.listOpen()).toHaveLength(1);

    const snap1 = B.repos.data.snapshot();
    const again = B.repos.data.applyImport(file.tables, { sourceDeviceId: file.deviceId, exportedAt: file.exportedAt });
    expect(again.plan.isNoop).toBe(true);
    expect(B.repos.data.snapshot()).toEqual(snap1);
  });

  it('паралельні правки: конфлікт у журналі; дві відкриті сесії — попередження цілісності', async () => {
    const A = await setup();
    const fileA0 = await exportFrom(A);
    const B = createTestRepos(A.now());
    const tmp = await B.repos.users.createFirstAdmin('Тимчасовий', '9999');
    B.setActor({ id: tmp.id, role: 'admin', name: tmp.name });
    B.repos.data.applyImport(fileA0.tables, { sourceDeviceId: fileA0.deviceId, exportedAt: fileA0.exportedAt });
    B.setActor({ id: A.admin.id, role: 'admin', name: 'Адмін' });

    // Обидва телефони офлайн змінюють той самий генератор і обидва запускають його
    A.advance(MINUTE);
    A.repos.generators.update(A.gen.id, { note: 'з телефона A' });
    A.repos.sessions.start(A.gen.id);
    B.advance(2 * MINUTE);
    B.repos.generators.update(A.gen.id, { note: 'з телефона B' });
    B.repos.sessions.start(A.gen.id);

    const fileB = await exportFrom({ ...A, repos: B.repos, now: B.now } as never);
    const res = A.repos.data.applyImport(fileB.tables, { sourceDeviceId: fileB.deviceId, exportedAt: fileB.exportedAt });
    expect(res.plan.totals.conflicts).toBe(1);
    expect(A.repos.generators.get(A.gen.id)!.note).toBe('з телефона B'); // пізніша правка
    expect(A.repos.audit.list({ entityId: A.gen.id }).some((e) => e.action === 'import_conflict')).toBe(true);
    expect(res.integrity.map((i) => i.code)).toContain('multiple_open');
  });

  it('відновлення: повна заміна даних', async () => {
    const A = await setup();
    const snap = A.repos.data.snapshot();
    A.repos.generators.create({ ...A.gen, name: 'Зайвий' } as never);
    expect(A.repos.generators.list()).toHaveLength(2);
    A.repos.data.replaceAll(snap, 'тест');
    expect(A.repos.generators.list()).toHaveLength(1);
    expect(A.repos.audit.list().some((e) => e.action === 'restore')).toBe(true);
  });
});

describe('демо-дані', () => {
  it('seed створює 3 генератори, 2 профілі, 2 тижні записів без порушень цілісності', async () => {
    const t = createTestRepos();
    const res = await seedDemo(t.repos, t.setActor, t.now());
    expect(t.repos.users.list()).toHaveLength(2);
    expect(t.repos.generators.list()).toHaveLength(3);
    expect(t.repos.sessions.listAll().length).toBeGreaterThan(28);
    expect(t.repos.sessions.listOpen()).toHaveLength(1);
    expect(checkIntegrity(t.repos.data.snapshot())).toEqual([]);
    expect((res.admin as User).role).toBe('admin');
  });
});

describe('склад окремо від генераторів', () => {
  it('заправка зі «Склад» не списує; видача списує; інвентаризація встановлює залишок', async () => {
    const t = await setup();
    t.repos.fuel.receipts.create({ at: t.now() - 5 * HOUR, fuelTypeId: DT, volumeMl: 100_000, supplier: 'АЗС', note: '' });
    t.repos.refuels.create({
      generatorId: t.gen.id, fuelTypeId: DT, at: t.now() - 4 * HOUR, volumeMl: 30_000, isFull: true, source: 'warehouse', meterMin: null, note: '',
    });
    expect(t.repos.fuel.balanceNow(DT)).toBe(100_000);
    t.repos.fuel.issues.create({ at: t.now() - 3 * HOUR, fuelTypeId: DT, volumeMl: 25_000, recipient: 'авто', note: '' });
    expect(t.repos.fuel.balanceNow(DT)).toBe(75_000);
    t.repos.fuel.inventories.create({ at: t.now() - 2 * HOUR, fuelTypeId: DT, actualMl: 70_000, note: '' });
    expect(t.repos.fuel.balanceNow(DT)).toBe(70_000);
  });

  it('видача більше залишку — потрібне підтвердження; оператор може видавати', async () => {
    const t = await setup();
    t.asOperator();
    const f = { at: t.now(), fuelTypeId: DT, volumeMl: 5_000, recipient: 'авто', note: '' };
    expect(code(() => t.repos.fuel.issues.create(f))).toBe('needs_confirmation');
    expect(code(() => t.repos.fuel.issues.create(f, { confirm: true }))).toBe('ok');
  });
});
