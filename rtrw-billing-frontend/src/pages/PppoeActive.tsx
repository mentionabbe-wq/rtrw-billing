import { useQuery } from '@tanstack/react-query';
import { Wifi, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface ActivePppoe {
  pppoeUser: string;
  address: string;
  uptime: string;
  callerId: string;
  router: string;
  customerName: string | null;
  packageName: string | null;
  dueDate: string | null;
  remainingDays: number | null;
  status: string | null;
}

function remainTone(d: number | null) {
  if (d == null) return 'bg-slate-100 text-slate-500';
  if (d < 0) return 'bg-rose-50 text-rose-700';
  if (d <= 3) return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}
function remainText(d: number | null) {
  if (d == null) return '—';
  if (d < 0) return `Lewat ${Math.abs(d)} hr`;
  if (d === 0) return 'Hari ini';
  return `${d} hari`;
}

export default function PppoeActive() {
  const { data, isLoading, isFetching, refetch } = useQuery<ActivePppoe[]>({
    queryKey: ['pppoe-active'],
    queryFn: async () => (await api.get('/subscriptions/pppoe-active')).data,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">PPPoE Aktif</h1>
        <button className="btn-ghost" disabled={isFetching} onClick={() => refetch()} title="Muat ulang">
          {isFetching ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Refresh
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Sesi PPPoE yang sedang online — dibaca live dari Mikrotik (router berstatus online),
        digabung data langganan untuk menampilkan <strong>sisa masa aktif</strong>. Auto-refresh 30 detik.
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User PPPoE</th>
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Uptime</th>
                <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium">Sisa Masa Aktif</th>
                <th className="px-4 py-3 font-medium">Router</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((s, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{s.pppoeUser}</td>
                  <td className="px-4 py-3 font-medium">{s.customerName ?? <span className="text-slate-400">tak terdaftar</span>}</td>
                  <td className="px-4 py-3">{s.packageName ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.address ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.uptime ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.dueDate ? new Date(s.dueDate).toLocaleDateString('id-ID') : '—'}</td>
                  <td className="px-4 py-3"><span className={`badge ${remainTone(s.remainingDays)}`}>{remainText(s.remainingDays)}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.router}</td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  <Wifi size={20} className="mx-auto mb-2 opacity-50" />
                  Tidak ada sesi PPPoE aktif. Pastikan router berstatus <strong>online</strong>
                  (klik Test di Pengaturan) dan ada pelanggan yang terkoneksi.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
