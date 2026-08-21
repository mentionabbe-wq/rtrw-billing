import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Area {
  id: string;
  name: string;
  village: string | null;
  district: string | null;
  rt: string | null;
  rw: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  status: 'available' | 'full' | 'planned';
  note: string | null;
  isActive: boolean;
}

const STATUS_LABEL = {
  available: { label: 'Tersedia', cls: 'bg-emerald-100 text-emerald-700' },
  full: { label: 'Penuh', cls: 'bg-amber-100 text-amber-700' },
  planned: { label: 'Rencana', cls: 'bg-slate-200 text-slate-600' },
} as const;

const EMPTY: Partial<Area> = { name: '', status: 'available', radiusM: 700, isActive: true };

/** Panel admin: area layanan untuk fitur cek ketersediaan di landing page (§35). */
export default function Coverage() {
  const qc = useQueryClient();
  const canManage = useCan('settings.manage');
  const [form, setForm] = useState<Partial<Area> | null>(null);

  const { data, isLoading } = useQuery<Area[]>({
    queryKey: ['coverage-areas'],
    queryFn: async () => (await api.get('/coverage-areas')).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['coverage-areas'] });
  const fail = (e: any) => alert(e?.response?.data?.message ?? 'Operasi gagal.');

  const save = useMutation({
    mutationFn: (v: Partial<Area>) => {
      const body = {
        name: v.name,
        village: v.village || undefined,
        district: v.district || undefined,
        rt: v.rt || undefined,
        rw: v.rw || undefined,
        lat: v.lat ?? undefined,
        lng: v.lng ?? undefined,
        radiusM: v.radiusM ?? 700,
        status: v.status ?? 'available',
        note: v.note || undefined,
        isActive: v.isActive ?? true,
      };
      return v.id ? api.patch(`/coverage-areas/${v.id}`, body) : api.post('/coverage-areas', body);
    },
    onSuccess: () => { invalidate(); setForm(null); },
    onError: fail,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/coverage-areas/${id}`),
    onSuccess: invalidate,
    onError: fail,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form?.name?.trim()) return;
    save.mutate(form);
  };

  const set = (k: keyof Area) => (e: any) => {
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...(f ?? {}), [k]: raw }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Area Layanan</h1>
          <p className="text-sm text-slate-500">
            Dipakai fitur "Cek Ketersediaan Internet" di halaman depan.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setForm({ ...EMPTY })}>
            <Plus size={16} /> Tambah Area
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" /> Memuat area…
        </div>
      ) : !data?.length ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          Belum ada area layanan. Tambahkan minimal satu agar pengunjung bisa cek ketersediaan.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">RT / RW</th>
                <th className="px-4 py-3">Titik & radius</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aktif</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {[a.village, a.district].filter(Boolean).join(' · ') || '-'}
                    </p>
                    {a.note && <p className="text-xs italic text-slate-400">{a.note}</p>}
                  </td>
                  <td className="px-4 py-3">{a.rt ?? '-'} / {a.rw ?? '-'}</td>
                  <td className="px-4 py-3">
                    {a.lat != null && a.lng != null ? (
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin size={13} /> {a.lat.toFixed(5)}, {a.lng.toFixed(5)} · {a.radiusM} m
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">tanpa titik GPS</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', STATUS_LABEL[a.status].cls)}>
                      {STATUS_LABEL[a.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{a.isActive ? 'Ya' : 'Tidak'}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost" onClick={() => setForm(a)} title="Ubah">
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-ghost text-rose-600"
                          title="Hapus"
                          onClick={() => {
                            if (window.confirm(`Hapus area "${a.name}"?`)) del.mutate(a.id);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? 'Ubah Area' : 'Tambah Area'}</h2>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Nama area *</label>
                <input className="input" value={form.name ?? ''} onChange={set('name')} required
                  placeholder="RT 01 / RW 05" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kelurahan/Desa</label>
                <input className="input" value={form.village ?? ''} onChange={set('village')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kecamatan</label>
                <input className="input" value={form.district ?? ''} onChange={set('district')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">RT</label>
                <input className="input" value={form.rt ?? ''} onChange={set('rt')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">RW</label>
                <input className="input" value={form.rw ?? ''} onChange={set('rw')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Lintang (lat)</label>
                <input className="input" type="number" step="0.0000001" value={form.lat ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value === '' ? null : Number(e.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Bujur (lng)</label>
                <input className="input" type="number" step="0.0000001" value={form.lng ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value === '' ? null : Number(e.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Radius (meter)</label>
                <input className="input" type="number" min={50} value={form.radiusM ?? 700}
                  onChange={(e) => setForm((f) => ({ ...f, radiusM: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select className="input" value={form.status ?? 'available'} onChange={set('status')}>
                  <option value="available">Tersedia</option>
                  <option value="full">Penuh (daftar tunggu)</option>
                  <option value="planned">Rencana penarikan</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input className="input" value={form.note ?? ''} onChange={set('note')}
                  placeholder="Ditampilkan ke calon pelanggan" />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.isActive ?? true} onChange={set('isActive')} />
                Tampilkan area ini di halaman depan
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending && <Loader2 size={16} className="animate-spin" />} Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
