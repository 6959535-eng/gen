import { create } from 'zustand';

interface PendingFile {
  /** Файл з «Відкрити за допомогою», поки людина ще не увійшла */
  uri: string | null;
  /** Файл, обраний у діалозі, для передачі на екран імпорту / відновлення */
  picked: { bytes: Uint8Array; name: string } | null;
  set: (u: string | null) => void;
  setPicked: (p: { bytes: Uint8Array; name: string } | null) => void;
}

export const usePendingFile = create<PendingFile>((set) => ({
  uri: null,
  picked: null,
  set: (uri) => set({ uri }),
  setPicked: (picked) => set({ picked }),
}));
