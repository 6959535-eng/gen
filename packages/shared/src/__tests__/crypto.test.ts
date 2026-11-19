import { describe, expect, it } from 'vitest';
import {
  GenFileError, hashPin, initialLockState, isLocked, packContainer, readContainerHeader, registerFailure,
  registerSuccess, unpackContainer, verifyPin,
} from '../crypto';
import { buildExportPayload, parseExportPayload, SCHEMA_VERSION } from '../schemas/exportFile';
import { DEV_A, USER, ds, gen, session } from './fixtures';

const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe('PIN', () => {
  it('хеш з сіллю, перевірка', async () => {
    const h = await hashPin('1234', 1000);
    const h2 = await hashPin('1234', 1000);
    expect(h.pinHash).not.toBe(h2.pinHash); // різна сіль
    expect(await verifyPin('1234', h)).toBe(true);
    expect(await verifyPin('4321', h)).toBe(false);
    await expect(hashPin('12a4')).rejects.toThrow();
  });
  it('блокування: 5 спроб → 1 хв, далі зростає', () => {
    let s = initialLockState();
    for (let i = 0; i < 4; i++) s = registerFailure(s, 0);
    expect(isLocked(s, 0)).toBe(false);
    s = registerFailure(s, 0);
    expect(s.lockUntil).toBe(60_000);
    expect(isLocked(s, 59_000)).toBe(true);
    expect(isLocked(s, 60_000)).toBe(false);
    for (let i = 0; i < 5; i++) s = registerFailure(s, 60_000);
    expect(s.lockUntil).toBe(60_000 + 120_000);
    for (let i = 0; i < 5; i++) s = registerFailure(s, 0);
    expect(s.lockUntil).toBe(240_000);
    expect(registerSuccess()).toEqual(initialLockState());
  });
});

describe('файл .gen', () => {
  const g = gen();
  const data = ds({ generators: [g], workSessions: [session(g, 0, 2)] });
  const payload = buildExportPayload(data, {
    kind: 'export', appVersion: '1.0.0', deviceId: DEV_A, exportedAt: 1, exportedBy: USER,
  });

  it('шифрування паролем: туди й назад', async () => {
    const bytes = await packContainer(payload, { password: 'пароль-команди' }, { kind: 'export', scrypt: FAST });
    expect(readContainerHeader(bytes).header.kdf.name).toBe('scrypt');
    // відкритих даних у файлі немає
    expect(new TextDecoder().decode(bytes)).not.toContain('Honda');
    const { json } = await unpackContainer(bytes, { password: 'пароль-команди' });
    const parsed = parseExportPayload(json);
    expect(parsed.ok && parsed.payload.tables.generators[0]).toEqual(g);
  });

  it('невірний пароль', async () => {
    const bytes = await packContainer(payload, { password: 'пароль-команди' }, { kind: 'export', scrypt: FAST });
    await expect(unpackContainer(bytes, { password: 'інший-пароль' })).rejects.toMatchObject({ code: 'bad_password' });
  });

  it('підміна заголовка або вмісту виявляється', async () => {
    const bytes = await packContainer(payload, { password: 'пароль-команди' }, { kind: 'export', scrypt: FAST });
    const tampered = bytes.slice();
    tampered[tampered.length - 20]! ^= 1;
    await expect(unpackContainer(tampered, { password: 'пароль-команди' })).rejects.toBeInstanceOf(GenFileError);
  });

  it('ключ пристрою для автобекапів', async () => {
    const key = new Uint8Array(32).fill(7);
    const bytes = await packContainer(payload, { deviceKey: key, keyId: 'k1' }, { kind: 'auto-backup' });
    const { header } = await unpackContainer(bytes, { deviceKey: key, keyId: 'k1' });
    expect(header.kind).toBe('auto-backup');
    await expect(unpackContainer(bytes, { deviceKey: key, keyId: 'k2' })).rejects.toMatchObject({ code: 'bad_password' });
    await expect(unpackContainer(bytes, { password: 'пароль-команди' })).rejects.toMatchObject({ code: 'need_password' });
  });

  it('короткий пароль заборонено, чужий файл розпізнається', async () => {
    await expect(packContainer(payload, { password: '123' }, { kind: 'export' })).rejects.toThrow();
    expect(() => readContainerHeader(new TextEncoder().encode('{"hello":1}'))).toThrow(GenFileError);
  });

  it('новіша схема відхиляється, некоректні дані — теж', () => {
    expect(parseExportPayload({ ...payload, schemaVersion: SCHEMA_VERSION + 1 })).toMatchObject({ ok: false, reason: 'newer_schema' });
    const bad = { ...payload, tables: { ...payload.tables, generators: [{ ...g, tankMl: -1 }] } };
    expect(parseExportPayload(bad)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
