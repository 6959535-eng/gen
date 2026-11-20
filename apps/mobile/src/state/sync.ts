import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { secrets } from '../services/platform';
import { httpTransport } from '../services/http';
import { isConnected, serverConfig, syncNow, type SyncDeps } from '../services/syncCore';
import { currentActor } from './session';
import { useData, useRepos } from './AppProvider';

export function useSyncDeps(): SyncDeps {
  const repos = useRepos();
  return useMemo(() => ({ repos, secrets, transport: httpTransport, actorId: () => currentActor()?.id ?? null }), [repos]);
}

/**
 * Фонова синхронізація, поки додаток відкритий: при відкритті й поверненні, через кілька секунд
 * після кожної зміни даних і раз на хвилину. Без підключеного сервера нічого не робить.
 */
export function useAutoSync() {
  const deps = useSyncDeps();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!isConnected(deps.repos)) return;
    syncNow(deps).catch(() => {
      /* статус і помилка зберігаються в local_meta й показуються в інтерфейсі */
    });
  }, [deps]);

  useEffect(() => {
    run();
    const interval = setInterval(run, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    const unsub = deps.repos.bus.subscribe((e) => {
      if (e.has('local') && e.size === 1) return; // службові зміни (статус синхронізації) — не тригер
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, 3_000);
    });
    return () => {
      clearInterval(interval);
      sub.remove();
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [deps, run]);
}

export function useSyncStatus() {
  return useData((r) => ({ ...serverConfig(r), pending: r.data.outbox.pendingCount() }));
}
