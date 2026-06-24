import { useAuth, AuthUser } from '@/store/auth';

export type Capability =
  | 'customers.write'
  | 'subscriptions.write'
  | 'billing.write'
  | 'monitoring.control'
  | 'settings.manage'
  | 'audit.view'
  | 'users.manage';

// Mirror of backend @Roles() guards. Keep in sync with controllers.
const MATRIX: Record<Capability, AuthUser['role'][]> = {
  'customers.write': ['admin', 'operator'],
  'subscriptions.write': ['admin', 'operator'],
  'billing.write': ['admin', 'finance'],
  'monitoring.control': ['admin', 'operator'],
  'settings.manage': ['admin'],
  'audit.view': ['admin'],
  'users.manage': ['admin'],
};

export function can(role: AuthUser['role'] | undefined, cap: Capability): boolean {
  return !!role && MATRIX[cap].includes(role);
}

/** Hook: const allowed = useCan('billing.write'). */
export function useCan(cap: Capability): boolean {
  const role = useAuth((s) => s.user?.role);
  return can(role, cap);
}
