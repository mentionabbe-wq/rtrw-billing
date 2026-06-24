import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Sub {
  id: string;
  customerName: string;
  customerNo: string;
  pppoeUser: string;
  packageId: string;
  packageName: string;
  rateLimit: string;
  status: string;
  dueDate: string;
}

interface Pkg { id: string; name: string; rateLimit: string }

const tone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  isolated: 'bg-rose-50 text-rose-700',
};

export default function Subscriptions() {
  const qc = useQueryClient();
  const canWrite = useCan('subscriptions.write');

  const { data: subs, isLoading } = useQuery<Sub[]>({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.get('/subscriptions')).data,
  });
  const { data: packages } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['subscriptions'] });

  const changePkg = useMutation({
    mutationFn: ({ id, packageId }: { id: string; packageId: string }) =>
      api.patch(`/subscriptions/${id}/package`, { packageId }),
    onSuccess: invalidate,
  });
  const access = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'activate' }) =>
      api.post(`/subscriptions/${id}/${action}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Langganan</h1>
      <p className="text-sm text-slate-500">
        Ubah paket akan otomatis menyetel ulang bandwidth di Mikrotik (job <code>set_bandwidth</code>).
        Suspend/aktifkan memicu kontrol PPPoE secara remote.
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">PPPoE</th>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {subs?.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.customerName}</div>
                    <div className="font-mono text-xs text-slate-400">{s.customerNo}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.pppoeUser}</td>
                  <td className="px-4 py-3">
                    <select
                      className="input py-1"
                      defaultValue={s.packageId}
                      disabled={changePkg.isPending || !canWrite}
                      onChange={(e) => changePkg.mutate({ id: s.id, packageId: e.target.value })}
                    >
                      {packages?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${tone[s.status] ?? 'bg-slate-100'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!canWrite && <span className="text-xs text-slate-400">—</span>}
                      {canWrite && (s.status === 'active' ? (
                        <button
                          className="btn-ghost text-amber-600"
                          disabled={access.isPending}
                          onClick={() => access.mutate({ id: s.id, action: 'suspend' })}
                          title="Suspend"
                        >
                          <Pause size={16} /> Suspend
                        </button>
                      ) : (
                        <button
                          className="btn-ghost text-emerald-600"
                          disabled={access.isPending}
                          onClick={() => access.mutate({ id: s.id, action: 'activate' })}
                          title="Aktifkan"
                        >
                          <Play size={16} /> Aktifkan
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !subs?.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada langganan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(changePkg.isPending || access.isPending) && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={14} /> Mengirim perintah ke Mikrotik…
        </p>
      )}
    </div>
  );
}
