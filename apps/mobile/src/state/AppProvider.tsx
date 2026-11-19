import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { openAppDatabase } from '../db/client';
import { createRepositories, type Repositories } from '../repositories';
import { currentActor, useSession } from './session';

const Ctx = createContext<Repositories | null>(null);

type Status = { state: 'loading' } | { state: 'ready'; repos: Repositories } | { state: 'error'; error: Error };

/** Відкриває БД, застосовує міграції й створює репозиторії. */
export function AppProvider({ children, fallback, renderError }: {
  children: ReactNode;
  fallback: ReactNode;
  renderError: (e: Error) => ReactNode;
}) {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    openAppDatabase()
      .then((db) => alive && setStatus({ state: 'ready', repos: createRepositories(db, { actor: currentActor }) }))
      .catch((e: unknown) => alive && setStatus({ state: 'error', error: e instanceof Error ? e : new Error(String(e)) }));
    return () => {
      alive = false;
    };
  }, []);
  if (status.state === 'loading') return <>{fallback}</>;
  if (status.state === 'error') return <>{renderError(status.error)}</>;
  return <Ctx.Provider value={status.repos}>{children}</Ctx.Provider>;
}

export function useRepos(): Repositories {
  const r = useContext(Ctx);
  if (!r) throw new Error('AppProvider is missing');
  return r;
}

/**
 * Дані з репозиторіїв з автооновленням після будь-якої зміни.
 * Читання з SQLite синхронне, тож обчислюємо прямо під час рендера (з мемоізацією).
 */
export function useData<T>(fn: (r: Repositories) => T, deps: readonly unknown[] = []): T {
  const repos = useRepos();
  const [version, setVersion] = useState(0);
  useEffect(() => repos.bus.subscribe(() => setVersion((v) => v + 1)), [repos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(repos), [repos, version, ...deps]);
}

/** Поточний час, що оновлюється з заданим кроком (живі таймери). */
export function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

export function useCurrentUser() {
  return useSession((s) => s.user);
}

export function useSettings() {
  return useData((r) => r.settings.get());
}

/** Повторне обчислення раз на хвилину (наприклад, «до ТО» для працюючого генератора). */
export function useMinuteTick() {
  return useNow(60_000);
}

