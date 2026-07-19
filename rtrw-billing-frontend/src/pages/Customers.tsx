import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, X, Pencil, Trash2, RefreshCw, Receipt, Send, Save,
  Eye, EyeOff, Dices, CheckCircle2, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

/** Pelanggan + ringkasan langganan (menu Pelanggan & Langganan digabung). */
interface Customer {
  id: string;
  customerNo: string;
  fullName: string;
  status: string;
  createdAt: string;
  subscriptionId: string | null;
  pppoeUser: string | null;
  packageId: string | null;
  packageName: string | null;
  rateLimit: string | null;
  subStatus: string | null;
  dueDate: string | null;
}

interface CustomerDetail {
  id: string;
  customerNo: string;
  fullName: string;
  status: string;
  phone: string;
  nik: string;
  address: string;
}

interface Pkg { id: string; name: string; rateLimit: string }
interface RouterLite { id: string; name: string }

const statusTone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  isolated: 'bg-rose-50 text-rose-700',
  terminated: 'bg-slate-100 text-slate-600',
};

function genPassword(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function Customers() {
  const qc = useQueryClient();
  const canWrite = useCan('customers.write');
  const canAdmin = useCan('settings.manage');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CustomerDetail | null>(null);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });
  const { data: packages } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });
  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
  });

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
      alert(`Sinkron dari Mikrotik selesai: ${d.created ?? 0} pelanggan baru, ${d.skipped ?? 0} dilewati.`);
    },
    onError: (e: any) => alert(`Gagal sinkron: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.patch(`/customers/${id}`, body),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  // ── Aksi langganan inline (dari menu Langganan lama) ──
  const [pkgSel, setPkgSel] = useState<Record<string, string>>({});
  const [statusSel, setStatusSel] = useState<Record<string, string>>({});

  const changePkg = useMutation({
    mutationFn: ({ subId, packageId }: { subId: string; packageId: string }) =>
      api.patch(`/subscriptions/${subId}/package`, { packageId }),
    onSuccess: (_r, v) => {
      setPkgSel((p) => { const n = { ...p }; delete n[v.subId]; return n; });
      invalidate();
    },
    onError: () => alert('Gagal menyetel paket ke Mikrotik.'),
  });
  const access = useMutation({
    mutationFn: ({ subId, action }: { subId: string; action: 'suspend' | 'activate' }) =>
      api.post(`/subscriptions/${subId}/${action}`),
    onSuccess: (_r, v) => {
      setStatusSel((p) => { const n = { ...p }; delete n[v.subId]; return n; });
      invalidate();
    },
    onError: () => alert('Gagal mengirim perintah ke Mikrotik.'),
  });

  async function openEdit(id: string) {
    const { data } = await api.get<CustomerDetail>(`/customers/${id}`);
    setEditing(data);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pelanggan</h1>
        <div className="flex gap-2">
          {canAdmin && (
            <button className="btn-ghost text-brand-600" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Sinkron Mikrotik
            </button>
          )}
          {canWrite && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Daftar Pelanggan Baru
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Pelanggan & langganan dalam satu tabel. Ubah <strong>paket/status</strong> lewat dropdown lalu klik
        <strong> Save</strong> — langsung diterapkan ke Mikrotik.
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">User PPPoE</th>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
              )}
              {data?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.fullName}</div>
                    <div className="font-mono text-xs text-slate-400">{c.customerNo}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.pppoeUser ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.subscriptionId && canWrite ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="input py-1 text-xs min-w-[8rem]"
                          value={pkgSel[c.subscriptionId] ?? c.packageId ?? ''}
                          disabled={changePkg.isPending}
                          onChange={(e) => setPkgSel((p) => ({ ...p, [c.subscriptionId!]: e.target.value }))}
                        >
                          {!c.packageId && <option value="">— pilih —</option>}
                          {packages?.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>
                          ))}
                        </select>
                        {pkgSel[c.subscriptionId] && pkgSel[c.subscriptionId] !== c.packageId && (
                          <button className="btn-primary py-1 text-xs" disabled={changePkg.isPending}
                            onClick={() => changePkg.mutate({ subId: c.subscriptionId!, packageId: pkgSel[c.subscriptionId!] })}>
                            {changePkg.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                          </button>
                        )}
                      </div>
                    ) : (c.packageName ?? '—')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.dueDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.subscriptionId && canWrite ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="input py-1 text-xs"
                          value={statusSel[c.subscriptionId] ?? c.subStatus ?? 'active'}
                          disabled={access.isPending}
                          onChange={(e) => setStatusSel((p) => ({ ...p, [c.subscriptionId!]: e.target.value }))}
                        >
                          <option value="active">Aktif</option>
                          <option value="suspended">Suspend</option>
                        </select>
                        {statusSel[c.subscriptionId] && statusSel[c.subscriptionId] !== c.subStatus && (
                          <button className="btn-primary py-1 text-xs" disabled={access.isPending}
                            onClick={() => {
                              const action = statusSel[c.subscriptionId!] === 'active' ? 'activate' : 'suspend';
                              if (action === 'suspend' && !confirm(`Suspend ${c.fullName}? Koneksi PPPoE diputus.`)) return;
                              access.mutate({ subId: c.subscriptionId!, action });
                            }}>
                            {access.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className={`badge ${statusTone[c.subStatus ?? c.status] ?? 'bg-slate-100'}`}>
                        {c.subStatus ?? c.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost text-brand-600" onClick={() => setHistoryFor(c)} title="Riwayat pembayaran">
                        <Receipt size={16} />
                      </button>
                      {canWrite && (
                        <button className="btn-ghost" onClick={() => openEdit(c.id)} title="Edit data pelanggan">
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada pelanggan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateCustomerModal
          packages={packages ?? []}
          routers={routers ?? []}
          onClose={() => setShowCreate(false)}
          onSaved={() => { invalidate(); setShowCreate(false); }}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Edit Pelanggan</h2>
              <button className="btn-ghost" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              updateMut.mutate({
                id: editing.id,
                body: {
                  fullName: fd.get('fullName'),
                  phone: fd.get('phone'),
                  nik: fd.get('nik') || undefined,
                  address: fd.get('address') || undefined,
                  status: fd.get('status'),
                },
              });
            }} className="space-y-3">
              <input name="fullName" className="input" placeholder="Nama lengkap" defaultValue={editing.fullName} required />
              <input name="phone" className="input" placeholder="No. HP" defaultValue={editing.phone} required />
              <input name="nik" className="input" placeholder="NIK (opsional)" defaultValue={editing.nik ?? ''} />
              <input name="address" className="input" placeholder="Alamat (opsional)" defaultValue={editing.address ?? ''} />
              <select name="status" className="input" defaultValue={editing.status}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="terminated">terminated</option>
              </select>
              <button className="btn-primary w-full" disabled={updateMut.isPending}>
                {updateMut.isPending && <Loader2 className="animate-spin" size={16} />} Simpan
              </button>
            </form>
          </div>
        </div>
      )}

      {historyFor && <PaymentHistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

/* -------------- Form pendaftaran pelanggan + PPPoE (ala NMS) -------------- */
function CreateCustomerModal({ packages, routers, onClose, onSaved }: {
  packages: Pkg[]; routers: RouterLite[]; onClose: () => void; onSaved: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [showPass, setShowPass] = useState(false);
  const [routerId, setRouterId] = useState(routers[0]?.id ?? '');
  const [check, setCheck] = useState<{ available: boolean; reason?: string; warning?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const create = useMutation({
    mutationFn: (body: any) => api.post('/customers', body),
    onSuccess: onSaved,
    onError: (e: any) => alert(`Gagal menyimpan: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  async function doCheck() {
    if (!username.trim()) return;
    setChecking(true);
    try {
      const res = await api.get('/customers/check-pppoe', {
        params: { username: username.trim(), routerId: routerId || undefined },
      });
      setCheck(res.data);
    } catch (e: any) {
      setCheck({ available: false, reason: e?.response?.data?.message ?? 'Gagal memeriksa.' });
    } finally {
      setChecking(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      fullName: fd.get('fullName'),
      phone: fd.get('phone'),
      address: fd.get('address') || undefined,
      nik: fd.get('nik') || undefined,
      pppoeUser: username.trim() || undefined,
      pppoePass: password || undefined,
      packageId: fd.get('packageId') || undefined,
      routerId: routerId || undefined,
      ipStatic: (fd.get('ipStatic') as string)?.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold">Daftar Pelanggan Baru</h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto px-6 py-4 space-y-4">
          {/* ── Data pelanggan ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data Pelanggan</p>
            <div className="grid grid-cols-2 gap-3">
              <input name="fullName" className="input" placeholder="Nama lengkap *" required />
              <input name="phone" className="input" placeholder="No. HP / WA *" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="address" className="input" placeholder="Alamat (opsional)" />
              <input name="nik" className="input" placeholder="NIK (opsional)" />
            </div>
          </div>

          {/* ── Akun PPPoE ── */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Akun PPPoE (Mikrotik)</p>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">Username</label>
              <div className="flex gap-2">
                <input className="input font-mono flex-1" placeholder="mis. budi001"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setCheck(null); }} />
                <button type="button" className="btn-ghost text-brand-600 text-xs whitespace-nowrap"
                  disabled={checking || !username.trim()} onClick={doCheck}>
                  {checking ? <Loader2 size={14} className="animate-spin" /> : 'CEK'}
                </button>
              </div>
              {check && (
                <p className={`mt-1 flex items-center gap-1 text-xs ${check.available ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {check.available ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {check.available ? (check.warning ?? 'Username tersedia ✓') : check.reason}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">Password</label>
              <div className="flex gap-2">
                <input className="input font-mono flex-1" type={showPass ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn-ghost" title={showPass ? 'Sembunyikan' : 'Lihat'}
                  onClick={() => setShowPass((s) => !s)}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button type="button" className="btn-ghost text-brand-600" title="Generate password acak"
                  onClick={() => { setPassword(genPassword()); setShowPass(true); }}>
                  <Dices size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Profil / Paket</label>
                <select name="packageId" className="input" defaultValue="">
                  <option value="">— Pilih paket —</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rateLimit})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Router</label>
                <select className="input" value={routerId} onChange={(e) => { setRouterId(e.target.value); setCheck(null); }}>
                  <option value="">— Pilih router —</option>
                  {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">IP Statis / Remote Address (opsional)</label>
              <input name="ipStatic" className="input font-mono" placeholder="mis. 192.168.40.50 — kosongkan utk IP otomatis dari pool" />
            </div>

            <p className="text-xs text-slate-400">
              Secret PPPoE otomatis dibuat di Mikrotik saat disimpan (service=pppoe,
              profil sesuai paket). Kosongkan username bila hanya mendaftar data pelanggan.
            </p>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-100">
          <button className="btn-primary w-full" disabled={create.isPending}
            onClick={(e) => {
              const form = (e.currentTarget.closest('.card') as HTMLElement).querySelector('form');
              form?.requestSubmit();
            }}>
            {create.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Daftarkan Pelanggan{username.trim() ? ' + Buat PPPoE di Mikrotik' : ''}
          </button>
        </div>
      </div>
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
