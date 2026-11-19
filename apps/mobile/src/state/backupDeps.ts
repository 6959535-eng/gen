import { useMemo } from 'react';
import type { BackupDeps } from '../services/backupCore';
import { appVersion, files, secrets } from '../services/platform';
import { useCurrentUser, useRepos } from './AppProvider';

export function useBackupDeps(onProgress?: (p: number) => void): BackupDeps {
  const repos = useRepos();
  const user = useCurrentUser();
  return useMemo(
    () => ({ repos, files, secrets, appVersion, actorId: user?.id ?? null, onProgress }),
    [repos, user?.id, onProgress],
  );
}
