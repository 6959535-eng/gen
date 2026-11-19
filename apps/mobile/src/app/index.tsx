import { Redirect } from 'expo-router';
import { useCurrentUser, useData } from '../state/AppProvider';

/** Маршрутизація при старті: перший запуск → вибір профілю → головна. */
export default function Index() {
  const hasUsers = useData((r) => r.users.hasAny());
  const user = useCurrentUser();
  if (!hasUsers) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/home" />;
}
