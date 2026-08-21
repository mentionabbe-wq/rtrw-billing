import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Capability, useCan } from '@/lib/rbac';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Customers from '@/pages/Customers';
import PppoeActive from '@/pages/PppoeActive';
import Packages from '@/pages/Packages';
import Invoices from '@/pages/Invoices';
import Monitoring from '@/pages/Monitoring';
import Settings from '@/pages/Settings';
import Audit from '@/pages/Audit';
import Users from '@/pages/Users';
import Security from '@/pages/Security';
import Portal from '@/pages/Portal';
import Hotspot from '@/pages/Hotspot';
import NetworkMap from '@/pages/NetworkMap';
import VoucherStore from '@/pages/VoucherStore';
import CustomerPortal from '@/pages/CustomerPortal';
import Finance from '@/pages/Finance';
import Registrations from '@/pages/Registrations';
import Coverage from '@/pages/Coverage';

// Publik & portal pelanggan (Phase 1)
import Landing from '@/pages/public/Landing';
import PortalLogin from '@/pages/portal/PortalLogin';
import { ProtectedPortalRoute } from '@/components/portal/PortalLayout';
import PortalDashboard from '@/pages/portal/PortalDashboard';
import PortalInternet from '@/pages/portal/PortalInternet';
import PortalBilling from '@/pages/portal/PortalBilling';
import PortalPayments from '@/pages/portal/PortalPayments';
import PortalWifi from '@/pages/portal/PortalWifi';
import PortalDevice from '@/pages/portal/PortalDevice';
import PortalNotifications from '@/pages/portal/PortalNotifications';
import PortalProfile from '@/pages/portal/PortalProfile';
import PortalSettings from '@/pages/portal/PortalSettings';

function RequireCap({ cap, children }: { cap: Capability; children: ReactNode }) {
  const allowed = useCan(cap);
  return allowed ? <>{children}</> : <Navigate to="/admin" replace />;
}

/** Tautan lama (sebelum panel admin dipindah ke /admin) tetap bisa dibuka. */
const LEGACY_ADMIN_PATHS = [
  'customers', 'subscriptions', 'pppoe', 'packages', 'invoices', 'finance',
  'monitoring', 'map', 'genieacs', 'settings', 'audit', 'users', 'security', 'hotspot',
];

export default function App() {
  return (
    <Routes>
      {/* ── Publik ─────────────────────────────────────────────────────── */}
      <Route path="/" element={<Landing />} />
      <Route path="/voucher" element={<VoucherStore />} />
      {/* Captive portal Mikrotik (halaman lama /portal) */}
      <Route path="/captive" element={<Portal />} />
      {/* Portal pelanggan lama berbasis deteksi IP */}
      <Route path="/pelanggan" element={<CustomerPortal />} />

      {/* ── Portal pelanggan ───────────────────────────────────────────── */}
      <Route path="/portal/masuk" element={<PortalLogin />} />
      <Route path="/portal" element={<ProtectedPortalRoute />}>
        <Route index element={<PortalDashboard />} />
        <Route path="internet" element={<PortalInternet />} />
        <Route path="tagihan" element={<PortalBilling />} />
        <Route path="pembayaran" element={<PortalPayments />} />
        <Route path="wifi" element={<PortalWifi />} />
        <Route path="perangkat" element={<PortalDevice />} />
        <Route path="notifikasi" element={<PortalNotifications />} />
        <Route path="profil" element={<PortalProfile />} />
        <Route path="pengaturan" element={<PortalSettings />} />
      </Route>

      {/* ── Panel admin ────────────────────────────────────────────────── */}
      <Route path="/admin/login" element={<Login />} />
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        {/* Langganan digabung ke customers — redirect utk link lama */}
        <Route path="subscriptions" element={<Navigate to="/admin/customers" replace />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="coverage" element={<RequireCap cap="settings.manage"><Coverage /></RequireCap>} />
        <Route path="pppoe" element={<PppoeActive />} />
        <Route path="packages" element={<Packages />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="finance" element={<RequireCap cap="billing.write"><Finance /></RequireCap>} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="map" element={<NetworkMap />} />
        {/* genieacs digabung ke monitoring — redirect utk link lama */}
        <Route path="genieacs" element={<Navigate to="/admin/monitoring" replace />} />
        <Route path="settings" element={<RequireCap cap="settings.manage"><Settings /></RequireCap>} />
        <Route path="audit" element={<RequireCap cap="audit.view"><Audit /></RequireCap>} />
        <Route path="users" element={<RequireCap cap="users.manage"><Users /></RequireCap>} />
        <Route path="security" element={<Security />} />
        <Route path="hotspot" element={<Hotspot />} />
      </Route>

      {/* Tautan lama → pindah ke /admin/... */}
      {LEGACY_ADMIN_PATHS.map((p) => (
        <Route key={p} path={`/${p}`} element={<Navigate to={`/admin/${p}`} replace />} />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
