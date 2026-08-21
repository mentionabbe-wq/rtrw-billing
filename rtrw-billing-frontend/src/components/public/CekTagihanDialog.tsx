import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { errorMessage, publicApi } from '@/lib/publicApi';
import { rupiah, tanggal } from '@/lib/format';
import { Modal } from './Modal';

interface BillingResult {
  customer: { fullName: string; customerNo: string; status: string };
  package: { name: string; price: number } | null;
  service: { status: string; dueDate: string | null };
  invoices: { id: string; invoiceNo: string; amount: number; dueDate: string; status: string }[];
  total: number;
}

type Step = 'identify' | 'otp' | 'result';

/**
 * Cek tagihan publik (§3). Data pelanggan baru ditampilkan SETELAH kode OTP
 * yang dikirim ke WhatsApp terdaftar diverifikasi.
 */
export function CekTagihanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingResult | null>(null);

  const reset = () => {
    setStep('identify'); setIdentifier(''); setCode(''); setMasked('');
    setError(null); setData(null); setLoading(false);
  };

  const close = () => { reset(); onClose(); };

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await publicApi.post('/billing-check/request', { identifier: identifier.trim() });
      setMasked(res.data?.masked ?? '****');
      setStep('otp');
    } catch (err) {
      setError(errorMessage(err, 'Gagal mengirim kode OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await publicApi.post('/billing-check/verify', { identifier: identifier.trim(), code });
      setData(res.data);
      setStep('result');
    } catch (err) {
      setError(errorMessage(err, 'Kode OTP salah atau kedaluwarsa.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Cek Tagihan"
      subtitle={
        step === 'identify' ? 'Masukkan nomor pelanggan atau nomor WhatsApp Anda.'
          : step === 'otp' ? `Kami mengirim kode 6 digit ke WhatsApp ${masked}.`
            : undefined
      }
    >
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'identify' && (
        <form onSubmit={requestOtp} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cek-identifier">
              Nomor pelanggan / WhatsApp
            </label>
            <input
              id="cek-identifier"
              className="input dark:border-white/15 dark:bg-slate-800 dark:text-white"
              placeholder="CST000001 atau 081234567890"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoFocus
              required
            />
          </div>
          <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Demi keamanan, data tagihan hanya ditampilkan setelah verifikasi OTP ke nomor WhatsApp terdaftar.
          </p>
          <button type="submit" className="btn-primary w-full" disabled={loading || !identifier.trim()}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            Kirim Kode OTP
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verify} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cek-otp">Kode OTP</label>
            <input
              id="cek-otp"
              className="input text-center text-lg tracking-[0.4em] dark:border-white/15 dark:bg-slate-800 dark:text-white"
              inputMode="numeric"
              maxLength={6}
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading || code.length !== 6}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            Lihat Tagihan
          </button>
          <button
            type="button"
            className="w-full text-sm text-slate-500 hover:underline dark:text-slate-400"
            onClick={() => { setStep('identify'); setCode(''); setError(null); }}
          >
            Ganti nomor
          </button>
        </form>
      )}

      {step === 'result' && data && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Pelanggan</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">{data.customer.fullName}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">ID</dt>
              <dd className="font-medium">{data.customer.customerNo}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Paket</dt>
              <dd className="font-medium">{data.package?.name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Status layanan</dt>
              <dd>
                <span className={`badge ${data.service.status === 'active'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                  {data.service.status === 'active' ? 'AKTIF' : data.service.status.toUpperCase()}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Jatuh tempo</dt>
              <dd className="font-medium">{tanggal(data.service.dueDate)}</dd>
            </div>
          </dl>

          {data.invoices.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Tidak ada tagihan tertunggak. Terima kasih! 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {data.invoices.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10"
                >
                  <div>
                    <p className="font-medium">{i.invoiceNo}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Jatuh tempo {tanggal(i.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{rupiah(i.amount)}</p>
                    <p className="text-xs uppercase text-rose-500">
                      {i.status === 'overdue' ? 'TERLAMBAT' : 'BELUM BAYAR'}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-slate-100 p-3 dark:bg-white/5">
                <span className="text-sm font-medium">Total tagihan</span>
                <span className="text-lg font-bold">{rupiah(data.total)}</span>
              </div>
            </div>
          )}

          <Link to="/portal" className="btn-primary w-full" onClick={close}>
            {data.invoices.length ? 'Bayar di Portal Pelanggan' : 'Masuk Portal Pelanggan'}
          </Link>
        </div>
      )}
    </Modal>
  );
}
