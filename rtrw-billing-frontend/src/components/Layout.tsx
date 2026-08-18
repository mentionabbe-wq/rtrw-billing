import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Package, Receipt, Activity, LogOut, Menu, X, Wifi,
  Settings as SettingsIcon, ScrollText, UserCog, ShieldCheck, Ticket, Wallet, Map as MapIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/store/auth';
import { Capability, can } from '@/lib/rbac';
import { api } from '@/lib/api';

interface PortalSettings {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
}

interface NavItem { to: string; label: string; icon: any; end?: boolean; cap?: Capability }

/** Menu dikelompokkan per fungsi agar mudah dicari saat menu bertambah. */
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Dasbor',
    items: [
      { to: '/', label: 'Ringkasan', icon: LayoutDashboard, end: true },
      { to: '/finance', label: 'Laporan Keuangan', icon: Wallet, cap: 'billing.write' },
    ],
  },
  {
    title: 'Infrastruktur',
    items: [
      { to: '/map', label: 'Pemetaan & ODP', icon: MapIcon },
      { to: '/pppoe', label: 'PPPoE Aktif', icon: Wifi },
      { to: '/monitoring', label: 'OLT & ONU', icon: Activity },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { to: '/packages', label: 'Paket Internet', icon: Package },
      { to: '/invoices', label: 'Tagihan', icon: Receipt },
      { to: '/hotspot', label: 'Hotspot Voucher', icon: Ticket },
    ],
  },
  {
    title: 'Pelanggan',
    items: [
      { to: '/customers', label: 'Daftar Pelanggan', icon: Users },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      { to: '/settings', label: 'Pengaturan', icon: SettingsIcon, cap: 'settings.manage' },
      { to: '/users', label: 'Pengguna', icon: UserCog, cap: 'users.manage' },
      { to: '/security', label: 'Keamanan Akun', icon: ShieldCheck },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, cap: 'audit.view' },
    ],
  },
];

export function Layout() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const { data: branding } = useQuery<PortalSettings>({
    queryKey: ['portal-settings'],
    queryFn: async () => (await api.get('/portal/settings')).data,
    staleTime: 5 * 60 * 1000,
  });

  const companyName = branding?.companyName ?? 'RT/RW Net';
  const logoUrl = branding?.logoUrl ?? null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 transform bg-gradient-to-b from-[#012b6d] via-[#01337f] to-[#0246a8] text-blue-50 shadow-xl transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-8 w-8 rounded object-cover" />
          ) : (
            <Wifi className="text-amber-400 shrink-0" size={22} />
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-wide text-white">{companyName}</p>
            <p className="text-[11px] text-blue-200/70">Manajemen</p>
          </div>
        </div>
        <nav className="max-h-[calc(100vh-4rem)] overflow-y-auto p-3 pb-6">
          {navGroups.map((g) => {
            const items = g.items.filter((n) => !n.cap || can(user?.role, n.cap));
            if (!items.length) return null;
            return (
              <div key={g.title} className="mb-4 last:mb-0">
                <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-blue-200/70">
                  {g.title}
                </p>
                <div className="space-y-1">
                  {items.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                          isActive
                            ? 'bg-white/15 text-white shadow-sm ring-1 ring-inset ring-amber-400/40 border-l-4 border-amber-400 pl-2'
                            : 'text-blue-100 hover:bg-white/10 hover:text-white',
                        )
                      }
                    >
                      <n.icon size={18} />
                      {n.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-brand-100 bg-white/70 px-4 backdrop-blur lg:px-6">
          <button className="btn-ghost lg:hidden" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role}</p>
            </div>
            <NavLink to="/security" className="btn-ghost" title="Keamanan akun (2FA)">
              <ShieldCheck size={18} />
            </NavLink>
            <button className="btn-ghost" onClick={handleLogout} title="Keluar">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
