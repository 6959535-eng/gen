import { z } from 'zod';
import { ENTITY_NAMES, zId, type EntityName } from './entities';

/**
 * Протокол синхронізації телефон ↔ сервер (версія 1). Спільний для обох сторін.
 * Телефон: push змін з outbox → pull змін інших пристроїв за курсором (server_seq).
 */
export const SYNC_API_VERSION = 1;

const zEntity = z.enum(ENTITY_NAMES as [EntityName, ...EntityName[]]);

/** Одна зміна з outbox (повний запис після зміни). */
export const zPushChange = z.object({
  opId: z.string().min(1).max(100),
  entity: zEntity,
  /** Хто зробив зміну (користувач, що був у профілі на телефоні) */
  actorId: zId,
  row: z.record(z.string(), z.unknown()),
});
export type PushChange = z.infer<typeof zPushChange>;

export const zPushRequest = z.object({
  /** normal — зміни з outbox; snapshot — повний знімок (підключення / після імпорту файла), лише адмін */
  mode: z.enum(['normal', 'snapshot']).default('normal'),
  actorId: zId,
  changes: z.array(zPushChange).max(2000),
});
export type PushRequest = z.infer<typeof zPushRequest>;

export type PushResultStatus = 'applied' | 'stale' | 'rejected';
export interface PushResult {
  opId: string;
  status: PushResultStatus;
  reason?: string;
  /** Для відхилених — актуальна версія запису на сервері (телефон відкочується до неї) */
  serverRow?: Record<string, unknown> | null;
}
export interface PushResponse {
  results: PushResult[];
  cursor: number;
}

export interface PullChange {
  seq: number;
  entity: EntityName;
  row: Record<string, unknown>;
}
export interface PullResponse {
  changes: PullChange[];
  nextCursor: number;
  hasMore: boolean;
}

export const zPairRequest = z.object({
  code: z.string().trim().min(4).max(40),
  deviceId: zId,
  deviceName: z.string().trim().min(1).max(60),
  /** Лише для першого підключення (setup): адмін, від імені якого буде початковий знімок */
  actorId: zId.optional(),
});
export type PairRequest = z.infer<typeof zPairRequest>;
export interface PairResponse {
  deviceToken: string;
  serverId: string;
  /** setup — перший пристрій (сервер порожній), pair — додатковий */
  kind: 'setup' | 'pair';
}

export interface DeviceInfo {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

