import type { User } from '@gen/shared';
import { create } from 'zustand';
import type { CurrentActor } from '../repositories';

interface SessionState {
  user: CurrentActor | null;
  lastActivityAt: number;
  signIn(u: User): void;
  signOut(): void;
  touch(): void;
}

/** Хто зараз працює з телефоном. Живе тільки в памʼяті: після перезапуску — знову PIN. */
export const useSession = create<SessionState>((set) => ({
  user: null,
  lastActivityAt: Date.now(),
  signIn: (u) => set({ user: { id: u.id, role: u.role, name: u.name }, lastActivityAt: Date.now() }),
  signOut: () => set({ user: null }),
  touch: () => set({ lastActivityAt: Date.now() }),
}));

export const currentActor = () => useSession.getState().user;
