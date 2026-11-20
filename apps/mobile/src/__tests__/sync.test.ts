/**
 * Наскрізний тест: два «телефони» (окремі SQLite-бази з тими ж міграціями) і справжній сервер
 * (fastify.inject, без мережі).
 */
import { DEFAULT_FUEL_TYPES, HOUR, MINUTE } from '@gen/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../server/src/app';
import { ensureSetupCode } from '../../../server/src/auth';
import { openDb } from '../../../server/src/db';
import { seedDemo } from '../dev/seed';
import type { SecretStore } from '../services/backupCore';
import {
  createPairingCode,
  disconnect,
  pairDevice,
  revokeDevice,
  serverConfig,
  syncNow,
  SyncError,
  type SyncDeps,
  type Transport,
} from '../services/syncCore';
import { createTestRepos } from './testDb';

const URL_ = 'https://gen.example.org';

function server(start: number) {
  const db = openDb(':memory:');
  const setupCode = ensureSetupCode(db)!;
  let online = true;
  const app = buildApp({ db, now: () => start + (Date.now() - realStart) });
  const realStart = Date.now();
  const transport: Transport = async ({ method, url, token, body }) => {
    if (!online) throw new Error('network down');
    const res = await app.inject({
      method,
      url: url.replace(URL_, ''),
      payload: body as object | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.statusCode, json: res.json() };
  };
  return { app, setupCode, transport, setOnline: (v: boolean) => (online = v) };
}

function memSecrets(): SecretStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
}

function phone(transport: Transport, start: number) {
  const t = createTestRepos(start);
  const secrets = memSecrets();
  let actorId: string | null = null;
  const setActor = (a: Parameters<typeof t.setActor>[0]) => {
    actorId = a?.id ?? null;
    t.setActor(a);
  };
  const deps: SyncDeps = { repos: t.repos, secrets, transport, actorId: () => actorId };
  return { ...t, setActor, deps };
}

