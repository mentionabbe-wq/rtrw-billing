import { useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, CreditCard, Gauge, HardDrive, LayoutDashboard, LogOut, Menu, Moon, Receipt,
  Settings, Sun, User, Wifi, X,
} from 'lucide-react';
import clsx from 'clsx';
import { portalApi } from '@/lib/portalApi';
import { usePortalAuth } from '@/store/portalAuth';
import { useTheme } from '@/lib/theme';

const NAV = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/internet', label: 'Internet Saya', icon: Gauge },
  { to: '/portal/tagihan', label: 'Tagihan', icon: Receipt },
  { to: '/portal/pembayaran', label: 'Pembayaran', icon: CreditCard },
  { to: '/portal/wifi', label: 'WiFi Saya', icon: Wifi },
  { to: '/portal/perangkat', label: 'Perangkat', icon: HardDrive },
  { to: '/portal/notifikasi', label: 'Notifikasi', icon: Bell },
  { to: '/portal/profil', label: 'Profil', icon: User },
  { to: '/portal/pengaturan', label: 'Pengaturan', icon: Settings },
];

/** Hanya untuk pelanggan yang sudah masuk. */
export function ProtectedPortalRoute() {
  const token = usePortalAuth((s) => s.token);
  if (!token) return <Navigate to="/portal/masuk" replace />;
  return <PortalLayout />;
}

function PortalLayout() {
  const [open, setOpen] = useState(false);
  const { mode, toggle } = useTheme();
  const customer = usePortalAuth((s) => s.customer);
  const clear = usePortalAuth((s) => s.clear);
  const navigate = useNavigate();

  const { data: unread } = useQuery({
    queryKey: ['portal-unread'],
    queryFn: async () => (await portalApi.get('/me')).data?.notifications?.unread ?? 0,
    refetchInterval: 60_000,
  });

  const logout = async () => {
    try {
      await portalApi.post('/auth/logout');
    } catch {
      // Token mungkin sudah kedaluwarsa — sesi lokal tetap dibersihkan.
    }
    clear();
    navigate('/portal/masuk', { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform',
          'lg:static lg:translate-x-0 dark:border-white/10 dark:bg-slate-900',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-white/10">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-sky-400 text-white">
            <Wifi size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Portal Pelanggan</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{customer?.customerNo}</p>
          </div>
        </div>

        <nav className="space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
                )
              }
            >
              <n.icon size={18} />
              <span className="flex-1">{n.label}</span>
              {n.to === '/portal/notifikasi' && unread > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>
              )}
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            <LogOut size={18} /> Logout
          </button>
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-6 dark:border-white/10 dark:bg-slate-900/80">
          <button className="rounded-lg p-2 text-slate-600 lg:hidden dark:text-slate-300"
            onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggle} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Ubah tema">
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{customer?.fullName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{customer?.customerNo}</p>
            </div>
            {customer?.photoUrl ? (
              <img src={customer.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                {customer?.fullName?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
