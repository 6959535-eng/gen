import {
  buildJournal,
  DAY,
  formatDate,
  formatDuration,
  formatLiters,
  formatMotoHours,
  formatNumber,
  hoursForPeriod,
  LABELS,
  startOfKyivDay,
  type JournalKind,
} from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useCurrentUser, useData, useMinuteTick, useNow } from '../../../state/AppProvider';
import { loadDashboard } from '../../../state/dashboard';
import { useRecordActions } from '../../../state/recordActions';
import { JournalRow } from '../../../ui/JournalRow';
import { Button, Card, Chip, Empty, KV, Pill, Row, Screen, T } from '../../../ui/kit';
import { colors } from '../../../ui/theme';

const TABS: { value: JournalKind; label: string }[] = [
  { value: 'session', label: 'Сесії' },
  { value: 'refuel', label: 'Заправки' },
  { value: 'maintenance', label: 'ТО' },
];

export default function GeneratorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const minute = useMinuteTick();
  const now = useNow(1000);
  const [tab, setTab] = useState<JournalKind>('session');
  const [showAll, setShowAll] = useState(false);

  const data = useData((r) => {
    const card = loadDashboard(r).cards.find((c) => c.generator.id === id);
    const g = card?.generator ?? r.generators.get(id);
    const sessions = r.sessions.listByGenerator(id);
    return {
      card,
      g,
      sessions,
      refuels: r.refuels.listByGenerator(id),
      maintenance: r.maintenance.listByGenerator(id),
      users: new Map(r.users.list({ includeInactive: true }).map((u) => [u.id, u.name])),
      fuelTypeName: g ? r.fuel.types.get(g.fuelTypeId)?.name : undefined,
    };
  }, [id, minute]);

  const flagged = useMemo(
    () => new Set(data.card?.intervals.filter((i) => i.flagged).map((i) => i.toRefuelId) ?? []),
    [data.card],
  );
  const items = useMemo(
    () =>
      data.g
        ? buildJournal(
            {
              generators: [data.g],
              sessions: data.sessions,
              refuels: data.refuels,
              maintenance: data.maintenance,
              receipts: [],
              fuelTypeNames: new Map(),
              flaggedRefuelIds: flagged,
              now: Date.now(),
            },
            { kinds: [tab] },
          )
        : [],
    [data, tab, flagged],
  );
  const onItem = useRecordActions((uid) => data.users.get(uid) ?? '—');

  const g = data.g;
  if (!g || g.deletedAt !== null) return <Screen><Empty text="Генератор не знайдено" /></Screen>;
  const c = data.card;
  const today = startOfKyivDay(now);
  const h = (from: number) => formatMotoHours(hoursForPeriod(data.sessions, from, now, now));
  const visible = showAll ? items : items.slice(0, 15);

  return (
    <Screen>
      <Stack.Screen options={{ title: g.name }} />
      <Card accent={c?.running ? colors.ok : colors.border}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="h2" style={{ flex: 1 }}>{g.name}</T>
          <Pill
            text={c?.running ? 'ПРАЦЮЄ' : LABELS.generatorStatus[g.status].toUpperCase()}
            color={c?.running ? '#03170a' : colors.text}
            bg={c?.running ? colors.ok : colors.surface2}
          />
        </View>
        {c?.running ? (
          <T v="huge" style={{ color: colors.ok }}>{formatDuration(now - c.running.startedAt, true)}</T>
        ) : null}
        <T v="muted">
          {[g.model, g.inventoryNo, g.powerW ? `${formatNumber(g.powerW / 1000)} кВт` : null, data.fuelTypeName]
            .filter(Boolean)
            .join(' · ')}
        </T>
        {g.responsible ? <KV k="Відповідальний" v={g.responsible} /> : null}
        {g.note ? <T v="muted">{g.note}</T> : null}
      </Card>

      {c ? (
        <Card>
          <T v="h2">Показники</T>
          <KV k="Мотогодини" v={formatMotoHours(c.currentHoursMin)} />
          <KV k="Сьогодні" v={`${h(today)} мгод`} />
          <KV k="За 7 днів" v={`${h(now - 7 * DAY)} мгод`} />
          <KV k="За 30 днів" v={`${h(now - 30 * DAY)} мгод`} />
          <KV
            k="До ТО"
            v={c.service.overdue ? `прострочено ${formatMotoHours(-c.service.remainingMin)} мгод` : `${formatMotoHours(c.service.remainingMin)} мгод`}
            vColor={c.service.overdue ? colors.danger : c.service.warn ? colors.warn : undefined}
          />
          <KV k="Останнє ТО" v={c.service.lastServiceAt ? formatDate(c.service.lastServiceAt) : 'не було'} />
          <KV k="Норма витрати" v={`${formatNumber(g.normMlPerH / 1000, 2)} л/год`} />
          <KV
            k="Середня фактична"
            v={c.avgMlPerHour !== null ? `${formatNumber(c.avgMlPerHour / 1000, 2)} л/год` : 'ще немає даних'}
          />
          <KV k="Бак" v={formatLiters(g.tankMl)} />
        </Card>
      ) : null}

      {c && c.intervals.length ? (
        <Card>
          <T v="h2">Витрата між заправками «до повного»</T>
          {c.intervals.slice(-6).reverse().map((i) => (
            <KV
              key={i.toRefuelId}
              k={`${formatDate(i.from)} – ${formatDate(i.to)}`}
              v={
                i.mlPerHour === null
                  ? `${formatLiters(i.volumeMl)}, без роботи`
                  : `${formatNumber(i.mlPerHour / 1000, 2)} л/год (${i.deviation! > 0 ? '+' : ''}${Math.round(i.deviation! * 100)}%)`
              }
              vColor={i.flagged ? colors.warn : undefined}
            />
          ))}
        </Card>
      ) : null}

      {c && g.status !== 'decommissioned' ? (
        <Row>
          {c.running ? (
            <Button kind="danger" title="■ Зупинка" onPress={() => router.push({ pathname: '/stop', params: { sessionId: c.running!.id } })} />
          ) : (
            <Button kind="ok" title="▶ Запуск" disabled={g.status === 'repair'} onPress={() => router.push({ pathname: '/start', params: { generatorId: g.id } })} />
          )}
          <Button title="Заправка" onPress={() => router.push({ pathname: '/refuel', params: { generatorId: g.id } })} />
        </Row>
      ) : null}
      <Row>
        <Button kind="secondary" title="+ ТО" onPress={() => router.push({ pathname: '/maintenance', params: { generatorId: g.id } })} />
        <Button kind="secondary" title="+ Робота" subtitle="заднім числом" onPress={() => router.push({ pathname: '/session-edit', params: { generatorId: g.id } })} />
      </Row>
      {user?.role === 'admin' ? (
        <Button kind="ghost" title="Редагувати генератор" onPress={() => router.push({ pathname: '/admin/generator-edit', params: { id: g.id } })} />
      ) : null}

      <T v="h2" style={{ marginTop: 8 }}>Історія</T>
      <Row gap={8}>
        {TABS.map((t) => (
          <Chip key={t.value} label={t.label} active={tab === t.value} onPress={() => { setTab(t.value); setShowAll(false); }} />
        ))}
      </Row>
      {visible.length === 0 ? <Empty text="Записів немає" /> : null}
      {visible.map((it) => (
        <JournalRow key={it.id} item={it} showDate author={data.users.get(it.authorId) ?? '—'} onPress={() => onItem(it)} />
      ))}
      {!showAll && items.length > visible.length ? (
        <Button kind="ghost" title={`Показати всі (${items.length})`} onPress={() => setShowAll(true)} />
      ) : null}
    </Screen>
  );
}