describe('синхронізація через сервер', () => {
  it('адмін підключає телефон з даними, другий телефон отримує все й обмін іде в обидва боки', async () => {
    const start = Date.now();
    const S = server(start);
    const A = phone(S.transport, start);
    const { admin, operator } = await seedDemo(A.repos, A.setActor, A.now());
    A.setActor({ id: admin.id, role: 'admin', name: admin.name });

    // 1) Перший телефон: код налаштування → повний знімок
    const p = await pairDevice(A.deps, URL_, S.setupCode, 'Телефон A');
    expect(p.kind).toBe('setup');
    const r1 = await syncNow(A.deps);
    expect(r1.snapshotSent).toBe(true);
    expect(serverConfig(A.repos).needsSnapshot).toBe(false);
    expect(A.repos.data.outbox.pendingCount()).toBe(0);

    // 2) Новий телефон: одноразовий код від адміна, база порожня → отримує все
    const { code } = await createPairingCode(A.deps);
    const B = phone(S.transport, start);
    await pairDevice(B.deps, URL_, code, 'Телефон B');
    await syncNow(B.deps);
    expect(B.repos.generators.list()).toHaveLength(3);
    expect(await B.repos.users.verify(operator.id, '2222')).toMatchObject({ ok: true });

    // 3) Оператор на B заправляє, адмін на A приймає надходження
    B.setActor({ id: operator.id, role: 'operator', name: operator.name });
    const g = B.repos.generators.list()[1]!;
    B.repos.refuels.create({
      generatorId: g.id, fuelTypeId: g.fuelTypeId, at: Date.now() - MINUTE, volumeMl: 7_000, isFull: false,
      source: 'canister', meterMin: null, note: 'з B',
    });
    A.repos.fuel.receipts.create({ at: Date.now() - MINUTE, fuelTypeId: DEFAULT_FUEL_TYPES[2].id, volumeMl: 50_000, supplier: 'з A', note: '' });
    await syncNow(B.deps);
    await syncNow(A.deps);
    await syncNow(B.deps);
    expect(A.repos.refuels.listAll().some((r) => r.note === 'з B')).toBe(true);
    expect(B.repos.fuel.receipts.list().some((r) => r.supplier === 'з A')).toBe(true);

    const strip = (x: ReturnType<typeof A.repos.data.snapshot>) => ({ ...x, auditLog: [] });
    expect(strip(B.repos.data.snapshot())).toEqual(strip(A.repos.data.snapshot()));
  });

  it('офлайн: зміни накопичуються в outbox і відправляються, коли зʼявиться звʼязок', async () => {
    const start = Date.now();
    const S = server(start);
    const A = phone(S.transport, start);
    const { admin } = await seedDemo(A.repos, A.setActor, A.now());
    A.setActor({ id: admin.id, role: 'admin', name: admin.name });
    await pairDevice(A.deps, URL_, S.setupCode, 'A');
    await syncNow(A.deps);

    S.setOnline(false);
    const open = A.repos.sessions.listOpen()[0]!;
    A.repos.sessions.stop(open.id);
    await expect(syncNow(A.deps)).rejects.toMatchObject({ kind: 'offline' });
    expect(A.repos.data.outbox.pendingCount()).toBeGreaterThan(0);
    expect(serverConfig(A.repos).lastError).toBeNull(); // офлайн — не помилка

    S.setOnline(true);
    const r = await syncNow(A.deps);
    expect(r.pushed).toBeGreaterThan(0);
    expect(A.repos.data.outbox.pendingCount()).toBe(0);
  });

  it('сервер відхиляє заборонену зміну — телефон відкочується до серверної версії', async () => {
    const start = Date.now();
    const S = server(start);
    const A = phone(S.transport, start);
    const { admin, operator } = await seedDemo(A.repos, A.setActor, A.now());
    A.setActor({ id: admin.id, role: 'admin', name: admin.name });
    await pairDevice(A.deps, URL_, S.setupCode, 'A');
    await syncNow(A.deps);

    // На сервері оператора тим часом заблокували (зміна з іншого пристрою — імітуємо тут же)
    A.repos.users.update(operator.id, { isActive: false });
    await syncNow(A.deps);
    // «Старий» оператор вносить зміну на телефоні, де блокування ще не дійшло — на сервері її відхилено
    A.setActor({ id: operator.id, role: 'operator', name: operator.name });
    const g = A.repos.generators.list()[0]!;
    A.repos.refuels.create({
      generatorId: g.id, fuelTypeId: g.fuelTypeId, at: Date.now(), volumeMl: 1_000, isFull: false, source: 'other', meterMin: null, note: 'від заблокованого',
    });
    const r = await syncNow(A.deps);
    expect(r.rejected[0]?.reason).toMatch(/заблоковано/);
    expect(A.repos.data.outbox.rejected()[0]?.syncError).toMatch(/заблоковано/);
  });

  it('відкликаний телефон більше не синхронізується; відключення скидає налаштування', async () => {
    const start = Date.now();
    const S = server(start);
    const A = phone(S.transport, start);
    const { admin } = await seedDemo(A.repos, A.setActor, A.now());
    A.setActor({ id: admin.id, role: 'admin', name: admin.name });
    await pairDevice(A.deps, URL_, S.setupCode, 'A');
    await syncNow(A.deps);
    const { code } = await createPairingCode(A.deps);
    const B = phone(S.transport, start);
    await pairDevice(B.deps, URL_, code, 'B');
    await syncNow(B.deps);
    await revokeDevice(A.deps, B.repos.deviceId);
    await expect(syncNow(B.deps)).rejects.toBeInstanceOf(SyncError);
    await expect(syncNow(B.deps)).rejects.toMatchObject({ kind: 'revoked' });
    await disconnect(B.deps);
    expect(serverConfig(B.repos).url).toBeFalsy();
  });

  it('невірний код і адреса без https', async () => {
    const start = Date.now();
    const S = server(start);
    const A = phone(S.transport, start);
    await expect(pairDevice(A.deps, URL_, 'НЕВІРНИЙ', 'A')).rejects.toMatchObject({ kind: 'server' });
    expect(serverConfig(A.repos).url).toBeFalsy();
    await expect(pairDevice(A.deps, 'http://gen.example.org', S.setupCode, 'A')).rejects.toMatchObject({ kind: 'config' });
    void HOUR;
  });
});
