import {
  formatDate,
  formatDateTime,
  formatLiters,
  formatNumber,
  stockMovements,
  type JournalItem,
  type StockMovement,
} from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useData, useMinuteTick } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { useRecordActions } from '../../state/recordActions';
import { Banner, Button, Card, Chip, Empty, KV, Row, Screen, T } from '../../ui/kit';
import { colors } from '../../ui/theme';

const KIND_TEXT: Record<StockMovement['kind'], string> = { receipt: 'Надходження', issue: 'Видача', inventory: 'Інвентаризація' };
const KIND_COLOR: Record<StockMovement['kind'], string> = { receipt: colors.ok, issue: colors.danger, inventory: colors.info };

/** Склад пального: окремо від генераторів — надходження, видача, інвентаризація. */
export default function Fuel() {
  const minute = useMinuteTick();
  const [typeId, setTypeId] = useState<string | undefined>();
  const [limit, setLimit] = useState(30);
  const d = useData((r) => {
    const receipts = r.fuel.receipts.list();
    const issues = r.fuel.issues.list();
    const inventories = r.fuel.inventories.list();
    const records = new Map<string, { authorId: string; createdAt: number; note: string }>();
    for (const x of [...receipts, ...issues, ...inventories]) records.set(x.id, x);
    return {
      stock: loadDashboard(r).stock,
      movements: stockMovements(receipts, issues, inventories),
      records,
      types: new Map(r.fuel.types.list({ includeInactive: true }).map((t) => [t.id, t.name])),
      users: new Map(r.users.list({ includeInactive: true }).map((u) => [u.id, u.name])),
    };
  }, [minute]);
  const onItem = useRecordActions((id) => d.users.get(id) ?? '—');
  const list = useMemo(() => d.movements.filter((m) => !typeId || m.fuelTypeId === typeId), [d, typeId]);

  const open = (m: StockMovement) => {
    const rec = d.records.get(m.id);
    if (!rec) return;
    const kind = m.kind === 'receipt' ? 'receipt' : m.kind === 'issue' ? 'issue' : 'inventory';
    onItem({
      kind,
      id: m.id,
      at: m.at,
      generatorId: null,
      authorId: rec.authorId,
      createdAt: rec.createdAt,
      title: `${KIND_TEXT[m.kind]} · ${d.types.get(m.fuelTypeId) ?? ''}`,
      details: [m.party, rec.note].filter(Boolean).join(' · '),
    } satisfies JournalItem);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Склад пального' }} />
      <T v="small">Склад ведеться окремо від генераторів: заправки генераторів зі складу не списуються.</T>
      {d.stock.map((s) => (
        <Card key={s.fuelType.id} accent={s.balanceMl <= 0 ? colors.danger : colors.accent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="h2">{s.fuelType.name}</T>
            <T v="h2" style={{ color: s.balanceMl < 0 ? colors.danger : colors.text }}>{formatLiters(s.balanceMl)}</T>
          </View>
          <KV k="Остання інвентаризація" v={s.lastInventoryAt ? formatDate(s.lastInventoryAt) : 'не було'} />
          {s.hoursLeft !== null ? (
            <KV k="Вистачить на" v={`≈ ${formatNumber(s.hoursLeft, 0)} мотогодин`} />
          ) : null}
          {!s.lastInventoryAt ? (
            <Banner level="info" text="Внесіть інвентаризацію — фактичний залишок, від якого рахуватиметься склад." />
          ) : null}
          <Row>
            <Button kind="ok" title="+ Прихід" onPress={() => router.push({ pathname: '/receipt', params: { fuelTypeId: s.fuelType.id } })} />
            <Button kind="danger" title="− Видача" onPress={() => router.push({ pathname: '/issue', params: { fuelTypeId: s.fuelType.id } })} />
          </Row>
          <Button
            kind="secondary"
            title="Інвентаризація"
            onPress={() => router.push({ pathname: '/inventory', params: { fuelTypeId: s.fuelType.id } })}
          />
        </Card>
      ))}
      {d.stock.length === 0 ? (
        <Row>
          <Button kind="ok" title="+ Прихід" onPress={() => router.push('/receipt')} />
          <Button kind="secondary" title="Інвентаризація" onPress={() => router.push('/inventory')} />
        </Row>
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
        const sign = m.deltaMl > 0 ? '+' : m.deltaMl < 0 ? '−' : '±';
        return (
          <View key={`${m.kind}:${m.id}`} style={{ gap: 6 }}>
            {newDay ? <T v="muted" style={{ fontWeight: '700' }}>{formatDate(m.at)}</T> : null}
            <Card accent={KIND_COLOR[m.kind]} onPress={() => open(m)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700', color: m.deltaMl < 0 ? colors.danger : m.deltaMl > 0 ? colors.ok : colors.text }}>
                  {m.kind === 'inventory' ? 'Факт' : `${sign}${formatLiters(Math.abs(m.deltaMl))}`} · {d.types.get(m.fuelTypeId) ?? ''}
                </T>
                <T v="muted">{formatDateTime(m.at).slice(11)}</T>
              </View>
              <T v="muted">
                {KIND_TEXT[m.kind]}
                {m.party ? ` · ${m.kind === 'issue' ? 'кому' : 'від'}: ${m.party}` : ''}
                {m.kind === 'inventory' && m.deltaMl !== 0
                  ? ` · ${m.deltaMl < 0 ? 'нестача' : 'надлишок'} ${formatLiters(Math.abs(m.deltaMl))}`
                  : ''}
              </T>
              <T v="small">Залишок після: {formatLiters(m.balanceMl)}</T>
            </Card>
          </View>
        );
      })}
      {list.length > limit ? <Button kind="ghost" title="Показати ще" onPress={() => setLimit((l) => l + 50)} /> : null}
    </Screen>
  );
}
