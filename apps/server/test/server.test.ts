import { DEFAULT_FUEL_TYPES, hashPin, HOUR, uuidv7, type PushResponse, type PullResponse, type User } from '@gen/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { ensureSetupCode } from '../src/auth';
import { openDb } from '../src/db';

const T0 = Date.UTC(2026, 10, 20, 8);
const DEV_A = uuidv7(T0);
const DEV_B = uuidv7(T0 + 1);

async function user(name: string, role: 'admin' | 'operator', at = T0): Promise<User> {
  const id = uuidv7(at);
  return {
    id, createdAt: at, updatedAt: at, deletedAt: null, authorId: id, deviceId: DEV_A, version: 1,
    name, role, isActive: true, ...(await hashPin('1111', 1000)),
  };
}

function generator(authorId: string, at = T0) {
  return {
    id: uuidv7(at), createdAt: at, updatedAt: at, deletedAt: null, authorId, deviceId: DEV_A, version: 1,
    name: 'Г-1', inventoryNo: '', model: '', powerW: null, fuelTypeId: DEFAULT_FUEL_TYPES[2].id, tankMl: 50_000,
    normMlPerH: 5_000, initialHoursMin: 0, serviceIntervalMin: 6000, status: 'active', responsible: '', note: '',
  };
}

function session(authorId: string, generatorId: string, at: number, device = DEV_A) {
  return {
    id: uuidv7(at), createdAt: at, updatedAt: at, deletedAt: null, authorId, deviceId: device, version: 1,
    generatorId, startedAt: at, endedAt: null, startMeterMin: null, endMeterMin: null, note: '',
  };
}

async function setup() {
  let now = T0;
  const db = openDb(':memory:');
  const code = ensureSetupCode(db)!;
  const app = buildApp({ db, now: () => now });
  const admin = await user('Адмін', 'admin');
  const op = await user('Оператор', 'operator', T0 + 2);

  const pair = await app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code, deviceId: DEV_A, deviceName: 'A', actorId: admin.id } });
  const tokenA = pair.json().deviceToken as string;
  const call = (token: string) => ({
    push: async (actorId: string, changes: { entity: string; row: object; actorId?: string }[], mode = 'normal') =>
      (await app.inject({
        method: 'POST', url: '/api/v1/sync/push', headers: { authorization: `Bearer ${token}` },
        payload: { mode, actorId, changes: changes.map((c, i) => ({ opId: `op${i}`, actorId: c.actorId ?? actorId, entity: c.entity, row: c.row })) },
      })).json() as PushResponse,
    pull: async (cursor = 0, limit?: number) =>
      (await app.inject({ method: 'GET', url: `/api/v1/sync/pull?cursor=${cursor}${limit ? `&limit=${limit}` : ''}`, headers: { authorization: `Bearer ${token}` } })).json() as PullResponse,
    raw: (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } }),
  });
  const A = call(tokenA);
  // Початковий знімок від першого пристрою
  await A.push(admin.id, [{ entity: 'users', row: admin }, { entity: 'users', row: op }], 'snapshot');
  return { app, db, code, admin, op, A, call, advance: (ms: number) => (now += ms), now: () => now };
}

describe('підключення пристроїв', () => {
  it('код налаштування діє лише для першого пристрою; далі — одноразові коди від адміна', async () => {
    const s = await setup();
    const again = await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code: s.code, deviceId: DEV_B, deviceName: 'B' } });
    expect(again.statusCode).toBe(403);

    const opCode = await s.A.raw('POST', '/api/v1/pairing-codes', { actorId: s.op.id });
    expect(opCode.statusCode).toBe(403);
    const { code } = (await s.A.raw('POST', '/api/v1/pairing-codes', { actorId: s.admin.id })).json();
    const pairB = await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code: code.toLowerCase(), deviceId: DEV_B, deviceName: 'B' } });
    expect(pairB.statusCode).toBe(200);
    expect(pairB.json().kind).toBe('pair');
    const reuse = await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code, deviceId: uuidv7(), deviceName: 'C' } });
    expect(reuse.statusCode).toBe(403);
  });

  it('без токена — 401; відкликаний пристрій — 403', async () => {
    const s = await setup();
    expect((await s.app.inject({ method: 'GET', url: '/api/v1/sync/pull' })).statusCode).toBe(401);
    const { code } = (await s.A.raw('POST', '/api/v1/pairing-codes', { actorId: s.admin.id })).json();
    const tokenB = (await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code, deviceId: DEV_B, deviceName: 'B' } })).json().deviceToken;
    await s.A.raw('POST', '/api/v1/devices/revoke', { actorId: s.admin.id, deviceId: DEV_B });
    expect((await s.call(tokenB).raw('GET', '/api/v1/sync/pull')).statusCode).toBe(403);
  });

  it('обмеження спроб підбору коду', async () => {
    const s = await setup();
    for (let i = 0; i < 10; i++) {
      await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code: 'WRONG123', deviceId: DEV_B, deviceName: 'B' } });
    }
    const r = await s.app.inject({ method: 'POST', url: '/api/v1/pair', payload: { code: 'WRONG123', deviceId: DEV_B, deviceName: 'B' } });
    expect(r.statusCode).toBe(429);
  });
});

