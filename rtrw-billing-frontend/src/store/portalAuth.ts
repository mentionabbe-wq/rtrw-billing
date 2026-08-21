import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PortalCustomer {
  id: string;
  customerNo: string;
  fullName: string;
  email: string | null;
  phoneMasked: string;
  photoUrl: string | null;
  status: string;
  hasPassword?: boolean;
}

interface PortalAuthState {
  token: string | null;
  customer: PortalCustomer | null;
  setSession: (p: { token: string; customer: PortalCustomer }) => void;
  patchCustomer: (patch: Partial<PortalCustomer>) => void;
  clear: () => void;
}

/** Sesi portal pelanggan — terpisah total dari sesi admin (`rtrw-auth`). */
export const usePortalAuth = create<PortalAuthState>()(
  persist(
    (set) => ({
      token: null,
      customer: null,
      setSession: ({ token, customer }) => set({ token, customer }),
      patchCustomer: (patch) =>
        set((s) => ({ customer: s.customer ? { ...s.customer, ...patch } : s.customer })),
      clear: () => set({ token: null, customer: null }),
    }),
    { name: 'rtrw-portal' },
  ),
);
