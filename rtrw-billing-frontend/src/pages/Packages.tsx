import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Loader2, Network, Save, RefreshCw } from 'lucide-react';
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
  localAddress: string | null;
  dnsServer: string | null;
  onlyOne: string;
  parentQueue: string | null;
  insertQueueBefore: string | null;
}
interface RouterLite { id: string; name: string }
interface Profile { name: string; rateLimit?: string }
interface Pool { name: string; ranges?: string }
interface QueueLite { name: string }
interface MtOptions {
  pools: Pool[];
  queues: QueueLite[];
  profiles: Profile[];
  router?: string;
  error?: string;
}

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
  const sync = useMutation({
    mutationFn: () => api.post('/packages/sync-mikrotik'),
    onSuccess: (res: any) => {
      invalidate();
      const d = res?.data ?? {};
      if (d.error) { alert(`Sinkron gagal: ${d.error}`); return; }
      const detail = (d.routers ?? [])
        .map((r: any) => `• ${r.router}: +${r.created} baru, ${r.skipped} dilewati${r.error ? ` (${r.error})` : ''}`)
        .join('\n');
      alert(`Sinkron paket dari Mikrotik selesai.\nTotal: ${d.created ?? 0} paket baru, ${d.skipped ?? 0} dilewati.\n\n${detail}\n\nLengkapi HARGA tiap paket baru (default 0).`);
    },
    onError: (e: any) => alert(`Gagal sinkron: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Paket Layanan</h1>
        {canManage && (
          <div className="flex gap-2">
            <button
              className="btn-ghost text-brand-600"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
              title="Tarik PPP profile dari Mikrotik jadi paket"
            >
              {sync.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Sinkron
            </button>
            <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> Tambah Paket</button>
          </div>
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
              {p.localAddress && (
                <div className="flex justify-between"><dt>Local Address</dt><dd className="font-mono text-xs">{p.localAddress}</dd></div>
              )}
              {p.dnsServer && (
                <div className="flex justify-between"><dt>DNS</dt><dd className="font-mono text-xs">{p.dnsServer}</dd></div>
              )}
              {p.parentQueue && (
                <div className="flex justify-between"><dt>Parent Queue</dt><dd className="font-mono text-xs">{p.parentQueue}</dd></div>
              )}
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
  const [pushToMikrotik, setPushToMikrotik] = useState(true);

  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
  });
  // Opsi live dari Mikrotik: IP pool, simple queue, PPP profile.
  const { data: opts } = useQuery<MtOptions>({
    queryKey: ['mt-options', routerId],
    queryFn: async () => (await api.get('/packages/mikrotik-options', {
      params: routerId ? { routerId } : {},
    })).data,
  });

  const save = useMutation({
    mutationFn: (body: any) => pkg.id ? api.patch(`/packages/${pkg.id}`, body) : api.post('/packages', body),
    onSuccess: (res: any) => {
      const pushed: any[] = res.data?.pushed ?? [];
      const failed = pushed.filter((p) => !p.ok);
      if (pushed.length && failed.length) {
        alert(
          `Paket tersimpan. Profil PPP terkirim ke ${pushed.length - failed.length}/${pushed.length} router.\n\n` +
          failed.map((f) => `✗ ${f.router}: ${f.error}`).join('\n'),
        );
      } else if (pushed.length) {
        alert(`Paket tersimpan & profil PPP dibuat/diperbarui di ${pushed.length} router ✓`);
      }
      onSaved();
    },
    onError: (e: any) => alert(`Gagal menyimpan paket: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => ((fd.get(k) as string) ?? '').trim();
    save.mutate({
      name: str('name'),
      price: String(fd.get('price') ?? '0'),
      rateLimit: str('rateLimit'),
      pppoeProfile: str('pppoeProfile') || undefined,
      ipPool: str('ipPool'),
      localAddress: str('localAddress'),
      dnsServer: str('dnsServer'),
      onlyOne: str('onlyOne') || 'default',
      parentQueue: str('parentQueue'),
      insertQueueBefore: str('insertQueueBefore'),
      billingCycle: Number(fd.get('billingCycle')) || 30,
      isActive: fd.get('isActive') === 'on',
      pushToMikrotik,
    });
  }

  return (
    <Modal title={pkg.id ? 'Edit Paket' : 'Tambah Paket'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ── Informasi paket ── */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <Network size={14} /> Informasi Paket
          </h3>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Nama Paket *</label>
            <input name="name" className="input" placeholder="mis. Home 20Mbps" defaultValue={pkg.name} required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Harga *</label>
              <input name="price" type="number" className="input" placeholder="150000" defaultValue={pkg.price} required />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Siklus (hari)</label>
              <input name="billingCycle" type="number" className="input" defaultValue={pkg.billingCycle ?? 30} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Nama Profil PPP</label>
              <input name="pppoeProfile" className="input font-mono" placeholder="= nama paket" defaultValue={pkg.pppoeProfile} list="mt-profiles" />
              <datalist id="mt-profiles">
                {opts?.profiles?.map((p) => <option key={p.name} value={p.name}>{p.rateLimit ?? ''}</option>)}
              </datalist>
            </div>
          </div>
        </section>

        {/* ── Konfigurasi PPP profile ── */}
        <section className="space-y-3 rounded-lg border border-slate-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Konfigurasi PPP Profile</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Local Address</label>
              <input name="localAddress" className="input font-mono" placeholder="mis. 192.168.40.1" defaultValue={pkg.localAddress ?? ''} />
              <p className="mt-1 text-xs text-slate-400">IP gateway router untuk klien</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Remote Address (IP Pool)</label>
              <input name="ipPool" className="input font-mono" placeholder="mis. pool-pppoe" defaultValue={pkg.ipPool ?? ''} list="mt-pools" />
              <datalist id="mt-pools">
                {opts?.pools?.map((p) => <option key={p.name} value={p.name}>{p.ranges ?? ''}</option>)}
              </datalist>
              <p className="mt-1 text-xs text-slate-400">Pool IP klien</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Rate Limit *</label>
              <input name="rateLimit" className="input font-mono" placeholder="mis. 20M/20M" defaultValue={pkg.rateLimit} required />
              <p className="mt-1 text-xs text-slate-400">Format: 1M/2M atau 512k/1M</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Only One</label>
              <select name="onlyOne" className="input" defaultValue={pkg.onlyOne ?? 'default'}>
                <option value="default">— Default —</option>
                <option value="yes">yes (1 sesi per user)</option>
                <option value="no">no (boleh multi-sesi)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">DNS Server</label>
            <input name="dnsServer" className="input font-mono" placeholder="8.8.8.8, 1.1.1.1" defaultValue={pkg.dnsServer ?? ''} />
            <p className="mt-1 text-xs text-slate-400">Pisahkan dengan koma bila lebih dari satu</p>
          </div>
        </section>

        {/* ── Queue (lanjutan) ── */}
        <section className="space-y-3 rounded-lg border border-slate-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Konfigurasi Queue (Lanjutan)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Parent Queue</label>
              <input name="parentQueue" className="input font-mono" placeholder="(none)" defaultValue={pkg.parentQueue ?? ''} list="mt-queues" />
              <p className="mt-1 text-xs text-slate-400">Induk queue utk limitasi global</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Insert Queue Before</label>
              <input name="insertQueueBefore" className="input font-mono" placeholder="(none)" defaultValue={pkg.insertQueueBefore ?? ''} list="mt-queues" />
              <p className="mt-1 text-xs text-slate-400">Urutan penempatan di simple queue</p>
            </div>
          </div>
          <datalist id="mt-queues">
            {opts?.queues?.map((q) => <option key={q.name} value={q.name} />)}
          </datalist>
        </section>

        {/* ── Router sumber opsi + push ── */}
        <section className="space-y-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
          <label className="text-xs text-slate-500 block">Muat pilihan (pool/queue/profil) dari router</label>
          <select className="input" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
            <option value="">Router pertama (default)</option>
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {opts?.error && <p className="text-xs text-amber-600">{opts.error}</p>}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 pt-1">
            <input type="checkbox" className="rounded" checked={pushToMikrotik} onChange={(e) => setPushToMikrotik(e.target.checked)} />
            Buat/perbarui PPP profile di semua router saat simpan
          </label>
        </section>

        <label className="flex items-center gap-2 text-sm">
          <input name="isActive" type="checkbox" defaultChecked={pkg.isActive ?? true} /> Paket aktif
        </label>

        <button className="btn-primary w-full" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Simpan{pushToMikrotik ? ' & Sync Mikrotik' : ''}
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
