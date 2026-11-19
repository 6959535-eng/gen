import { uuidv7 } from '../id/uuidv7';
import { fromKyiv, HOUR, MINUTE } from '../format';
import { DEFAULT_FUEL_TYPES } from '../schemas/settings';
import type { Generator, Maintenance, Meta, Refuel, WorkSession, Dataset } from '../schemas/entities';
import { emptyDataset } from '../schemas/entities';

export const DEV_A = '01900000-0000-7000-8000-00000000000a';
export const DEV_B = '01900000-0000-7000-8000-00000000000b';
export const USER = '01900000-0000-7000-8000-0000000000aa';
export const T0 = fromKyiv(2026, 11, 1, 8, 0);
export const DT = DEFAULT_FUEL_TYPES[2].id;

export function meta(at = T0, device = DEV_A): Meta {
  return { id: uuidv7(at), createdAt: at, updatedAt: at, deletedAt: null, authorId: USER, deviceId: device, version: 1 };
}

export function gen(over: Partial<Generator> = {}): Generator {
  return {
    ...meta(),
    name: 'Г-1',
    inventoryNo: 'INV-1',
    model: 'Honda',
    powerW: 5000,
    fuelTypeId: DT,
    tankMl: 20_000,
    normMlPerH: 1_000,
    initialHoursMin: 100 * 60,
    serviceIntervalMin: 100 * 60,
    status: 'active',
    responsible: '',
    note: '',
    ...over,
  };
}

export function session(g: Generator, startH: number, durH: number | null, over: Partial<WorkSession> = {}): WorkSession {
  const startedAt = T0 + startH * HOUR;
  return {
    ...meta(startedAt),
    generatorId: g.id,
    startedAt,
    endedAt: durH === null ? null : startedAt + durH * HOUR,
    startMeterMin: null,
    endMeterMin: null,
    note: '',
    ...over,
  };
}

export function refuel(g: Generator, atH: number, liters: number, isFull: boolean, over: Partial<Refuel> = {}): Refuel {
  const at = T0 + atH * HOUR;
  return {
    ...meta(at),
    generatorId: g.id,
    fuelTypeId: g.fuelTypeId,
    at,
    volumeMl: liters * 1000,
    isFull,
    source: 'warehouse',
    meterMin: null,
    note: '',
    ...over,
  };
}

export function maint(g: Generator, atH: number, meterH: number, over: Partial<Maintenance> = {}): Maintenance {
  const at = T0 + atH * HOUR;
  return {
    ...meta(at),
    generatorId: g.id,
    at,
    meterMin: meterH * 60,
    kind: 'oil',
    resetsInterval: true,
    description: '',
    performedBy: '',
    ...over,
  };
}

export function ds(over: Partial<Dataset> = {}): Dataset {
  return { ...emptyDataset(), ...over };
}

export { MINUTE, HOUR };
