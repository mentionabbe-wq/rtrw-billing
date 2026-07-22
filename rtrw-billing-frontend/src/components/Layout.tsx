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

const nav: { to: string; label: string; icon: any; end?: boolean; cap?: Capability }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Pelanggan', icon: Users },
  { to: '/pppoe', label: 'PPPoE Aktif', icon: Wifi },
  { to: '/packages', label: 'Paket', icon: Package },
  { to: '/invoices', label: 'Tagihan', icon: Receipt },
  { to: '/finance', label: 'Laporan Keuangan', icon: Wallet, cap: 'billing.write' },
  { to: '/monitoring', label: 'Monitoring ONU', icon: Activity },
  { to: '/map', label: 'Peta Jaringan', icon: MapIcon },
  { to: '/hotspot', label: 'Hotspot Voucher', icon: Ticket },
  { to: '/settings', label: 'Pengaturan', icon: SettingsIcon, cap: 'settings.manage' },
  { to: '/users', label: 'Pengguna', icon: UserCog, cap: 'users.manage' },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, cap: 'audit.view' },
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
          <span className="font-semibold tracking-wide text-white truncate">{companyName}</span>
        </div>
        <nav className="space-y-1 p-3">
          {nav.filter((n) => !n.cap || can(user?.role, n.cap)).map((n) => (
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