describe('push / pull', () => {
  it('зміни одного пристрою доходять до іншого за курсором, порціями', async () => {
    const s = await setup();
    const g = generator(s.admin.id);
    const res = await s.A.push(s.admin.id, [{ entity: 'generators', row: g }]);
    expect(res.results[0]!.status).toBe('applied');
    const all = await s.A.pull(0, 2);
    expect(all.changes).toHaveLength(2);
    expect(all.hasMore).toBe(true);
    const rest = await s.A.pull(all.nextCursor);
    expect(rest.changes.map((c) => c.entity)).toEqual(['generators']);
    expect(rest.hasMore).toBe(false);
  });

  it('last-write-wins: старша версія ігнорується, новіша застосовується', async () => {
    const s = await setup();
    const g = generator(s.admin.id);
    await s.A.push(s.admin.id, [{ entity: 'generators', row: g }]);
    const newer = { ...g, name: 'Новіша', updatedAt: g.updatedAt + 10, version: 2 };
    const older = { ...g, name: 'Старіша', updatedAt: g.updatedAt + 5, version: 2, deviceId: DEV_B };
    expect((await s.A.push(s.admin.id, [{ entity: 'generators', row: newer }])).results[0]!.status).toBe('applied');
    expect((await s.A.push(s.admin.id, [{ entity: 'generators', row: older }])).results[0]!.status).toBe('stale');
    const pulled = (await s.A.pull()).changes.filter((c) => c.entity === 'generators');
    expect(pulled[0]!.row.name).toBe('Новіша');
    // паралельна правка (та сама версія) — запис конфлікту в журнал
    expect((await s.A.pull()).changes.some((c) => c.entity === 'auditLog' && c.row.action === 'import_conflict')).toBe(true);
  });

  it('повторна відправка тієї ж зміни нічого не змінює', async () => {
    const s = await setup();
    const g = generator(s.admin.id);
    await s.A.push(s.admin.id, [{ entity: 'generators', row: g }]);
    const c1 = (await s.A.pull()).nextCursor;
    expect((await s.A.push(s.admin.id, [{ entity: 'generators', row: g }])).results[0]!.status).toBe('stale');
    expect((await s.A.pull()).nextCursor).toBe(c1);
  });

  it('права перевіряються на сервері: оператор не створює генератори й не править чуже', async () => {
    const s = await setup();
    const g = generator(s.op.id);
    const r = await s.A.push(s.op.id, [{ entity: 'generators', row: g }]);
    expect(r.results[0]).toMatchObject({ status: 'rejected', serverRow: null });

    const ga = generator(s.admin.id);
    await s.A.push(s.admin.id, [{ entity: 'generators', row: ga }]);
    const adminSession = session(s.admin.id, ga.id, T0 + HOUR);
    await s.A.push(s.admin.id, [{ entity: 'workSessions', row: adminSession }]);
    const edited = { ...adminSession, note: 'зміна', updatedAt: adminSession.updatedAt + 1, version: 2 };
    expect((await s.A.push(s.op.id, [{ entity: 'workSessions', row: edited }])).results[0]!.status).toBe('rejected');

    // але зупинити чужу відкриту сесію — можна
    const stopped = { ...adminSession, endedAt: T0 + 2 * HOUR, updatedAt: T0 + 2 * HOUR, version: 2 };
    expect((await s.A.push(s.op.id, [{ entity: 'workSessions', row: stopped }])).results[0]!.status).toBe('applied');
  });

  it('оператор після 24 год не змінює свій запис (серверний час)', async () => {
    const s = await setup();
    const ga = generator(s.admin.id);
    await s.A.push(s.admin.id, [{ entity: 'generators', row: ga }]);
    const own = session(s.op.id, ga.id, T0);
    await s.A.push(s.op.id, [{ entity: 'workSessions', row: own }]);
    s.advance(25 * HOUR);
    const del = { ...own, deletedAt: s.now(), updatedAt: s.now(), version: 2 };
    const r = await s.A.push(s.op.id, [{ entity: 'workSessions', row: del }]);
    expect(r.results[0]!.status).toBe('rejected');
    expect(r.results[0]!.serverRow).toMatchObject({ deletedAt: null });
  });

  it('час з майбутнього та некоректні дані відхиляються; знімок — лише від адміна', async () => {
    const s = await setup();
    const g = { ...generator(s.admin.id), updatedAt: T0 + 3 * 24 * HOUR };
    expect((await s.A.push(s.admin.id, [{ entity: 'generators', row: g }])).results[0]!.status).toBe('rejected');
    expect((await s.A.push(s.admin.id, [{ entity: 'generators', row: { id: 'x' } }])).results[0]!.status).toBe('rejected');
    const snap = await s.A.push(s.op.id, [{ entity: 'generators', row: generator(s.op.id) }], 'snapshot');
    expect(snap.results[0]!.status).toBe('rejected');
  });
});
