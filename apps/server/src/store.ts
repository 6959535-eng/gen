import type { EntityName, PullChange } from '@gen/shared';
import type { Sqlite } from './db';

export type Row = Record<string, unknown> & {
  id: string;
  updatedAt: number;
  deviceId: string;
  version: number;
  deletedAt: number | null;
  authorId: string;
  createdAt: number;
};

/** Доступ до записів: читання, запис з новим seq, вибірка змін після курсора. */
export class RecordStore {
  private getStmt;
  private maxSeqStmt;
  private upsertStmt;
  private pullStmt;
  private byEntityStmt;

  constructor(private db: Sqlite) {
    this.getStmt = db.prepare('SELECT row_json FROM records WHERE entity = ? AND id = ?');
    this.maxSeqStmt = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records');
    this.upsertStmt = db.prepare(`
      INSERT INTO records (entity, id, seq, updated_at, device_id, row_json, received_at)
      VALUES (@entity, @id, @seq, @updatedAt, @deviceId, @json, @now)
      ON CONFLICT(entity, id) DO UPDATE SET
        seq = excluded.seq, updated_at = excluded.updated_at, device_id = excluded.device_id,
        row_json = excluded.row_json, received_at = excluded.received_at`);
    this.pullStmt = db.prepare('SELECT entity, row_json, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?');
    this.byEntityStmt = db.prepare('SELECT row_json FROM records WHERE entity = ?');
  }

  get(entity: EntityName, id: string): Row | null {
    const r = this.getStmt.get(entity, id) as { row_json: string } | undefined;
    return r ? (JSON.parse(r.row_json) as Row) : null;
  }

  all(entity: EntityName): Row[] {
    return (this.byEntityStmt.all(entity) as { row_json: string }[]).map((r) => JSON.parse(r.row_json) as Row);
  }

  cursor(): number {
    return (this.maxSeqStmt.get() as { s: number }).s;
  }

  /** Записує версію і присвоює їй новий seq — інші пристрої отримають її при наступному pull. */
  put(entity: EntityName, row: Row, now: number): number {
    const seq = this.cursor() + 1;
    this.upsertStmt.run({
      entity,
      id: row.id,
      seq,
      updatedAt: row.updatedAt,
      deviceId: row.deviceId,
      json: JSON.stringify(row),
      now,
    });
    return seq;
  }

  pull(cursor: number, limit: number): PullChange[] {
    return (this.pullStmt.all(cursor, limit) as { entity: EntityName; row_json: string; seq: number }[]).map((r) => ({
      seq: r.seq,
      entity: r.entity,
      row: JSON.parse(r.row_json) as Record<string, unknown>,
    }));
  }

  isEmpty(): boolean {
    return this.cursor() === 0;
  }
}
