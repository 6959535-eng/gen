import {
  buildJournal,
  checkPermission,
  DAY,
  formatDate,
  formatDateTime,
  JOURNAL_KIND_LABELS,
  JOURNAL_KINDS,
  startOfKyivDay,
  type EntityName,
  type JournalItem,
  type JournalKind,
} from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCurrentUser, useData, useMinuteTick, useRepos } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { confirmAsync, showError } from '../../ui/errors';
import { Button, Card, Chip, Empty, T } from '../../ui/kit';
import { colors, size } from '../../ui/theme';

type Period = 'today' | 'week' | 'month' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: '7 днів' },
  { value: 'month', label: '30 днів' },
  { value: 'all', label: 'Усе' },
];

const KIND_ENTITY: Record<JournalKind, EntityName> = {
  session: 'workSessions',
  refuel: 'refuels',
  maintenance: 'maintenance',
  receipt: 'fuelReceipts',
};
const KIND_COLOR: Record<JournalKind, string> = {
  session: colors.ok,
  refuel: colors.accent,
  maintenance: colors.info,
  receipt: colors.muted,
};

export default function Journal() {
  const params = useLocalSearchParams<{ generatorId?: string }>();
  const repos = useRepos();
  const user = useCurrentUser()!;
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

  const getRecord = (it: JournalItem) => {
    switch (it.kind) {
      case 'session': return repos.sessions.get(it.id);
      case 'refuel': return repos.refuels.get(it.id);
      case 'maintenance': return repos.maintenance.get(it.id);
      case 'receipt': return repos.fuel.receipts.get(it.id);
    }
  };

  const onItem = (it: JournalItem) => {
    const entity = KIND_ENTITY[it.kind];
    const rec = { authorId: it.authorId, createdAt: it.createdAt };
    const now = Date.now();
    const canEdit = checkPermission(user, 'update', entity, rec, now, base.settings.operatorEditHours);
    const canDelete = checkPermission(user, 'delete', entity, rec, now, base.settings.operatorEditHours);
    const editable = it.kind === 'session' || it.kind === 'refuel';
    const buttons: Parameters<typeof Alert.alert>[2] = [];
    if (it.kind === 'session' && it.running) {
      buttons.push({ text: 'Зупинити', onPress: () => router.push({ pathname: '/stop', params: { sessionId: it.id } }) });
    }
    if (canEdit.ok && editable) {
      buttons.push({
        text: 'Редагувати',
        onPress: () =>
          router.push(
            it.kind === 'session'
              ? { pathname: '/session-edit', params: { id: it.id } }
              : { pathname: '/refuel', params: { id: it.id } },
          ),
      });
    }
    if (canDelete.ok) {
      buttons.push({
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          if (!(await confirmAsync('Видалити запис?', `${it.title}\n${formatDateTime(it.at)}`, 'Видалити', true))) return;
          try {
            if (it.kind === 'session') repos.sessions.remove(it.id);
            else if (it.kind === 'refuel') repos.refuels.remove(it.id);
            else if (it.kind === 'maintenance') repos.maintenance.remove(it.id);
            else repos.fuel.receipts.remove(it.id);
          } catch (e) {
            showError(e, 'Не вдалося видалити');
          }
        },
      });
    }
    buttons.push({ text: 'Закрити', style: 'cancel' });
    const author = userName.get(getRecord(it)?.authorId ?? '') ?? '—';
    const why = !canEdit.ok ? `\n\n${canEdit.reason}` : '';
    Alert.alert(it.title, `${formatDateTime(it.at)}\n${it.details}\nВніс: ${author}${why}`, buttons);
  };

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
              <Card
                onPress={() => onItem(item)}
                accent={item.flagged ? colors.warn : KIND_COLOR[item.kind]}
                style={item.flagged ? { backgroundColor: colors.warnDark } : undefined}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T style={{ fontWeight: '700', flex: 1 }}>{item.title}</T>
                  <T v="muted">{formatDateTime(item.at).slice(11)}</T>
                </View>
                <T v="muted">{item.details}</T>
                <T v="small">
                  {JOURNAL_KIND_LABELS[item.kind]} · {userName.get(item.authorId) ?? '—'}
                  {item.flagged ? ' · ⚠ відхилення витрати' : ''}
                  {item.running ? ' · ▶ працює' : ''}
                </T>
              </Card>
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
