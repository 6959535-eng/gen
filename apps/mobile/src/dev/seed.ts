/**
 * Демо-дані: 3 генератори, 2 профілі, 2 тижні записів.
 * Викликається лише в dev-збірці (кнопка в адмінці показується тільки при __DEV__).
 */
import {
  buildTimeline,
  DAY,
  DEFAULT_FUEL_TYPES,
  HOUR,
  MINUTE,
  startOfKyivDay,
  type User,
} from '@gen/shared';
import type { CurrentActor, Repositories } from '../repositories';

export const DEMO_ADMIN = { name: 'Адмін', pin: '1111' };
export const DEMO_OPERATOR = { name: 'Оператор Петро', pin: '2222' };

const [A92, A95, DT] = DEFAULT_FUEL_TYPES.map((f) => f.id) as [string, string, string];

/** Детермінований генератор випадкових чисел, щоб демо-дані були однакові щоразу. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export async function seedDemo(repos: Repositories, setActor: (a: CurrentActor | null) => void, now: number) {
  const asUser = (u: User) => setActor({ id: u.id, role: u.role, name: u.name });

  let admin: User;
  if (!repos.users.hasAny()) {
    admin = await repos.users.createFirstAdmin(DEMO_ADMIN.name, DEMO_ADMIN.pin);
  } else {
    admin = repos.users.list().find((u) => u.role === 'admin')!;
  }
  asUser(admin);
  const operator =
    repos.users.list().find((u) => u.name === DEMO_OPERATOR.name) ??
    (await repos.users.create({ ...DEMO_OPERATOR, role: 'operator' }));

  const base = { inventoryNo: '', model: '', responsible: '', note: '', powerW: null as number | null };
  const g1 = repos.generators.create({
    ...base,
    name: 'Г-1 «Альфа»',
    inventoryNo: 'ІН-0001',
    model: 'Dalgakiran DJ 33',
    powerW: 30_000,
    fuelTypeId: DT,
    tankMl: 60_000,
    normMlPerH: 6_500,
    initialHoursMin: 1_150 * 60,
    serviceIntervalMin: 250 * 60,
    status: 'active',
    responsible: DEMO_OPERATOR.name,
  });
  const g2 = repos.generators.create({
    ...base,
    name: 'Г-2 «Бета»',
    inventoryNo: 'ІН-0002',
    model: 'Honda EU70is',
    powerW: 5_500,
    fuelTypeId: A95,
    tankMl: 25_000,
    normMlPerH: 2_000,
    initialHoursMin: 310 * 60,
    serviceIntervalMin: 100 * 60,
    status: 'active',
  });
  const g3 = repos.generators.create({
    ...base,
    name: 'Г-3 «Гамма»',
    inventoryNo: 'ІН-0003',
    model: 'Könner & Söhnen KS 3000',
    powerW: 3_000,
    fuelTypeId: A92,
    tankMl: 15_000,
    normMlPerH: 1_200,
    initialHoursMin: 85 * 60,
    serviceIntervalMin: 100 * 60,
    status: 'reserve',
  });

  const rand = rng(42);
  const today = startOfKyivDay(now);
  const start = today - 14 * DAY;
  const L = (l: number) => Math.round(l * 10) * 100; // до 0,1 л

  // Надходження на склад
  repos.fuel.receipts.create({ at: start + 7 * HOUR, fuelTypeId: DT, volumeMl: L(400), supplier: 'Склад бригади', note: '' });
  repos.fuel.receipts.create({ at: start + 7 * HOUR, fuelTypeId: A95, volumeMl: L(150), supplier: 'АЗС', note: '' });
  repos.fuel.receipts.create({ at: start + 7 * HOUR, fuelTypeId: A92, volumeMl: L(40), supplier: 'АЗС', note: '' });
  repos.fuel.receipts.create({ at: start + 8 * DAY + 9 * HOUR, fuelTypeId: DT, volumeMl: L(500), supplier: 'Склад бригади', note: '' });

  // Перша заправка «до повного» — точка відліку для розрахунку витрати
  for (const g of [g1, g2]) {
    repos.refuels.create({
      generatorId: g.id, fuelTypeId: g.fuelTypeId, at: start + 7 * HOUR + 30 * MINUTE,
      volumeMl: L(g.tankMl / 1000 / 2), isFull: true, source: 'warehouse', meterMin: g.initialHoursMin, note: 'Початкова',
    });
  }

  for (let d = 0; d < 14; d++) {
    const day = start + d * DAY;
    const who = d % 3 === 0 ? admin : operator;
    asUser(who);

    // Г-1: денна зміна 5–8 год, витрата близька до норми
    const h1 = 5 + Math.round(rand() * 6) / 2;
    const s1 = day + 8 * HOUR;
    repos.sessions.create({ generatorId: g1.id, startedAt: s1, endedAt: s1 + h1 * HOUR, startMeterMin: null, endMeterMin: null, note: '' });
    repos.refuels.create({
      generatorId: g1.id, fuelTypeId: DT, at: s1 + h1 * HOUR + 10 * MINUTE,
      volumeMl: L(h1 * 6.5 * (0.93 + rand() * 0.14)), isFull: true, source: 'warehouse', meterMin: null, note: '',
    }, { confirm: true });

    // Г-2: вечір 3–5 год, витрата помітно вища за норму (для демонстрації підсвічування)
    const h2 = 3 + Math.round(rand() * 4) / 2;
    const s2 = day + 18 * HOUR;
    repos.sessions.create({ generatorId: g2.id, startedAt: s2, endedAt: s2 + h2 * HOUR, startMeterMin: null, endMeterMin: null, note: '' });
    if (d % 2 === 1) {
      repos.refuels.create({
        generatorId: g2.id, fuelTypeId: A95, at: s2 + h2 * HOUR + 5 * MINUTE,
        volumeMl: L(2 * h2 * 2.0 * (1.2 + rand() * 0.1)), isFull: true, source: d % 4 === 1 ? 'canister' : 'warehouse', meterMin: null, note: '',
      }, { confirm: true });
    }

    // Г-3: резервний, інколи на 1–2 год
    if (d % 5 === 2) {
      const s3 = day + 13 * HOUR;
      repos.sessions.create({ generatorId: g3.id, startedAt: s3, endedAt: s3 + 1.5 * HOUR, startMeterMin: null, endMeterMin: null, note: 'Перевірка резерву' });
      repos.refuels.create({
        generatorId: g3.id, fuelTypeId: A92, at: s3 + 2 * HOUR, volumeMl: L(1.9), isFull: false, source: 'canister', meterMin: null, note: '',
      });
    }

    // ТО: Г-2 на 6-й день
    if (d === 6) {
      const at = day + 12 * HOUR;
      const h = loadMeter(repos, g2.id, at, now);
      repos.maintenance.create({
        generatorId: g2.id, at, meterMin: h, kind: 'oil', resetsInterval: true,
        description: 'Заміна масла 10W-30, 1,1 л', performedBy: who.name,
      });
    }
  }

  // Г-1 працює зараз (для живого таймера), запущено 2 год 15 хв тому
  asUser(operator);
  repos.sessions.start(g1.id, { startedAt: now - 2 * HOUR - 15 * MINUTE });

  asUser(admin);
  return { admin, operator, generators: [g1, g2, g3] };
}

function loadMeter(repos: Repositories, generatorId: string, at: number, now: number): number {
  const g = repos.generators.get(generatorId)!;
  const tl = buildTimeline(
    g,
    repos.sessions.listByGenerator(generatorId),
    repos.refuels.listByGenerator(generatorId),
    repos.maintenance.listByGenerator(generatorId),
    now,
  );
  return Math.round(tl.at(at));
}
