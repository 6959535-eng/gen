import {
  SYNC_API_VERSION,
  zPairRequest,
  zPushRequest,
  type PairResponse,
  type PullResponse,
  type PushResponse,
  type User,
} from '@gen/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  checkSetupCode,
  consumePairingCode,
  createPairingCode,
  deviceByToken,
  deviceCount,
  FailureLimiter,
  listDevices,
  registerDevice,
  revokeDevice,
  serverId,
  touchDevice,
} from './auth';
import { setMeta, type Sqlite } from './db';
import { RecordStore } from './store';
import { processPush } from './sync';

export interface AppOptions {
  db: Sqlite;
  now?: () => number;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    device?: { id: string; name: string };
  }
}

const PULL_MAX = 1000;

export function buildApp(opts: AppOptions): FastifyInstance {
  const { db } = opts;
  const now = opts.now ?? Date.now;
  const store = new RecordStore(db);
  const limiter = new FailureLimiter();
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 20 * 1024 * 1024, trustProxy: true });

  const bad = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ error: message });

  /** Автентифікація пристрою: Authorization: Bearer <deviceToken> */
  const requireDevice = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const d = token ? deviceByToken(db, token) : null;
    if (!d) return bad(reply, 401, 'Пристрій не підключено до сервера');
    if (d.revoked_at !== null) return bad(reply, 403, 'Доступ цього пристрою відкликано адміністратором');
    req.device = { id: d.id, name: d.name };
    touchDevice(db, d.id, now());
  };

  const activeAdmin = (actorId: string): boolean => {
    const u = store.get('users', actorId) as unknown as User | null;
    return !!u && u.role === 'admin' && u.isActive && u.deletedAt === null;
  };

  app.get('/api/v1/health', async () => ({ ok: true, api: SYNC_API_VERSION, serverId: serverId(db), time: now() }));

  /** Підключення пристрою: код першого налаштування (сервер порожній) або одноразовий код від адміна. */
  app.post('/api/v1/pair', async (req, reply) => {
    const t = now();
    if (limiter.blocked(req.ip, t)) return bad(reply, 429, 'Забагато невдалих спроб. Зачекайте 15 хвилин');
    const p = zPairRequest.safeParse(req.body);
    if (!p.success) return bad(reply, 400, 'Некоректний запит');
    const { code, deviceId, deviceName } = p.data;

    if (deviceCount(db) === 0) {
      if (!checkSetupCode(db, code)) {
        limiter.fail(req.ip, t);
        return bad(reply, 403, 'Невірний код налаштування');
      }
      const token = registerDevice(db, deviceId, deviceName, p.data.actorId ?? null, t);
      setMeta(db, 'setup_code_hash', '');
      req.log.info({ deviceId, deviceName }, 'перший пристрій підключено');
      return { deviceToken: token, serverId: serverId(db), kind: 'setup' } satisfies PairResponse;
    }
    const by = consumePairingCode(db, code, deviceId, t);
    if (!by) {
      limiter.fail(req.ip, t);
      return bad(reply, 403, 'Код недійсний або прострочений — попросіть адміна створити новий');
    }
    const token = registerDevice(db, deviceId, deviceName, by, t);
    req.log.info({ deviceId, deviceName }, 'пристрій підключено');
    return { deviceToken: token, serverId: serverId(db), kind: 'pair' } satisfies PairResponse;
  });

  app.register(async (auth) => {
    auth.addHook('preHandler', requireDevice);

    auth.post('/api/v1/sync/push', async (req, reply) => {
      const p = zPushRequest.safeParse(req.body);
      if (!p.success) return bad(reply, 400, `Некоректний запит: ${p.error.issues[0]?.message ?? ''}`);
      const results = processPush({ db, store, deviceId: req.device!.id, now: now() }, p.data);
      return { results, cursor: store.cursor() } satisfies PushResponse;
    });

    auth.get('/api/v1/sync/pull', async (req) => {
      const q = req.query as { cursor?: string; limit?: string };
      const cursor = Math.max(0, Number(q.cursor ?? 0) || 0);
      const limit = Math.min(PULL_MAX, Math.max(1, Number(q.limit ?? PULL_MAX) || PULL_MAX));
      const changes = store.pull(cursor, limit + 1);
      const page = changes.slice(0, limit);
      return {
        changes: page,
        nextCursor: page.length ? page[page.length - 1]!.seq : cursor,
        hasMore: changes.length > limit,
      } satisfies PullResponse;
    });

    /** Адмін створює одноразовий код для підключення ще одного телефона (дійсний 15 хв). */
    auth.post('/api/v1/pairing-codes', async (req, reply) => {
      const actorId = (req.body as { actorId?: string } | undefined)?.actorId ?? '';
      if (!activeAdmin(actorId)) return bad(reply, 403, 'Створювати коди може лише адмін');
      return createPairingCode(db, actorId, now());
    });

    auth.post('/api/v1/devices/list', async (req, reply) => {
      const actorId = (req.body as { actorId?: string } | undefined)?.actorId ?? '';
      if (!activeAdmin(actorId)) return bad(reply, 403, 'Лише для адміна');
      return { devices: listDevices(db), currentDeviceId: req.device!.id };
    });

    auth.post('/api/v1/devices/revoke', async (req, reply) => {
      const b = (req.body ?? {}) as { actorId?: string; deviceId?: string };
      if (!activeAdmin(b.actorId ?? '')) return bad(reply, 403, 'Лише для адміна');
      if (b.deviceId === req.device!.id) return bad(reply, 400, 'Не можна відкликати власний пристрій');
      return { revoked: revokeDevice(db, b.deviceId ?? '', now()) };
    });
  });

  return app;
}
