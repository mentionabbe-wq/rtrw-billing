import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Pencil, Trash2, RefreshCw, Receipt, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Customer {
  id: string;
  customerNo: string;
  fullName: string;
  status: string;
  createdAt: string;
}

interface CustomerDetail extends Customer {
  phone: string;
  nik: string;
  address: string;
}

const statusTone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  terminated: 'bg-slate-100 text-slate-600',
};

export default function Customers() {
  const qc = useQueryClient();
  const canWrite = useCan('customers.write');
  const canAdmin = useCan('settings.manage'); // hapus & clear-demo = admin
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editing, setEditing] = useState<CustomerDetail | null>(null);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });
  const { data: packages } = useQuery<{ id: string; name: string; rateLimit: string }[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });
  const { data: routers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
    enabled: canAdmin,
  });

  const close = () => { setMode('closed'); setEditing(null); };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
  };

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: invalidate,
    onError: () => alert('Gagal menghapus pelanggan.'),
  });
  const sync = useMutation({
    mutationFn: () => api.post('/customers/sync-mikrotik'),
    onSuccess: (res: any) => {
      invalidate();
      const d = res?.data ?? {};
      if (d.error) { alert(`Sinkron gagal: ${d.error}`); return; }
      const detail = (d.routers ?? [])
        .map((r: any) => `• ${r.router}: +${r.created} baru, ${r.skipped} dilewati${r.error ? ` (${r.error})` : ''}`)
        .join('\n');
      alert(`Sinkron dari Mikrotik selesai.\nTotal: ${d.created ?? 0} pelanggan baru, ${d.skipped ?? 0} dilewati.\n\n${detail}`);
    },
    onError: (e: any) => alert(`Gagal sinkron: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/customers', body),
    onSuccess: () => { invalidate(); close(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.patch(`/customers/${id}`, body),
    onSuccess: () => { invalidate(); close(); },
  });

  async function openEdit(id: string) {
    const { data } = await api.get<CustomerDetail>(`/customers/${id}`);
    setEditing(data);
    setMode('edit');
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      fullName: fd.get('fullName'),
      phone: fd.get('phone'),
      nik: fd.get('nik') || undefined,
      address: fd.get('address') || undefined,
    };
    if (mode === 'edit' && editing) {
      updateMut.mutate({ id: editing.id, body: { ...body, status: fd.get('status') } });
    } else {
      createMut.mutate({
        ...body,
        pppoeUser: fd.get('pppoeUser') || undefined,
        pppoePass: fd.get('pppoePass') || undefined,
        packageId: fd.get('packageId') || undefined,
        routerId: fd.get('routerId') || undefined,
      });
    }
  }

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pelanggan</h1>
        <div className="flex gap-2">
          {canAdmin && (
            <button
              className="btn-ghost text-brand-600"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
              title="Tarik pelanggan dari PPP secret Mikrotik"
            >
              {sync.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Sinkron
            </button>
          )}
          {canWrite && (
            <button className="btn-primary" onClick={() => setMode('create')}>
              <Plus size={16} /> Tambah
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">No. Pelanggan</th>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Terdaftar</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
              )}
              {data?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{c.customerNo}</td>
                  <td className="px-4 py-3 font-medium">{c.fullName}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusTone[c.status] ?? 'bg-slate-100'}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost text-brand-600" onClick={() => setHistoryFor(c)} title="Riwayat pembayaran">
                        <Receipt size={16} />
                      </button>
                      {canWrite && (
                        <button className="btn-ghost" onClick={() => openEdit(c.id)} title="Edit">
                          <Pencil size={16} />
                        </button>
                      )}
                      {canAdmin && (
                        <button
                          className="btn-ghost text-rose-600"
                          disabled={delMut.isPending}
                          onClick={() => {
                            if (confirm(`Hapus pelanggan ${c.fullName} beserta langganan, ONU, & tagihannya?`))
                              delMut.mutate(c.id);
                          }}
                          title="Hapus pelanggan"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada pelanggan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mode !== 'closed' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{mode === 'edit' ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</h2>
              <button className="btn-ghost" onClick={close}><X size={18} /></button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <input name="fullName" className="input" placeholder="Nama lengkap" defaultValue={editing?.fullName} required />
              <input name="phone" className="input" placeholder="No. HP" defaultValue={editing?.phone} required />
              <input name="nik" className="input" placeholder="NIK (opsional)" defaultValue={editing?.nik ?? ''} />
              <input name="address" className="input" placeholder="Alamat (opsional)" defaultValue={editing?.address ?? ''} />
              {mode === 'edit' && (
                <select name="status" className="input" defaultValue={editing?.status}>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="terminated">terminated</option>
                </select>
              )}
              {mode === 'create' && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">Langganan (opsional — isi user PPPoE agar langsung muncul di menu Langganan)</p>
                  <input name="pppoeUser" className="input font-mono" placeholder="User PPPoE (mis. budi001)" />
                  <input name="pppoePass" className="input font-mono" placeholder="Password PPPoE (opsional)" />
                  <select name="packageId" className="input">
                    <option value="">— Pilih paket —</option>
                    {packages?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>)}
                  </select>
                  <select name="routerId" className="input">
                    <option value="">— Pilih router —</option>
                    {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {(createMut.isError || updateMut.isError) && (
                <p className="text-sm text-red-600">
                  Gagal menyimpan:{' '}
                  {(createMut.error as any)?.response?.data?.message
                    ?? (updateMut.error as any)?.response?.data?.message
                    ?? (createMut.error as any)?.message
                    ?? (updateMut.error as any)?.message
                    ?? 'cek log server (docker logs rtrw-billing-app)'}
                </p>
              )}
              <button className="btn-primary w-full" disabled={pending}>
                {pending && <Loader2 className="animate-spin" size={16} />}
                Simpan
              </button>
            </form>
          </div>
        </div>
      )}

      {historyFor && <PaymentHistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

/* -------------------- Riwayat pembayaran + kuitansi WA -------------------- */
interface PaymentRow {
  id: string;
  invoiceNo: string | null;
  amount: string;
  method: string | null;
  gateway: string | null;
  status: string;
  paidAt: string | null;
  periodStart: string | null;
  packageName: string | null;
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

function PaymentHistoryModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data, isLoading } = useQuery<PaymentRow[]>({
    queryKey: ['customer-payments', customer.id],
    queryFn: async () => (await api.get(`/billing/customers/${customer.id}/payments`)).data,
  });

  const receipt = useMutation({
    mutationFn: (paymentId: string) => api.post(`/billing/payments/${paymentId}/receipt`),
    onSuccess: (res: any) =>
      alert(res.data?.sent ? 'Kuitansi dikirim ke WA pelanggan ✓' : `Tidak terkirim: ${res.data?.reason ?? '-'}`),
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e.message}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Receipt size={18} className="text-brand-600" /> Riwayat Pembayaran — {customer.fullName}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>

        {isLoading && <p className="py-8 text-center text-slate-400">Memuat…</p>}

        {data && (
          <div className="overflow-auto flex-1 rounded-lg border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Tanggal</th>
                  <th className="px-3 py-2 font-medium">Periode</th>
                  <th className="px-3 py-2 font-medium">Paket</th>
                  <th className="px-3 py-2 font-medium text-right">Jumlah</th>
                  <th className="px-3 py-2 font-medium">Metode</th>
                  <th className="px-3 py-2 font-medium text-right">Kuitansi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString('id-ID') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{p.periodStart ? String(p.periodStart).slice(0, 7) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{p.packageName ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{rupiah(p.amount)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{p.method ?? p.gateway ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {p.status === 'settled' ? (
                        <button className="btn-ghost py-1 text-xs text-brand-600"
                          disabled={receipt.isPending}
                          onClick={() => receipt.mutate(p.id)}
                          title="Kirim kuitansi ke WA pelanggan">
                          <Send size={13} /> Kirim
                        </button>
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700">{p.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.length && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    Belum ada pembayaran tercatat untuk pelanggan ini.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && data.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            {data.length} pembayaran · Total {rupiah(String(data.filter((p) => p.status === 'settled').reduce((s, p) => s + Number(p.amount), 0)))}
          </p>
        )}
      </div>
    </div>
  );
}
