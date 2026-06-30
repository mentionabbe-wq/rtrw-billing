import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ticket, Plus, RefreshCw, Trash2, Loader2, Printer, Ban, ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface HotspotPackage {
  id: number;
  name: string;
  durationMinutes: number;
  price: string;
  mikrotikProfile: string;
  isActive: boolean;
}

interface Voucher {
  id: string;
  code: string;
  username: string;
  status: string;
  packageName: string | null;
  durationMinutes: number | null;
  routerName: string | null;
  buyerName: string | null;
  amount: string;
  createdAt: string;
}

interface Router {
  id: string;
  name: string;
  status: string;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  void: number;
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

const fmtDuration = (m: number) => {
  if (m < 60) return `${m} mnt`;
  if (m < 1440) return `${m / 60} jam`;
  if (m < 10080) return `${m / 1440} hari`;
  return `${Math.round(m / 10080)} minggu`;
};

const tone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  void: 'bg-slate-100 text-slate-500',
};

function PrintVoucherBtn({ voucher }: { voucher: Voucher }) {
  const win = () => {
    const w = window.open('', '_blank', 'width=400,height=300');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Voucher</title>
<style>body{font-family:monospace;text-align:center;padding:24px}
.box{border:2px dashed #333;padding:16px;display:inline-block;min-width:260px}
h2{margin:0 0 8px;font-size:18px} .code{font-size:24px;font-weight:bold;letter-spacing:.2em;color:#012b6d}
p{margin:4px 0;font-size:12px} @media print{button{display:none}}</style></head>
<body><div class="box"><h2>🌐 Voucher Internet</h2>
<p>${voucher.packageName ?? ''} &bull; ${voucher.durationMinutes ? fmtDuration(voucher.durationMinutes) : ''}</p>
<div class="code">${voucher.code}</div>
<p style="margin-top:10px;font-size:11px">Username: <b>${voucher.username}</b></p>
<p>Harga: ${rupiah(voucher.amount)}</p>
</div><br><button onclick="window.print()">Cetak</button>
<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  };
  return (
    <button className="btn-ghost py-1 text-xs" title="Cetak voucher" onClick={win}>
      <Printer size={13} />
    </button>
  );
}

// ── Generate Batch Modal ──────────────────────────────────────────────────────
function GenerateModal({
  packages, routers, onClose, onDone,
}: {
  packages: HotspotPackage[];
  routers: Router[];
  onClose: () => void;
  onDone: (rows: any[]) => void;
}) {
  const [form, setForm] = useState({ packageId: packages[0]?.id ?? '', routerId: routers[0]?.id ?? '', count: 5 });

  const gen = useMutation({
    mutationFn: () => api.post('/hotspot/vouchers/generate', {
      packageId: Number(form.packageId),
      routerId: form.routerId,
      count: Number(form.count),
    }),
    onSuccess: (res) => onDone(res.data),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold">Generate Batch Voucher</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Paket</label>
            <select className="input mt-1" value={form.packageId}
              onChange={(e) => setForm({ ...form, packageId: e.target.value as any })}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {rupiah(p.price)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Router / Hotspot</label>
            <select className="input mt-1" value={form.routerId}
              onChange={(e) => setForm({ ...form, routerId: e.target.value })}>
              {routers.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Jumlah (maks 100)</label>
            <input type="number" className="input mt-1" min={1} max={100}
              value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
          </div>
        </div>
        {gen.isError && (
          <p className="text-sm text-red-600">{(gen.error as any)?.response?.data?.message ?? 'Gagal generate'}</p>
        )}
        <div className="flex gap-2">
          <button className="flex-1 btn-ghost" onClick={onClose}>Batal</button>
          <button className="flex-1 btn-primary" disabled={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Package Form Modal ────────────────────────────────────────────────────────
function PackageModal({ pkg, onClose, onSaved }: { pkg?: HotspotPackage; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!pkg;
  const [form, setForm] = useState({
    name: pkg?.name ?? '',
    durationMinutes: pkg?.durationMinutes ?? 1440,
    price: pkg?.price ?? '0',
    mikrotikProfile: pkg?.mikrotikProfile ?? 'default',
    isActive: pkg?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: () => isEdit
      ? api.patch(`/hotspot/admin/packages/${pkg!.id}`, form)
      : api.post('/hotspot/admin/packages', form),
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold">{isEdit ? 'Edit Paket' : 'Tambah Paket'}</h2>
        <div className="space-y-3">
          {[
            { label: 'Nama paket', key: 'name', type: 'text', placeholder: '1 Hari' },
            { label: 'Durasi (menit)', key: 'durationMinutes', type: 'number', placeholder: '1440' },
            { label: 'Harga (Rp)', key: 'price', type: 'number', placeholder: '8000' },
            { label: 'Profile Mikrotik', key: 'mikrotikProfile', type: 'text', placeholder: 'default' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-medium text-slate-600">{label}</label>
              <input type={type} className="input mt-1" placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: type === 'number' ? e.target.value : e.target.value })} />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Aktif (tampil di halaman beli voucher)
          </label>
        </div>
        {save.isError && (
          <p className="text-sm text-red-600">{(save.error as any)?.response?.data?.message ?? 'Gagal menyimpan'}</p>
        )}
        <div className="flex gap-2">
          <button className="flex-1 btn-ghost" onClick={onClose}>Batal</button>
          <button className="flex-1 btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Hotspot() {
  const qc = useQueryClient();
  const canAdmin = useCan('settings.manage');
  const [tab, setTab] = useState<'vouchers' | 'packages'>('vouchers');
  const [filterStatus, setFilterStatus] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editPkg, setEditPkg] = useState<HotspotPackage | undefined>();
  const [generatedVouchers, setGeneratedVouchers] = useState<any[] | null>(null);

  const { data: stats } = useQuery<Stats>({
    queryKey: ['hotspot-stats'],
    queryFn: async () => (await api.get('/hotspot/stats')).data,
    refetchInterval: 30000,
  });

  const { data: vouchers, isLoading: vLoading, refetch: refetchV } = useQuery<Voucher[]>({
    queryKey: ['hotspot-vouchers', filterStatus],
    queryFn: async () => (await api.get('/hotspot/vouchers', { params: { status: filterStatus || undefined } })).data,
  });

  const { data: packages, refetch: refetchPkg } = useQuery<HotspotPackage[]>({
    queryKey: ['hotspot-packages-admin'],
    queryFn: async () => (await api.get('/hotspot/admin/packages')).data,
  });

  const { data: routers } = useQuery<Router[]>({
    queryKey: ['hotspot-routers'],
    queryFn: async () => (await api.get('/hotspot/routers')).data,
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => api.post(`/hotspot/vouchers/${id}/void`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotspot-vouchers'] }); qc.invalidateQueries({ queryKey: ['hotspot-stats'] }); },
  });

  const deletePkg = useMutation({
    mutationFn: (id: number) => api.delete(`/hotspot/admin/packages/${id}`),
    onSuccess: () => refetchPkg(),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Ticket size={22} className="text-indigo-500" /> Hotspot Voucher
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Voucher', val: stats?.total ?? '—', color: 'text-slate-700' },
          { label: 'Aktif', val: stats?.active ?? '—', color: 'text-emerald-600' },
          { label: 'Pending Bayar', val: stats?.pending ?? '—', color: 'text-amber-600' },
          { label: 'Void', val: stats?.void ?? '—', color: 'text-slate-400' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(['vouchers', 'packages'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${tab === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'vouchers' ? 'Voucher' : 'Paket'}
          </button>
        ))}
      </div>

      {/* ── Voucher tab ── */}
      {tab === 'vouchers' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <select className="input w-auto text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="pending">Pending</option>
              <option value="void">Void</option>
            </select>
            <div className="flex gap-2">
              <button className="btn-ghost text-sm" onClick={() => refetchV()}>
                <RefreshCw size={14} />
              </button>
              <button className="btn-primary text-sm" onClick={() => setShowGenerate(true)}>
                <Plus size={14} /> Generate Voucher
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kode</th>
                    <th className="px-4 py-3 font-medium">Paket</th>
                    <th className="px-4 py-3 font-medium">Pembeli</th>
                    <th className="px-4 py-3 font-medium">Router</th>
                    <th className="px-4 py-3 font-medium">Harga</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
                  {vouchers?.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-bold tracking-wider">{v.code}</td>
                      <td className="px-4 py-3">
                        <div>{v.packageName ?? '—'}</div>
                        <div className="text-xs text-slate-400">{v.durationMinutes ? fmtDuration(v.durationMinutes) : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.buyerName ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{v.routerName ?? '—'}</td>
                      <td className="px-4 py-3">{v.amount ? rupiah(v.amount) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${tone[v.status] ?? 'bg-slate-100 text-slate-500'}`}>{v.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {v.status === 'active' && <PrintVoucherBtn voucher={v} />}
                          {v.status !== 'void' && canAdmin && (
                            <button className="btn-ghost py-1 text-xs text-red-500"
                              title="Void voucher"
                              disabled={voidMut.isPending}
                              onClick={() => confirm(`Void voucher ${v.code}?`) && voidMut.mutate(v.id)}>
                              <Ban size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!vLoading && !vouchers?.length && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada voucher.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Paket tab ── */}
      {tab === 'packages' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            {canAdmin && (
              <button className="btn-primary text-sm" onClick={() => { setEditPkg(undefined); setShowPkgModal(true); }}>
                <Plus size={14} /> Tambah Paket
              </button>
            )}
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nama</th>
                    <th className="px-4 py-3 font-medium">Durasi</th>
                    <th className="px-4 py-3 font-medium">Harga</th>
                    <th className="px-4 py-3 font-medium">Profile Mikrotik</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {packages?.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-slate-500">{fmtDuration(p.durationMinutes)}</td>
                      <td className="px-4 py-3 font-medium">{rupiah(p.price)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.mikrotikProfile}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {p.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canAdmin && (
                          <div className="flex justify-end gap-1">
                            <button className="btn-ghost text-xs py-1"
                              onClick={() => { setEditPkg(p); setShowPkgModal(true); }}>
                              Edit
                            </button>
                            <button className="btn-ghost text-xs py-1 text-red-500"
                              disabled={deletePkg.isPending}
                              onClick={() => confirm(`Hapus paket "${p.name}"?`) && deletePkg.mutate(p.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!packages?.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada paket.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && packages && routers && (
        <GenerateModal
          packages={packages.filter((p) => p.isActive)}
          routers={routers}
          onClose={() => setShowGenerate(false)}
          onDone={(rows) => {
            setShowGenerate(false);
            setGeneratedVouchers(rows);
            qc.invalidateQueries({ queryKey: ['hotspot-vouchers'] });
            qc.invalidateQueries({ queryKey: ['hotspot-stats'] });
          }}
        />
      )}

      {/* Package Modal */}
      {showPkgModal && (
        <PackageModal pkg={editPkg} onClose={() => setShowPkgModal(false)} onSaved={() => refetchPkg()} />
      )}

      {/* Generated vouchers result */}
      {generatedVouchers && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-lg p-6 space-y-4 max-h-[80vh] flex flex-col">
            <h2 className="font-semibold">{generatedVouchers.length} Voucher Dibuat</h2>
            <div className="overflow-y-auto flex-1 border rounded-lg divide-y text-sm">
              {generatedVouchers.map((v) => (
                <div key={v.code} className="px-4 py-2 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-bold tracking-wider text-slate-800">{v.code}</span>
                    <span className="text-xs text-slate-400 ml-2">pass: {v.password}</span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{v.packageName}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="flex-1 btn-ghost text-sm"
                onClick={() => {
                  const text = generatedVouchers.map((v) => `${v.code} | ${v.username} | ${v.password} | ${v.packageName}`).join('\n');
                  navigator.clipboard.writeText(text).then(() => alert('Disalin ke clipboard!'));
                }}>
                Salin Semua
              </button>
              <button className="flex-1 btn-primary text-sm" onClick={() => setGeneratedVouchers(null)}>Selesai</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
