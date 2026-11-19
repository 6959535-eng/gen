import { Redirect } from 'expo-router';
import { useCurrentUser, useData } from '../state/AppProvider';
import { usePendingFile } from '../state/pendingFile';

/** Маршрутизація при старті: перший запуск → вибір профілю → головна. */
export default function Index() {
  const hasUsers = useData((r) => r.users.hasAny());
  const user = useCurrentUser();
  const pending = usePendingFile((s) => s.uri);
  if (!hasUsers && pending) return <Redirect href={{ pathname: '/import-first', params: { uri: pending } }} />;
  if (!hasUsers) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/login" />;
  if (pending && user.role === 'admin') return <Redirect href={{ pathname: '/import', params: { uri: pending } }} />;
  return <Redirect href="/home" />;
}
