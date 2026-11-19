import { formatDateTime, type IntegrityIssue, type MergePlan } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { applyImport, previewImport } from '../../services/backupCore';
import { useData, useRepos } from '../../state/AppProvider';
import { useBackupDeps } from '../../state/backupDeps';
import { useGenSource } from '../../state/genSource';
import { AdminOnly } from '../../ui/AdminOnly';
import { showError } from '../../ui/errors';
import { GenFileGate, type OpenedFile } from '../../ui/GenFileGate';
import { Banner, Button, Card, Empty, KV, Screen, T } from '../../ui/kit';
import { PlanSummary } from '../../ui/PlanSummary';

export default function ImportScreen() {
  const source = useGenSource();
  const repos = useRepos();
  const deps = useBackupDeps();
  const names = useData((r) => new Map(r.generators.list({ includeDecommissioned: true }).map((g) => [g.id, g.name])));
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [result, setResult] = useState<{ plan: MergePlan; integrity: IntegrityIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const onOpened = useCallback(
    (f: OpenedFile) => {
      setOpened(f);
      try {
        setPlan(previewImport(repos, f.payload));
      } catch (e) {
        showError(e, 'Не вдалося підготувати імпорт');
      }
    },
    [repos],
  );

  if (!source) return <Screen><Empty text="Файл не обрано" /></Screen>;

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Імпорт даних' }} />
        {!opened ? <GenFileGate source={source} onOpened={onOpened} /> : null}
        {opened && !result ? (
          <Card>
            <KV k="Файл створено" v={formatDateTime(opened.payload.exportedAt)} />
            <KV k="Версія додатка" v={opened.payload.appVersion} />
            {opened.payload.deviceId === repos.deviceId ? <T v="small">Файл створено на цьому ж телефоні</T> : null}
          </Card>
        ) : null}
        {plan && !result ? (
          <>
            <PlanSummary plan={plan} names={names} />
            {plan.isNoop ? (
              <Banner level="info" text="Нічого нового: усі записи з файла вже є на цьому телефоні." />
            ) : (
              <Button
                large
                title="Злити дані"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    setResult(await applyImport(deps, opened!.payload));
                  } catch (e) {
                    showError(e, 'Імпорт не вдався');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            <Button kind="ghost" title="Скасувати" onPress={() => router.back()} />
          </>
        ) : null}
        {result ? (
          <>
            <Banner
              level="info"
              text={`Готово: нових ${result.plan.totals.inserts}, оновлено ${result.plan.totals.updates}, конфліктів ${result.plan.totals.conflicts}. Перед імпортом збережено автоматичну копію.`}
            />
            {result.integrity.length ? (
              <Card>
                <T v="h2">Потрібно перевірити</T>
                {result.integrity.map((i, k) => (
                  <T key={k}>• {i.message}</T>
                ))}
                <Button kind="secondary" title="Відкрити перевірку даних" onPress={() => router.replace('/admin/integrity')} />
              </Card>
            ) : (
              <Banner level="info" text="Перевірка цілісності: проблем немає ✓" />
            )}
            <Button large title="На головну" onPress={() => router.dismissTo('/home')} />
          </>
        ) : null}
      </Screen>
    </AdminOnly>
  );
}
