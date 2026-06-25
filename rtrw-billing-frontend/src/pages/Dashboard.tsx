import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Users, Wifi, Radio, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { getMonitoringSocket, OnuStatusEvent } from '@/lib/socket';

interface Stats {
  totalCustomers: number;
  active: number;
  suspended: number;
  unpaidInvoices: number;
  onuActive: number;
  pppoeActive: number;
  trafficSeries: { t: string; mbps: number }[];
}

function StatCard({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => (await api.get('/dashboard/stats')).data,
  });

  const [live, setLive] = useState<Record<string, OnuStatusEvent['health']>>({});

  useEffect(() => {
    const socket = getMonitoringSocket();
    const handler = (e: OnuStatusEvent) =>
      setLive((prev) => ({ ...prev, [e.deviceId]: e.health }));
    socket.on('onu:status', handler);
    return () => {
      socket.off('onu:status', handler);
    };
  }, []);

  const liveCounts = Object.values(live).reduce(
    (acc, h) => ({ ...acc, [h]: (acc[h] || 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Pelanggan" value={data?.totalCustomers ?? '—'} tone="bg-brand-50 text-brand-600" />
        <StatCard icon={Wifi} label="PPPoE Aktif" value={data?.pppoeActive ?? '—'} tone="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Radio} label="ONU Aktif" value={data?.onuActive ?? '—'} tone="bg-sky-50 text-sky-600" />
        <StatCard icon={Receipt} label="Tagihan Belum Bayar" value={data?.unpaidInvoices ?? '—'} tone="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-medium">Trafik Agregat (Mbps)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data?.trafficSeries ?? []}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" fontSize={12} stroke="#94a3b8" />
              <YAxis fontSize={12} stroke="#94a3b8" />
              <Tooltip />
              <Area type="monotone" dataKey="mbps" stroke="#4f46e5" fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-medium">Kesehatan ONU (live)</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Normal</span>
              <span className="font-semibold">{liveCounts.ok ?? 0}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Warning</span>
              <span className="font-semibold">{liveCounts.warning ?? 0}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Critical / LOS</span>
              <span className="font-semibold">{liveCounts.critical ?? 0}</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            Diperbarui realtime via Socket.IO (event <code>onu:status</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
