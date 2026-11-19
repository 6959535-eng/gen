import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { GenSource } from '../ui/GenFileGate';
import { usePendingFile } from './pendingFile';

/** Джерело файла для екранів імпорту/відновлення: ?path= (локальна копія), ?uri= або обраний файл. */
export function useGenSource(): GenSource | null {
  const { path, uri } = useLocalSearchParams<{ path?: string; uri?: string }>();
  const [src] = useState<GenSource | null>(() => {
    if (path) return { path };
    if (uri) return { uri };
    const p = usePendingFile.getState().picked;
    if (p) {
      usePendingFile.getState().setPicked(null);
      return p;
    }
    return null;
  });
  return src;
}
