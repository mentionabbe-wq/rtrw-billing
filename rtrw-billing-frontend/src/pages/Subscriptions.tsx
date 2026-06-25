import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Plus, X } from 'lucide-react';
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
interface CustomerLite { id: string; customerNo: string; fullName: string }
interface RouterLite { id: string; name: string }

const tone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  isolated: 'bg-rose-50 text-rose-700',
};

export default function Subscriptions() {
  const qc = useQueryClient();
  const canWrite = useCan('subscriptions.write');
  const canAdmin = useCan('settings.manage');
  const [addOpen, setAddOpen] = useState(false);

  const { data: subs, isLoading } = useQuery<Sub[]>({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.get('/subscriptions')).data,
  });
  const { data: packages } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });
  const { data: customers } = useQuery<CustomerLite[]>({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });
  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
    enabled: canAdmin,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['subscriptions'] });

  const createSub = useMutation({
    mutationFn: (body: any) => api.post('/subscriptions', body),
    onSuccess: () => { invalidate(); setAddOpen(false); },
    onError: (e: any) => alert(`Gagal membuat langganan: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  function onAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createSub.mutate({
      customerId: fd.get('customerId'),
      pppoeUser: fd.get('pppoeUser'),
      pppoePass: fd.get('pppoePass') || undefined,
      packageId: fd.get('packageId') || undefined,
      routerId: fd.get('routerId') || undefined,
    });
  }

  // Pilihan paket & status per-baris (belum disimpan sampai tombol Save diklik).
  const [pkgSel, setPkgSel] = useState<Record<string, string>>({});
  const [statusSel, setStatusSel] = useState<Record<string, string>>({});

  const changePkg = useMutation({
    mutationFn: ({ id, packageId }: { id: string; packageId: string }) =>
      api.patch(`/subscriptions/${id}/package`, { packageId }),
    onSuccess: (_res, vars) => {
      setPkgSel((p) => { const n = { ...p }; delete n[vars.id]; return n; });
      invalidate();
    },
    onError: () => alert('Gagal menyetel paket ke Mikrotik.'),
  });
  const access = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'activate' }) =>
      api.post(`/subscriptions/${id}/${action}`),
    onSuccess: (_res, vars) => {
      setStatusSel((p) => { const n = { ...p }; delete n[vars.id]; return n; });
      invalidate();
    },
    onError: () => alert('Gagal mengirim perintah ke Mikrotik.'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Langganan</h1>
        {canWrite && (
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Tambah Langganan
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Ubah <strong>paket</strong> atau <strong>status</strong> (Aktif/Suspend) lewat dropdown, lalu klik
        <strong> Save</strong> untuk menerapkan ke Mikrotik. Tombol Save hanya muncul saat ada perubahan.
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
                    <div className="flex items-center gap-2">
                      <select
                        className="input py-1"
                        value={pkgSel[s.id] ?? s.packageId}
                        disabled={changePkg.isPending || !canWrite}
                        onChange={(e) => setPkgSel((p) => ({ ...p, [s.id]: e.target.value }))}
                      >
                        {packages?.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>
                        ))}
                      </select>
                      {canWrite && (pkgSel[s.id] && pkgSel[s.id] !== s.packageId) && (
                        <button
                          className="btn-primary py-1"
                          disabled={changePkg.isPending}
                          onClick={() => changePkg.mutate({ id: s.id, packageId: pkgSel[s.id] })}
                          title="Simpan & terapkan ke Mikrotik"
                        >
                          {changePkg.isPending && changePkg.variables?.id === s.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Save size={14} />} Save
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${tone[s.status] ?? 'bg-slate-100'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {!canWrite && <span className="text-xs text-slate-400">—</span>}
                      {canWrite && (
                        <>
                          <select
                            className="input py-1"
                            value={statusSel[s.id] ?? s.status}
                            disabled={access.isPending}
                            onChange={(e) => setStatusSel((p) => ({ ...p, [s.id]: e.target.value }))}
                          >
                            <option value="active">Aktif</option>
                            <option value="suspended">Suspend</option>
                          </select>
                          {(statusSel[s.id] && statusSel[s.id] !== s.status) && (
                            <button
                              className="btn-primary py-1"
                              disabled={access.isPending}
                              onClick={() => {
                                const action = statusSel[s.id] === 'active' ? 'activate' : 'suspend';
                                if (action === 'suspend' && !confirm(`Suspend ${s.customerName}? Koneksi PPPoE akan diputus.`)) return;
                                access.mutate({ id: s.id, action });
                              }}
                              title="Simpan status & kirim ke Mikrotik"
                            >
                              {access.isPending && access.variables?.id === s.id
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Save size={14} />} Save
                            </button>
                          )}
                        </>
                      )}
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

      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setAddOpen(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Tambah Langganan</h2>
              <button className="btn-ghost" onClick={() => setAddOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={onAddSubmit} className="space-y-3">
              <select name="customerId" className="input" required defaultValue="">
                <option value="" disabled>— Pilih pelanggan —</option>
                {customers?.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.customerNo})</option>)}
              </select>
              <input name="pppoeUser" className="input font-mono" placeholder="User PPPoE (mis. budi001)" required />
              <input name="pppoePass" className="input font-mono" placeholder="Password PPPoE (opsional)" />
              <select name="packageId" className="input" defaultValue="">
                <option value="">— Pilih paket —</option>
                {packages?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>)}
              </select>
              <select name="routerId" className="input" defaultValue="">
                <option value="">— Pilih router —</option>
                {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="btn-primary w-full" disabled={createSub.isPending}>
                {createSub.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
