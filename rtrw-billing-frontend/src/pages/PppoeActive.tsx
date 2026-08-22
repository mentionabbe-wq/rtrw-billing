import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wifi, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
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

      <PppoeIssues />

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

interface PppoeIssue {
  subscriptionId: string;
  customerName: string | null;
  customerNo: string | null;
  pppoeUser: string | null;
  packageName: string | null;
  routerName: string | null;
  liveRouterName: string | null;
  onuStatus: string | null;
  onuSerial: string | null;
  lastOnlineAt: string | null;
  checkedAt: string | null;
  reasons: string[];
}

const waktu = (v: string | null) =>
  v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : 'belum pernah';

/**
 * Pelanggan yang ONU-nya online tapi sesi PPPoE-nya tidak ditemukan pada
 * polling terakhir — kombinasi yang paling sering jadi keluhan "internet
 * jalan tapi status di aplikasi mati", atau sebaliknya pelanggan yang
 * sebenarnya tidak memakai PPPoE.
 */
function PppoeIssues() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PppoeIssue[]>({
    queryKey: ['pppoe-issues'],
    queryFn: async () => (await api.get('/subscriptions/pppoe-issues')).data,
    refetchInterval: 60000,
  });

  const refresh = useMutation({
    mutationFn: () => api.post('/subscriptions/pppoe-refresh'),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['pppoe-issues'] });
      qc.invalidateQueries({ queryKey: ['pppoe-active'] });
      const d = res?.data ?? {};
      alert(
        [
          `Polling PPPoE selesai.`,
          `Router terjawab: ${d.routersOnline}/${d.routersTotal}`,
          `Sesi aktif: ${d.sessions}, cocok dengan langganan: ${d.matched}`,
          d.unmatched?.length
            ? `\nSesi tanpa langganan (${d.unmatched.length}): ${d.unmatched.slice(0, 10).join(', ')}`
            : '',
        ].join('\n'),
      );
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Polling gagal dijalankan.'),
  });

  if (isLoading) return null;

  return (
    <div className="card border-amber-200 bg-amber-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle size={16} /> ONU aktif tapi PPPoE tidak terhubung
          </h2>
          <p className="mt-0.5 text-xs text-amber-700">
            Diperiksa otomatis tiap 2 menit. Kosong = semua pelanggan dengan ONU menyala
            punya sesi PPPoE.
          </p>
        </div>
        <button
          className="btn-ghost text-sm text-amber-900"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          Perbarui sekarang
        </button>
      </div>

      {!data?.length ? (
        <p className="mt-3 text-sm text-emerald-700">
          Tidak ada yang perlu diperiksa saat ini.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((i) => (
            <li key={i.subscriptionId} className="rounded-xl bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.customerName ?? '(tanpa nama)'}</span>
                {i.customerNo && <span className="text-xs text-slate-400">{i.customerNo}</span>}
                {i.pppoeUser && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{i.pppoeUser}</span>
                )}
                {i.routerName && <span className="text-xs text-slate-500">router: {i.routerName}</span>}
                {i.onuSerial && <span className="text-xs text-slate-500">ONU: {i.onuSerial}</span>}
              </div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                {i.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="mt-1.5 text-xs text-slate-400">
                Terakhir online: {waktu(i.lastOnlineAt)} · diperiksa {waktu(i.checkedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
