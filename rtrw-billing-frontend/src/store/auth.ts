import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'finance';
  totpEnabled?: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (p: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      setUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'rtrw-auth' },
  ),
);
