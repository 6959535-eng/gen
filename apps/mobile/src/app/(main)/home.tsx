import {
  DAY,
  formatDuration,
  formatLiters,
  formatMotoHours,
  formatNumber,
  formatTime,
  isClockSuspicious,
  LABELS,
  MINUTE,
  type GeneratorCard,
} from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { seedDemo } from '../../dev/seed';
import { useCurrentUser, useData, useMinuteTick, useNow, useRepos } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { useSession } from '../../state/session';
import { showError } from '../../ui/errors';
import { Banner, Button, Card, Empty, KV, Pill, Row, Screen, T } from '../../ui/kit';
import { colors } from '../../ui/theme';
import { UserBadge } from '../../ui/UserBadge';

export default function Home() {
  const repos = useRepos();
  const user = useCurrentUser();
  const minute = useMinuteTick();
  const dash = useData((r) => {
    const at = Date.now();
    return { ...loadDashboard(r, at), at };
  }, [minute]);
  const lastManualBackup = useData((r) => r.local.get('last_manual_backup_at'));
  const latest = useData((r) => r.data.latestRecordAt());
  const reminderDays = useData((r) => r.settings.get().backupReminderDays);
  const [seeding, setSeeding] = useState(false);

  const now = Date.now();
  const clockBad = isClockSuspicious(now, latest);
  const backupOverdue =
    dash.cards.length > 0 && (!lastManualBackup || now - Number(lastManualBackup) > reminderDays * DAY);

  const running = dash.cards.filter((c) => c.running);
  const startable = dash.cards.filter((c) => !c.running && c.generator.status !== 'repair');

  const quick = (action: 'start' | 'stop' | 'refuel') => {
    const list = action === 'start' ? startable : action === 'stop' ? running : dash.cards;
    if (list.length === 1) return go(action, list[0]!);
    router.push({ pathname: '/pick', params: { action } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <UserBadge /> }} />

      {clockBad ? (
        <Banner level="danger" text="Час телефона раніший за останній запис у базі. Перевірте дату й час у налаштуваннях телефона." />
      ) : null}
      {dash.warnings.map((w, i) => (
        <Banner key={i} level={w.level} text={w.text} />
      ))}
      {backupOverdue ? (
        <Banner
          level="info"
          text={lastManualBackup ? `Резервну копію не створювали понад ${reminderDays} днів` : 'Резервну копію ще не створювали'}
        />
      ) : null}

      {dash.cards.length > 0 ? (
        <Row>
          <Button kind="ok" large title="▶ Запуск" disabled={!startable.length} onPress={() => quick('start')} />
          <Button kind="danger" large title="■ Зупинка" disabled={!running.length} onPress={() => quick('stop')} />
        </Row>
      ) : null}
      {dash.cards.length > 0 ? <Button large title="⛽ Заправка" onPress={() => quick('refuel')} /> : null}

      {dash.cards.map((c) => (
        <GeneratorTile key={c.generator.id} c={c} at={dash.at} />
      ))}

      {dash.cards.length === 0 ? (
        <Card>
          <Empty
            text={
              user?.role === 'admin'
                ? 'Генераторів ще немає. Додайте їх в адмінці.'
                : 'Генераторів ще немає. Попросіть адміна додати їх.'
            }
          />
          {__DEV__ ? (
            <Button
              kind="secondary"
              title="Завантажити демо-дані (dev)"
              loading={seeding}
              onPress={async () => {
                setSeeding(true);
                try {
                  const res = await seedDemo(repos, (a) => useSession.setState({ user: a }), Date.now());
                  useSession.getState().signIn(res.admin);
                } catch (e) {
                  showError(e);
                } finally {
                  setSeeding(false);
                }
              }}
            />
          ) : null}
        </Card>
      ) : null}

      {dash.stock.length > 0 ? (
        <Card onPress={() => router.push('/fuel')}>
          <T v="h2">Пальне на складі ›</T>
          {dash.stock.map((s) => (
            <View key={s.fuelType.id} style={{ gap: 2 }}>
              <KV
                k={s.fuelType.name}
                v={formatLiters(s.balanceMl)}
                vColor={s.balanceMl <= 0 ? colors.danger : undefined}
              />
              {s.hoursLeft !== null ? (
                <T v="small">
                  ≈ {formatNumber(s.hoursLeft, 0)} мотогодин {s.rateIsNorm ? '(за нормою)' : '(за фактичною витратою)'}
                </T>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Row>
        <Button kind="secondary" title="Журнал" onPress={() => router.push('/journal')} />
        <Button kind="secondary" title="Склад" onPress={() => router.push('/fuel')} />
      </Row>
      {user?.role === 'admin' ? <Button kind="secondary" title="Адмінка" onPress={() => router.push('/admin')} /> : null}
    </Screen>
  );
}

function go(action: 'start' | 'stop' | 'refuel', c: GeneratorCard) {
  if (action === 'stop' && c.running) router.push({ pathname: '/stop', params: { sessionId: c.running.id } });
  else if (action === 'start') router.push({ pathname: '/start', params: { generatorId: c.generator.id } });
  else router.push({ pathname: '/refuel', params: { generatorId: c.generator.id } });
}

function GeneratorTile({ c, at }: { c: GeneratorCard; at: number }) {
  const g = c.generator;
  const svcColor = c.service.overdue ? colors.danger : c.service.warn ? colors.warn : undefined;
  const statusPill = c.running ? (
    <Pill text="ПРАЦЮЄ" color="#03170a" bg={colors.ok} />
  ) : (
    <Pill
      text={LABELS.generatorStatus[g.status].toUpperCase()}
      color={g.status === 'repair' ? '#fecaca' : colors.text}
      bg={g.status === 'repair' ? colors.dangerDark : colors.surface2}
    />
  );
  return (
    <Card
      accent={c.running ? colors.ok : g.status === 'repair' ? colors.danger : colors.border}
      onPress={() => router.push({ pathname: '/generator/[id]', params: { id: g.id } })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <T v="h2" style={{ flex: 1 }} numberOfLines={1}>
          {g.name}
        </T>
        {statusPill}
      </View>
      {c.running ? <RunningTimer since={c.running.startedAt} /> : null}
      <LiveHours c={c} at={at} />
      <KV
        k="До ТО"
        v={c.service.overdue ? `прострочено ${formatMotoHours(-c.service.remainingMin)} мгод` : `${formatMotoHours(c.service.remainingMin)} мгод`}
        vColor={svcColor}
      />
      <KV
        k={`Витрата (норма ${formatNumber(g.normMlPerH / 1000)})`}
        v={c.avgMlPerHour !== null ? `${formatNumber(c.avgMlPerHour / 1000, 2)} л/год` : 'ще немає даних'}
        vColor={c.lastInterval?.flagged ? colors.warn : undefined}
      />
      <Row>
        {c.running ? (
          <Button kind="danger" title="■ Зупинка" onPress={() => go('stop', c)} />
        ) : (
          <Button kind="ok" title="▶ Запуск" disabled={g.status === 'repair'} onPress={() => go('start', c)} />
        )}
        <Button title="Заправка" onPress={() => go("refuel", c)} />
      </Row>
    </Card>
  );
}

/** Живий таймер — окремий компонент, щоб щосекунди перемальовувався лише він. */
function RunningTimer({ since }: { since: number }) {
  const now = useNow(1000);
  return (
    <View>
      <T v="huge" style={{ color: colors.ok }}>
        {formatDuration(now - since, true)}
      </T>
      <T v="small">з {formatTime(since)}</T>
    </View>
  );
}

function LiveHours({ c, at }: { c: GeneratorCard; at: number }) {
  const now = useNow(c.running ? 6_000 : 600_000);
  // Мотогодини пораховано в момент at; для працюючого генератора додаємо час, що минув відтоді.
  const extra = c.running ? Math.max(0, (now - at) / MINUTE) : 0;
  return <KV k="Мотогодини" v={formatMotoHours(c.currentHoursMin + extra)} />;
}
