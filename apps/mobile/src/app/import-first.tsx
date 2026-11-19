import { ENTITY_LABELS, formatDateTime } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { importIntoEmpty } from '../services/backupCore';
import { useRepos } from '../state/AppProvider';
import { useGenSource } from '../state/genSource';
import { usePendingFile } from '../state/pendingFile';
import { showError } from '../ui/errors';
import { GenFileGate, type OpenedFile } from '../ui/GenFileGate';
import { Banner, Button, Card, Empty, KV, Screen, T } from '../ui/kit';

const SHOWN = ['users', 'generators', 'workSessions', 'refuels', 'maintenance', 'fuelReceipts'] as const;

/** Перший запуск нового телефона: перенесення всієї бази з файла. */
export default function ImportFirst() {
  const source = useGenSource();
  const repos = useRepos();
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [busy, setBusy] = useState(false);
  if (!source) return <Screen><Empty text="Файл не обрано" /></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Імпорт бази' }} />
      {!opened ? <GenFileGate source={source} onOpened={setOpened} /> : null}
      {opened ? (
        <>
          <Card>
            <KV k="Файл створено" v={formatDateTime(opened.payload.exportedAt)} />
            {SHOWN.map((n) => (
              <KV key={n} k={ENTITY_LABELS[n]} v={String(opened.payload.tables[n].filter((x) => x.deletedAt === null).length)} />
            ))}
          </Card>
          <T v="muted">Після імпорту входьте своїм профілем і PIN — так само, як на іншому телефоні.</T>
          <Button
            large
            title="Імпортувати"
            loading={busy}
            onPress={() => {
              setBusy(true);
              try {
                importIntoEmpty(repos, opened.payload);
                usePendingFile.getState().set(null);
                router.replace('/login');
              } catch (e) {
                showError(e, 'Імпорт не вдався');
                setBusy(false);
              }
            }}
          />
          <Banner level="info" text="На цьому телефоні буде власний ідентифікатор пристрою; записи з обох телефонів можна буде зливати й далі." />
        </>
      ) : null}
    </Screen>
  );
}
