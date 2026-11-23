import {
  buildJournal,
  DAY,
  formatDate,
  JOURNAL_KIND_LABELS,
  JOURNAL_KINDS,
  startOfKyivDay,
  type JournalKind,
} from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData, useMinuteTick } from '../../state/AppProvider';
import { useRecordActions } from '../../state/recordActions';
import { JournalRow } from '../../ui/JournalRow';
import { loadDashboard } from '../../state/dashboard';
import { Button, Chip, Empty, T } from '../../ui/kit';
import { colors, size } from '../../ui/theme';

type Period = 'today' | 'week' | 'month' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: '7 днів' },
  { value: 'month', label: '30 днів' },
  { value: 'all', label: 'Усе' },
];

export default function Journal() {
  const params = useLocalSearchParams<{ generatorId?: string }>();
  const minute = useMinuteTick();
  const [generatorId, setGeneratorId] = useState<string | undefined>(params.generatorId);
  const [kinds, setKinds] = useState<JournalKind[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [authorId, setAuthorId] = useState<string | undefined>();

  const base = useData((r) => {
    const dash = loadDashboard(r);
    const flagged = new Set(dash.cards.flatMap((c) => c.intervals.filter((i) => i.flagged).map((i) => i.toRefuelId)));
    return {
      generators: r.generators.list({ includeDecommissioned: true }),
      users: r.users.list({ includeInactive: true }),
      sessions: r.sessions.listAll(),
      refuels: r.refuels.listAll(),
      maintenance: r.maintenance.listAll(),
      receipts: r.fuel.receipts.list(),
      issues: r.fuel.issues.list(),
      inventories: r.fuel.inventories.list(),
      fuelTypeNames: new Map(r.fuel.types.list({ includeInactive: true }).map((f) => [f.id, f.name])),
      flagged,
      settings: r.settings.get(),
    };
  }, [minute]);

  const items = useMemo(() => {
    const now = Date.now();
    const from =
      period === 'today' ? startOfKyivDay(now) : period === 'week' ? now - 7 * DAY : period === 'month' ? now - 30 * DAY : undefined;
    return buildJournal(
      { ...base, flaggedRefuelIds: base.flagged, now },
      { generatorId, kinds, from, authorId },
    );
  }, [base, generatorId, kinds, period, authorId]);

  const userName = useMemo(() => new Map(base.users.map((u) => [u.id, u.name])), [base.users]);

  const onItem = useRecordActions((id) => userName.get(id) ?? '—');

  const toggleKind = (k: JournalKind) =>
    setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Журнал' }} />
      <FlatList
        data={items}
        keyExtractor={(x) => `${x.kind}:${x.id}`}
        contentContainerStyle={{ padding: size.pad, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <ChipRow>
              <Chip label="Усі генератори" active={!generatorId} onPress={() => setGeneratorId(undefined)} />
              {base.generators.map((g) => (
                <Chip key={g.id} label={g.name} active={generatorId === g.id} onPress={() => setGeneratorId(g.id)} />
              ))}
            </ChipRow>
            <ChipRow>
              {JOURNAL_KINDS.map((k) => (
                <Chip key={k} label={JOURNAL_KIND_LABELS[k]} active={kinds.includes(k)} onPress={() => toggleKind(k)} />
              ))}
            </ChipRow>
            <ChipRow>
              {PERIODS.map((p) => (
                <Chip key={p.value} label={p.label} active={period === p.value} onPress={() => setPeriod(p.value)} />
              ))}
            </ChipRow>
            <ChipRow>
              <Chip label="Усі користувачі" active={!authorId} onPress={() => setAuthorId(undefined)} />
              {base.users.map((u) => (
                <Chip key={u.id} label={u.name} active={authorId === u.id} onPress={() => setAuthorId(u.id)} />
              ))}
            </ChipRow>
            {generatorId ? (
              <Button
                kind="secondary"
                title="+ Внести роботу заднім числом"
                onPress={() => router.push({ pathname: '/session-edit', params: { generatorId } })}
              />
            ) : null}
            <T v="small">Записів: {items.length}</T>
          </View>
        }
        ListEmptyComponent={<Empty text="Записів за цей період немає" />}
        renderItem={({ item, index }) => {
          const prev = items[index - 1];
          const newDay = !prev || formatDate(prev.at) !== formatDate(item.at);
          return (
            <View style={{ gap: 6 }}>
              {newDay ? <T v="muted" style={{ marginTop: 6, fontWeight: '700' }}>{formatDate(item.at)}</T> : null}
              <JournalRow item={item} author={userName.get(item.authorId) ?? '—'} onPress={() => onItem(item)} />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {children}
    </ScrollView>
  );
}
