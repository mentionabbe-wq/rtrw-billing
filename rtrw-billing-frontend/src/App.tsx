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
import VoucherStore from '@/pages/VoucherStore';
import Finance from '@/pages/Finance';

function RequireCap({ cap, children }: { cap: Capability; children: ReactNode }) {
  const allowed = useCan(cap);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/voucher" element={<VoucherStore />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        {/* Langganan digabung ke /customers — redirect utk link lama */}
        <Route path="/subscriptions" element={<Navigate to="/customers" replace />} />
        <Route path="/pppoe" element={<PppoeActive />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/finance" element={<RequireCap cap="billing.write"><Finance /></RequireCap>} />
        <Route path="/monitoring" element={<Monitoring />} />
        {/* /genieacs digabung ke /monitoring — redirect utk link lama */}
        <Route path="/genieacs" element={<Navigate to="/monitoring" replace />} />
        <Route path="/settings" element={<RequireCap cap="settings.manage"><Settings /></RequireCap>} />
        <Route path="/audit" element={<RequireCap cap="audit.view"><Audit /></RequireCap>} />
        <Route path="/users" element={<RequireCap cap="users.manage"><Users /></RequireCap>} />
        <Route path="/security" element={<Security />} />
        <Route path="/hotspot" element={<Hotspot />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
