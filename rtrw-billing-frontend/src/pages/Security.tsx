import { FormEvent, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export default function Security() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const enabled = !!user?.totpEnabled;

  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startSetup() {
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setSetup(data);
    } catch {
      setError('Gagal memulai setup 2FA.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const token = (new FormData(e.currentTarget).get('token') as string) || '';
    try {
      await api.post('/auth/2fa/enable', { token });
      setUser({ totpEnabled: true });
      setSetup(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Kode tidak valid.');
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const token = (new FormData(e.currentTarget).get('token') as string) || '';
    try {
      await api.post('/auth/2fa/disable', { token });
      setUser({ totpEnabled: false });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Kode tidak valid.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-xl font-semibold">Keamanan Akun</h1>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-3">
          {enabled
            ? <ShieldCheck className="text-emerald-600" />
            : <ShieldOff className="text-slate-400" />}
          <div>
            <p className="font-medium">Two-Factor Authentication (TOTP)</p>
            <p className="text-sm text-slate-500">
              Status: {enabled ? <span className="font-medium text-emerald-700">Aktif</span> : 'Belum aktif'}
            </p>
          </div>
        </div>

        {/* Belum aktif & belum setup */}
        {!enabled && !setup && (
          <button className="btn-primary" disabled={busy} onClick={startSetup}>
            {busy && <Loader2 className="animate-spin" size={16} />} Aktifkan 2FA
          </button>
        )}

        {/* Sedang setup: tampilkan QR + konfirmasi token */}
        {!enabled && setup && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Pindai QR ini dengan Google Authenticator / Authy, lalu masukkan kode 6 digit untuk mengonfirmasi.
            </p>
            <div className="flex justify-center rounded-lg border border-slate-200 p-4">
              <QRCodeSVG value={setup.otpauthUrl} size={168} />
            </div>
            <p className="break-all text-center text-xs text-slate-400">
              Kunci manual: <span className="font-mono">{setup.secret}</span>
            </p>
            <form onSubmit={confirmEnable} className="space-y-3">
              <input
                name="token" inputMode="numeric" maxLength={6}
                className="input tracking-widest text-center" placeholder="123456" autoFocus
              />
              <button className="btn-primary w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" size={16} />} Konfirmasi & Aktifkan
              </button>
            </form>
          </div>
        )}

        {/* Sudah aktif: nonaktifkan dengan token */}
        {enabled && (
          <form onSubmit={disable} className="space-y-3">
            <p className="text-sm text-slate-600">Masukkan kode 2FA saat ini untuk menonaktifkan.</p>
            <input
              name="token" inputMode="numeric" maxLength={6}
              className="input tracking-widest text-center" placeholder="123456"
            />
            <button className="btn bg-rose-600 text-white hover:bg-rose-700" disabled={busy}>
              {busy && <Loader2 className="animate-spin" size={16} />} Nonaktifkan 2FA
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
