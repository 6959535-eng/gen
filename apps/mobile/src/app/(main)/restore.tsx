import { ENTITY_LABELS, formatDateTime } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { restoreFromPayload } from '../../services/backupCore';
import { useBackupDeps } from '../../state/backupDeps';
import { useGenSource } from '../../state/genSource';
import { useSession } from '../../state/session';
import { AdminOnly } from '../../ui/AdminOnly';
import { confirmAsync, showError } from '../../ui/errors';
import { GenFileGate, type OpenedFile } from '../../ui/GenFileGate';
import { Banner, Button, Card, Empty, KV, Screen } from '../../ui/kit';

const SHOWN = ['generators', 'workSessions', 'refuels', 'maintenance', 'fuelReceipts', 'users'] as const;

export default function RestoreScreen() {
  const source = useGenSource();
  const deps = useBackupDeps();
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [busy, setBusy] = useState(false);
  if (!source) return <Screen><Empty text="Файл не обрано" /></Screen>;

  const restore = async () => {
    if (!opened) return;
    const ok1 = await confirmAsync(
      'Замінити всі дані?',
      `Усі поточні записи на телефоні буде замінено даними з копії від ${formatDateTime(opened.payload.exportedAt)}.`,
      'Далі',
      true,
    );
    if (!ok1) return;
    const ok2 = await confirmAsync('Точно?', 'Поточний стан буде збережено в автоматичну копію перед заміною.', 'Відновити', true);
    if (!ok2) return;
    setBusy(true);
    try {
      await restoreFromPayload(deps, opened.payload, `Відновлено з копії від ${formatDateTime(opened.payload.exportedAt)}`);
      useSession.getState().signOut();
      router.replace('/login');
    } catch (e) {
      showError(e, 'Відновлення не вдалося');
      setBusy(false);
    }
  };

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Відновлення з копії' }} />
        {!opened ? <GenFileGate source={source} onOpened={setOpened} /> : null}
        {opened ? (
          <>
            <Card>
              <KV k="Копію створено" v={formatDateTime(opened.payload.exportedAt)} />
              {SHOWN.map((n) => (
                <KV key={n} k={ENTITY_LABELS[n]} v={String(opened.payload.tables[n].filter((x) => x.deletedAt === null).length)} />
              ))}
            </Card>
            <Banner level="danger" text="Усі поточні дані на телефоні буде замінено. Після відновлення потрібно буде увійти знову." />
            <Button kind="danger" large title="Відновити з цієї копії" loading={busy} onPress={restore} />
            <Button kind="ghost" title="Скасувати" onPress={() => router.back()} />
          </>
        ) : null}
      </Screen>
    </AdminOnly>
  );
}
