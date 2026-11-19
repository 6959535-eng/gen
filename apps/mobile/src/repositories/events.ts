import type { EntityName } from '@gen/shared';

type Listener = (entities: ReadonlySet<EntityName | 'local'>) => void;

/** Повідомлення UI про зміни даних (для інвалідації кешу запитів). */
export class ChangeBus {
  private listeners = new Set<Listener>();
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(entities: Iterable<EntityName | 'local'>) {
    const set = new Set(entities);
    if (set.size === 0) return;
    for (const l of this.listeners) l(set);
  }
}
