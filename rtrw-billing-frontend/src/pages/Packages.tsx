import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Loader2, Network, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Pkg {
  id: string;
  name: string;
  price: string;
  rateLimit: string;
  pppoeProfile: string;
  ipPool: string | null;
  billingCycle: number;
  isActive: boolean;
}
interface RouterLite { id: string; name: string }
interface Profile { name: string; rateLimit?: string }
interface Pool { name: string; ranges?: string }

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

export default function Packages() {
  const qc = useQueryClient();
  const canManage = useCan('settings.manage');
  const [form, setForm] = useState<Partial<Pkg> | null>(null);

  const { data, isLoading } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['packages'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/packages/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Paket Layanan</h1>
        {canManage && (
          <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> Tambah Paket</button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-slate-400">Memuat…</p>}
        {data?.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{p.name}</h3>
              <span className={`badge ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.isActive ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-brand-700">{rupiah(p.price)}<span className="text-sm font-normal text-slate-400">/{p.billingCycle ?? 30}hr</span></p>
            <dl className="mt-4 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between"><dt>Bandwidth</dt><dd className="font-medium">{p.rateLimit}</dd></div>
              <div className="flex justify-between"><dt>Profil PPPoE</dt><dd className="font-mono text-xs">{p.pppoeProfile || '—'}</dd></div>
              <div className="flex justify-between"><dt>IP Pool</dt><dd className="font-mono text-xs">{p.ipPool || '—'}</dd></div>
            </dl>
            {canManage && (
              <div className="mt-4 flex justify-end gap-1">
                <button className="btn-ghost" title="Edit" onClick={() => setForm(p)}><Pencil size={16} /></button>
                <button className="btn-ghost text-rose-600" title="Hapus" onClick={() => confirm(`Hapus paket ${p.name}?`) && del.mutate(p.id)}><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        ))}
        {!isLoading && !data?.length && <p className="text-slate-400">Belum ada paket.</p>}
      </div>

      {form && <PackageForm pkg={form} onClose={() => setForm(null)} onSaved={() => { invalidate(); setForm(null); }} />}
    </div>
  );
}

/* ------------------------- Form Tambah/Edit Paket ------------------------- */
function PackageForm({ pkg, onClose, onSaved }: { pkg: Partial<Pkg>; onClose: () => void; onSaved: () => void }) {
  const [routerId, setRouterId] = useState('');
  const [profile, setProfile] = useState(pkg.pppoeProfile ?? '');
  const [pool, setPool] = useState(pkg.ipPool ?? '');

  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
  });
  // Ambil profil & pool LIVE dari Mikrotik begitu router dipilih.
  const { data: profiles } = useQuery<Profile[]>({
    queryKey: ['mt-profiles', routerId],
    queryFn: async () => (await api.get(`/routers/${routerId}/profiles`)).data,
    enabled: !!routerId,
  });
  const { data: pools } = useQuery<Pool[]>({
    queryKey: ['mt-pools', routerId],
    queryFn: async () => (await api.get(`/routers/${routerId}/pools`)).data,
    enabled: !!routerId,
  });

  const save = useMutation({
    mutationFn: (body: any) => pkg.id ? api.patch(`/packages/${pkg.id}`, body) : api.post('/packages', body),
    onSuccess: onSaved,
    onError: () => alert('Gagal menyimpan paket.'),
  });

  const applyPool = useMutation({
    mutationFn: () => api.post(`/routers/${routerId}/profile-pool`, { profile, pool }),
    onSuccess: () => alert(`Pool "${pool}" diterapkan ke profil "${profile}" di Mikrotik ✓`),
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save.mutate({
      name: fd.get('name'),
      price: String(fd.get('price') ?? '0'),
      rateLimit: fd.get('rateLimit'),
      pppoeProfile: profile || null,
      ipPool: pool || null,
      billingCycle: Number(fd.get('billingCycle')) || 30,
      isActive: fd.get('isActive') === 'on',
    });
  }

  return (
    <Modal title={pkg.id ? 'Edit Paket' : 'Tambah Paket'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input name="name" className="input" placeholder="Nama paket (mis. Home 20Mbps)" defaultValue={pkg.name} required />
        <div className="grid grid-cols-2 gap-3">
          <input name="price" type="number" className="input" placeholder="Harga / bln" defaultValue={pkg.price} required />
          <input name="billingCycle" type="number" className="input" placeholder="Siklus (hari)" defaultValue={pkg.billingCycle ?? 30} />
        </div>
        <input name="rateLimit" className="input font-mono" placeholder="Rate limit, mis. 20M/20M" defaultValue={pkg.rateLimit} required />

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500"><Network size={13} /> Integrasi Mikrotik (opsional)</p>
          <select className="input mb-2" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
            <option value="">Pilih router untuk muat profil & pool live…</option>
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input
            className="input mb-2 font-mono" placeholder="Profil PPPoE" list="mt-profiles"
            value={profile} onChange={(e) => setProfile(e.target.value)}
          />
          <datalist id="mt-profiles">
            {profiles?.map((p) => <option key={p.name} value={p.name}>{p.rateLimit ?? ''}</option>)}
          </datalist>
          <input
            className="input font-mono" placeholder="IP Pool" list="mt-pools"
            value={pool} onChange={(e) => setPool(e.target.value)}
          />
          <datalist id="mt-pools">
            {pools?.map((p) => <option key={p.name} value={p.name}>{p.ranges ?? ''}</option>)}
          </datalist>
          {routerId && profile && pool && (
            <button
              type="button" className="btn-ghost mt-2 text-brand-600"
              disabled={applyPool.isPending}
              onClick={() => applyPool.mutate()}
              title="Set remote-address profil = pool di Mikrotik"
            >
              {applyPool.isPending ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
              Terapkan pool → profil ke Mikrotik
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input name="isActive" type="checkbox" defaultChecked={pkg.isActive ?? true} /> Paket aktif
        </label>

        <button className="btn-primary w-full" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
