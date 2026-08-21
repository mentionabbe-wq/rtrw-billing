import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { errorMessage, publicApi } from '@/lib/publicApi';
import { rupiah } from '@/lib/format';
import { Modal } from './Modal';

export interface PublicPackage {
  id: string;
  name: string;
  price: number;
  speedDownMbps: number | null;
  speedUpMbps: number | null;
  description: string | null;
  features: string[];
  badge: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  packages: PublicPackage[];
  /** Paket yang dipilih dari kartu harga. */
  presetPackageId?: string | null;
}

/** Formulir pendaftaran calon pelanggan (§36). */
export function DaftarDialog({ open, onClose, packages, presetPackageId }: Props) {
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', address: '', rt: '', rw: '', note: '',
  });
  const [packageId, setPackageId] = useState<string>(presetPackageId ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ requestNo: string; message: string } | null>(null);

  // Ikuti paket yang diklik dari kartu harga saat dialog dibuka.
  useEffect(() => {
    if (open && presetPackageId) setPackageId(presetPackageId);
  }, [open, presetPackageId]);

  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setError(null);
    setDone(null);
    onClose();
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError('Perangkat Anda tidak mendukung deteksi lokasi.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoBusy(false); },
      () => { setError('Izin lokasi ditolak. Anda tetap dapat mendaftar dengan alamat.'); setGeoBusy(false); },
      { timeout: 10000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await publicApi.post('/register', {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim(),
        rt: form.rt.trim() || undefined,
        rw: form.rw.trim() || undefined,
        note: form.note.trim() || undefined,
        packageId: packageId ? Number(packageId) : undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      setDone({ requestNo: res.data?.requestNo, message: res.data?.message });
    } catch (err) {
      setError(errorMessage(err, 'Pendaftaran gagal dikirim.'));
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Daftar Internet"
      subtitle={done ? undefined : 'Isi data berikut, tim kami akan menghubungi Anda via WhatsApp.'}
    >
      {done ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
          <div>
            <p className="text-lg font-semibold">Pendaftaran terkirim</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{done.message}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-4 dark:bg-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Nomor pendaftaran</p>
            <p className="text-xl font-bold tracking-wide">{done.requestNo}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Simpan nomor ini untuk menanyakan status.</p>
          </div>
          <button className="btn-primary w-full" onClick={close}>Selesai</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Nama lengkap *</label>
              <input className={inputCls} value={form.fullName} onChange={set('fullName')} required minLength={2} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Nomor WhatsApp *</label>
              <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="081234567890" required />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email (opsional)</label>
            <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Alamat lengkap *</label>
            <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} required minLength={8} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">RT</label>
              <input className={inputCls} value={form.rt} onChange={set('rt')} placeholder="01" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">RW</label>
              <input className={inputCls} value={form.rw} onChange={set('rw')} placeholder="05" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Paket</label>
              <select className={inputCls} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                <option value="">Belum menentukan</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {rupiah(p.price)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Catatan (opsional)</label>
            <input className={inputCls} value={form.note} onChange={set('note')} placeholder="Patokan rumah, jadwal survei, dll." />
          </div>

          <button
            type="button"
            onClick={locate}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {geoBusy ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
            {coords
              ? `Lokasi terkirim (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
              : 'Kirim titik lokasi saya (mempercepat survei)'}
          </button>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            Kirim Pendaftaran
          </button>
        </form>
      )}
    </Modal>
  );
}
