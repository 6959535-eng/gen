import type { ReactNode } from 'react';
import { useCurrentUser } from '../state/AppProvider';
import { Empty, Screen } from './kit';

export function AdminOnly({ children }: { children: ReactNode }) {
  const u = useCurrentUser();
  if (u?.role !== 'admin') {
    return (
      <Screen>
        <Empty text="Цей розділ доступний лише адміністратору" />
      </Screen>
    );
  }
  return <>{children}</>;
}
