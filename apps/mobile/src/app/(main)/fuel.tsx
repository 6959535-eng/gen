import { formatDate, formatDateTime, formatLiters, formatNumber, stockMovements, type JournalItem } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useData, useMinuteTick } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { useRecordActions } from '../../state/recordActions';
import { Button, Card, Chip, Empty, KV, Screen, T } from '../../ui/kit';
import { colors } from '../../ui/theme';

/** Склад пального: залишки, надходження, видача (заправки зі складу). */
export default function Fuel() {
  const minute = useMinuteTick();
  const [typeId, setTypeId] = useState<string | undefined>();
  const [limit, setLimit] = useState(30);
  const d = useData((r) => {
    const dash = loadDashboard(r);
    const receipts = r.fuel.receipts.list();
    const refuels = r.refuels.listAll();
    return {
      stock: dash.stock,
      receipts: new Map(receipts.map((x) => [x.id, x])),
      movements: stockMovements(receipts, refuels),
      gens: new Map(r.generators.list({ includeDecommissioned: true }).map((g) => [g.id, g.name])),
      types: new Map(r.fuel.types.list({ includeInactive: true }).map((t) => [t.id, t.name])),
      users: new Map(r.users.list({ includeInactive: true }).map((u) => [u.id, u.name])),
    };
  }, [minute]);
  const onItem = useRecordActions((id) => d.users.get(id) ?? '—');
  const list = useMemo(() => d.movements.filter((m) => !typeId || m.fuelTypeId === typeId), [d, typeId]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Склад пального' }} />
      {d.stock.map((s) => (
        <Card key={s.fuelType.id} accent={s.balanceMl <= 0 ? colors.danger : colors.accent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="h2">{s.fuelType.name}</T>
            <T v="h2" style={{ color: s.balanceMl <= 0 ? colors.danger : colors.text }}>{formatLiters(s.balanceMl)}</T>
          </View>
          {s.rateMlPerHour ? (
            <KV
              k={s.rateIsNorm ? 'Витрата (норма)' : 'Сер. витрата за 14 днів'}
              v={`${formatNumber(s.rateMlPerHour / 1000, 2)} л/год`}
            />
          ) : null}
          {s.hoursLeft !== null ? <KV k="Вистачить на" v={`≈ ${formatNumber(s.hoursLeft, 0)} мотогодин`} /> : null}
          <Button
            kind="secondary"
            title="+ Надходження"
            onPress={() => router.push({ pathname: '/receipt', params: { fuelTypeId: s.fuelType.id } })}
          />
        </Card>
      ))}
      {d.stock.length === 0 ? (
        <Button title="+ Надходження пального" onPress={() => router.push('/receipt')} />
      ) : null}

      <T v="h2" style={{ marginTop: 8 }}>Рух пального</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Усі" active={!typeId} onPress={() => setTypeId(undefined)} />
        {[...d.types].map(([id, name]) => (
          <Chip key={id} label={name} active={typeId === id} onPress={() => setTypeId(id)} />
        ))}
      </View>
      {list.length === 0 ? <Empty text="Руху ще не було" /> : null}
      {list.slice(0, limit).map((m, i) => {
        const prev = list[i - 1];
        const newDay = !prev || formatDate(prev.at) !== formatDate(m.at);
        const isIn = m.kind === 'receipt';
        const rec = isIn ? d.receipts.get(m.id) : undefined;
        return (
          <View key={`${m.kind}:${m.id}`} style={{ gap: 6 }}>
            {newDay ? <T v="muted" style={{ fontWeight: '700' }}>{formatDate(m.at)}</T> : null}
            <Card
              accent={isIn ? colors.ok : colors.accent}
              onPress={
                rec
                  ? () =>
                      onItem({
                        kind: 'receipt',
                        id: rec.id,
                        at: rec.at,
                        generatorId: null,
                        authorId: rec.authorId,
                        createdAt: rec.createdAt,
                        title: `Надходження ${formatLiters(rec.volumeMl)}`,
                        details: rec.supplier,
                      } satisfies JournalItem)
                  : undefined
              }
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700', color: isIn ? colors.ok : colors.text }}>
                  {isIn ? '+' : '−'}
                  {formatLiters(Math.abs(m.deltaMl))} · {d.types.get(m.fuelTypeId) ?? ''}
                </T>
                <T v="muted">{formatDateTime(m.at).slice(11)}</T>
              </View>
              <T v="muted">
                {isIn ? `Надходження${rec?.supplier ? ` · ${rec.supplier}` : ''}` : `Видача: ${d.gens.get(m.generatorId ?? '') ?? '—'}`}
              </T>
            </Card>
          </View>
        );
      })}
      {list.length > limit ? <Button kind="ghost" title="Показати ще" onPress={() => setLimit((l) => l + 50)} /> : null}
    </Screen>
  );
}
