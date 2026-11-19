import { ENTITY_LABELS, ENTITY_NAMES, type MergePlan } from '@gen/shared';
import { View } from 'react-native';
import { Card, KV, T } from './kit';
import { colors } from './theme';

/** Попередній перегляд злиття: скільки нових, оновлених, конфліктів — по таблицях. */
export function PlanSummary({ plan, names }: { plan: MergePlan; names: Map<string, string> }) {
  const t = plan.totals;
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <KV k="Нових записів" v={String(t.inserts)} vColor={t.inserts ? colors.ok : undefined} />
        <KV k="Оновлених" v={String(t.updates)} vColor={t.updates ? colors.info : undefined} />
        <KV k="Конфліктів" v={String(t.conflicts)} vColor={t.conflicts ? colors.warn : undefined} />
        <KV k="Без змін" v={String(t.unchanged)} />
        {t.keptLocal ? <KV k="Новіші на цьому телефоні" v={String(t.keptLocal)} /> : null}
      </Card>
      {ENTITY_NAMES.filter((n) => plan.entities[n].inserts.length || plan.entities[n].updates.length).map((n) => (
        <KV
          key={n}
          k={ENTITY_LABELS[n]}
          v={`+${plan.entities[n].inserts.length} / ~${plan.entities[n].updates.length}`}
        />
      ))}
      {plan.conflicts.length ? (
        <Card style={{ borderColor: colors.warn }}>
          <T v="h2">Конфлікти</T>
          <T v="small">Запис змінювали на обох телефонах. Перемагає пізніша зміна; обидві версії буде записано в журнал змін.</T>
          {plan.conflicts.slice(0, 20).map((c) => {
            const row = c.incoming as Record<string, unknown>;
            const title = (row.name as string) ?? names.get(row.generatorId as string) ?? '';
            return (
              <T key={`${c.entity}:${c.id}`}>
                • {ENTITY_LABELS[c.entity]} {title} — {c.winner === 'incoming' ? 'буде взято з файла' : 'лишиться як на телефоні'}
              </T>
            );
          })}
          {plan.conflicts.length > 20 ? <T v="small">…та ще {plan.conflicts.length - 20}</T> : null}
        </Card>
      ) : null}
    </View>
  );
}
