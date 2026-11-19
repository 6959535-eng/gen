import {
  DAY,
  diffRecords,
  ENTITY_LABELS,
  formatDate,
  formatDateTime,
  formatLiters,
  LABELS,
  parseAuditJson,
  SETTING_LABELS,
  type SettingsKey,
  type AuditEntry,
  type EntityName,
} from '@gen/shared';
import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { Button, Card, Chip, Empty, T } from '../../../ui/kit';
import { colors, size } from '../../../ui/theme';

const ENTITIES: EntityName[] = ['workSessions', 'refuels', 'maintenance', 'fuelReceipts', 'generators', 'users', 'settings', 'fuelTypes'];
type Period = 1 | 7 | 30 | 0;
const ACTION_COLOR: Record<string, string> = {
  create: colors.ok,
  update: colors.info,
  delete: colors.danger,
  import_conflict: colors.warn,
  import: colors.accent,
  restore: colors.accent,
};

export default function Audit() {
  const [entity, setEntity] = useState<EntityName | undefined>();
  const [actorId, setActorId] = useState<string | undefined>();
  const [period, setPeriod] = useState<Period>(7);
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<string | null>(null);

  const d = useData(
    (r) => {
      const names = new Map<string, string>();
      for (const g of r.generators.list({ includeDecommissioned: true })) names.set(g.id, g.name);
      for (const t of r.fuel.types.list({ includeInactive: true })) names.set(t.id, t.name);
      const users = r.users.list({ includeInactive: true });
      for (const u of users) names.set(u.id, u.name);
      const entries = r.audit.list({
        entity,
        actorId,
        from: period ? Date.now() - period * DAY : undefined,
        limit: limit + 1,
      });
      return { names, users, entries };
    },
    [entity, actorId, period, limit],
  );
  const hasMore = d.entries.length > limit;
  const entries = d.entries.slice(0, limit);

  return (
    <AdminOnly>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Журнал змін' }} />
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: size.pad, gap: 10 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 6 }}>
              <Chips>
                <Chip label="Усе" active={!entity} onPress={() => setEntity(undefined)} />
                {ENTITIES.map((e) => (
                  <Chip key={e} label={ENTITY_LABELS[e]} active={entity === e} onPress={() => setEntity(e)} />
                ))}
              </Chips>
              <Chips>
                {([1, 7, 30, 0] as Period[]).map((p) => (
                  <Chip key={p} label={p === 0 ? 'Усе' : p === 1 ? 'Доба' : `${p} днів`} active={period === p} onPress={() => setPeriod(p)} />
                ))}
              </Chips>
              <Chips>
                <Chip label="Усі користувачі" active={!actorId} onPress={() => setActorId(undefined)} />
                {d.users.map((u) => (
                  <Chip key={u.id} label={u.name} active={actorId === u.id} onPress={() => setActorId(u.id)} />
                ))}
              </Chips>
            </View>
          }
          ListEmptyComponent={<Empty text="Змін за цей період немає" />}
          ListFooterComponent={hasMore ? <Button kind="ghost" title="Показати ще" onPress={() => setLimit((l) => l + 200)} /> : undefined}
          renderItem={({ item, index }) => {
            const prev = entries[index - 1];
            const newDay = !prev || formatDate(prev.at) !== formatDate(item.at);
            return (
              <View style={{ gap: 6 }}>
                {newDay ? <T v="muted" style={{ fontWeight: '700' }}>{formatDate(item.at)}</T> : null}
                <AuditRow e={item} names={d.names} expanded={open === item.id} onPress={() => setOpen(open === item.id ? null : item.id)} />
              </View>
            );
          }}
        />
      </SafeAreaView>
    </AdminOnly>
  );
}

function AuditRow({ e, names, expanded, onPress }: {
  e: AuditEntry;
  names: Map<string, string>;
  expanded: boolean;
  onPress: () => void;
}) {
  const before = parseAuditJson(e.beforeJson);
  const after = parseAuditJson(e.afterJson);
  const changes = useMemo(() => (expanded ? diffRecords(before, after, { names }) : []), [expanded, e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const subject =
    (after?.name as string | undefined) ??
    names.get((after?.generatorId as string | undefined) ?? '') ??
    (SETTING_LABELS[after?.key as SettingsKey] as string | undefined) ??
    (after?.key as string | undefined) ??
    (typeof after?.volumeMl === 'number' ? formatLiters(after.volumeMl) : '');
  const label = ENTITY_LABELS[e.entity as EntityName] ?? (e.entity === 'file' ? 'Дані' : e.entity);
  return (
    <Card onPress={onPress} accent={ACTION_COLOR[e.action]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ fontWeight: '700', flex: 1 }}>
          {LABELS.auditAction[e.action]}: {label}
          {subject ? ` · ${subject}` : ''}
        </T>
        <T v="muted">{formatDateTime(e.at).slice(11)}</T>
      </View>
      <T v="small">{names.get(e.authorId) ?? '—'}{e.note ? ` · ${e.note}` : ''}</T>
      {expanded ? (
        changes.length ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            {changes.map((c) => (
              <View key={c.field} style={{ gap: 2 }}>
                <T v="muted">{c.label}</T>
                <T>
                  {e.action === 'create' ? c.after : `${c.before}  →  ${c.after}`}
                </T>
              </View>
            ))}
          </View>
        ) : (
          <T v="small">Деталей немає</T>
        )
      ) : null}
    </Card>
  );
}

function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {children}
    </ScrollView>
  );
}
