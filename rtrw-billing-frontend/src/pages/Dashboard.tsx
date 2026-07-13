import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Users, Wifi, Radio, Receipt, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';
import { getMonitoringSocket, OnuStatusEvent } from '@/lib/socket';

interface RouterLite { id: string; name: string }
interface IfaceLite { name: string; type: string; running: boolean }
interface OnuProblem {
  id: string; serialNumber: string; customerName: string | null;
  lastRxPower: string | null; lastStatus: string | null; health: 'warning' | 'critical';
}

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

  // Seed status ONU dari DB supaya widget tidak 0 sebelum event live datang.
  const { data: onuProblems } = useQuery<OnuProblem[]>({
    queryKey: ['onu-problems'],
    queryFn: async () => (await api.get('/dashboard/onu-problems')).data,
    refetchInterval: 60000,
  });
  const { data: devices } = useQuery<{ id: string; lastRxPower: string | null; lastStatus: string | null }[]>({
    queryKey: ['devices'],
    queryFn: async () => (await api.get('/monitoring/devices')).data,
    refetchInterval: 60000,
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

  // Gabung status DB (seed) dengan event live (override per device).
  const healthByDevice: Record<string, 'ok' | 'warning' | 'critical'> = {};
  for (const d of devices ?? []) {
    const dbm = d.lastRxPower != null ? Number(d.lastRxPower) : null;
    let h: 'ok' | 'warning' | 'critical' = 'ok';
    if (d.lastStatus === 'los' || d.lastStatus === 'offline') h = 'critical';
    else if (dbm != null && dbm < -27) h = 'critical';
    else if (dbm != null && dbm < -25) h = 'warning';
    healthByDevice[d.id] = h;
  }
  for (const [id, h] of Object.entries(live)) healthByDevice[id] = h as any;

  const liveCounts = Object.values(healthByDevice).reduce(
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
        <div className="lg:col-span-2">
          <MikrotikTrafficChart />
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
            Status dibaca dari database + diperbarui realtime via Socket.IO.
          </p>
        </div>
      </div>

      {/* ONU bermasalah (LOS/Warning) */}
      <div className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-medium">
          <Radio size={16} className="text-rose-500" /> ONU Bermasalah
          {onuProblems && onuProblems.length > 0 && (
            <span className="badge bg-rose-50 text-rose-700">{onuProblems.length}</span>
          )}
        </h2>
        {!onuProblems?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Semua ONU sehat — tidak ada yang LOS atau warning. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Serial ONU</th>
                  <th className="px-3 py-2 font-medium">Pelanggan</th>
                  <th className="px-3 py-2 font-medium">RX (dBm)</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {onuProblems.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono text-xs">{o.serialNumber}</td>
                    <td className="px-3 py-2">{o.customerName ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${o.health === 'critical' ? 'text-rose-600' : 'text-amber-600'}`}>
                      {o.lastRxPower != null ? Number(o.lastRxPower).toFixed(2) : 'LOS'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`badge ${o.health === 'critical' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {o.health === 'critical' ? 'Critical / LOS' : 'Warning'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Trafik live per-port Mikrotik ---------------- */
function MikrotikTrafficChart() {
  const canAdmin = useCan('settings.manage');
  const [routerId, setRouterId] = useState('');
  const [iface, setIface] = useState('');
  const [series, setSeries] = useState<{ t: string; rx: number; tx: number }[]>([]);

  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
    enabled: canAdmin,
  });
  const { data: ifaces } = useQuery<IfaceLite[]>({
    queryKey: ['mt-ifaces', routerId],
    queryFn: async () => (await api.get(`/routers/${routerId}/interfaces`)).data,
    enabled: !!routerId,
  });
  const { data: tick } = useQuery<{ rxbps: number; txbps: number }>({
    queryKey: ['mt-traffic', routerId, iface],
    queryFn: async () => (await api.get(`/routers/${routerId}/traffic?iface=${encodeURIComponent(iface)}`)).data,
    enabled: !!routerId && !!iface,
    refetchInterval: 3000,
  });

  useEffect(() => { setSeries([]); }, [routerId, iface]);
  useEffect(() => {
    if (!tick) return;
    const t = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSeries((prev) => [...prev, {
      t,
      rx: +(tick.rxbps / 1e6).toFixed(2),
      tx: +(tick.txbps / 1e6).toFixed(2),
    }].slice(-20));
  }, [tick]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium"><Activity size={16} className="text-brand-600" /> Trafik Port Mikrotik (Mbps)</h2>
        <div className="flex gap-2">
          <select className="input py-1" value={routerId} onChange={(e) => { setRouterId(e.target.value); setIface(''); }}>
            <option value="">Pilih router…</option>
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input py-1" value={iface} onChange={(e) => setIface(e.target.value)} disabled={!routerId}>
            <option value="">Pilih port…</option>
            {ifaces?.map((i) => <option key={i.name} value={i.name}>{i.name}{i.running ? '' : ' (down)'}</option>)}
          </select>
        </div>
      </div>

      {!canAdmin ? (
        <p className="py-16 text-center text-sm text-slate-400">Grafik trafik hanya untuk admin.</p>
      ) : !iface ? (
        <p className="py-16 text-center text-sm text-slate-400">Pilih router & port untuk melihat trafik live (update tiap 3 detik).</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="gRx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gTx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" fontSize={11} stroke="#94a3b8" />
            <YAxis fontSize={11} stroke="#94a3b8" unit=" Mb" />
            <Tooltip />
            <Legend />
            <Area type="monotone" name="Download (rx)" dataKey="rx" stroke="#2563eb" fill="url(#gRx)" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" name="Upload (tx)" dataKey="tx" stroke="#38bdf8" fill="url(#gTx)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
