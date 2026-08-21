import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Lock, MessageCircle, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { errorMessage, publicApi } from '@/lib/publicApi';
import { portalApi } from '@/lib/portalApi';
import { usePortalAuth } from '@/store/portalAuth';
import { useTheme } from '@/lib/theme';

type Mode = 'password' | 'otp' | 'forgot';

/** Halaman masuk portal pelanggan: kata sandi, OTP WhatsApp, atau lupa sandi (§4). */
export default function PortalLogin() {
  const token = usePortalAuth((s) => s.token);
  const setSession = usePortalAuth((s) => s.setSession);
  const navigate = useNavigate();
  useTheme(); // ikut preferensi tema pengguna

  const [mode, setMode] = useState<Mode>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const { data: branding } = useQuery({
    queryKey: ['public-landing-brand'],
    queryFn: async () => (await publicApi.get('/landing')).data,
    staleTime: 5 * 60_000,
  });

  if (token) return <Navigate to="/portal" replace />;

  const finish = (res: any) => {
    setSession({ token: res.token, customer: res.customer });
    navigate('/portal', { replace: true });
  };

  const run = async (fn: () => Promise<void>) => {
    setLoading(true); setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, 'Gagal memproses permintaan.'));
    } finally {
      setLoading(false);
    }
  };

  const loginPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await portalApi.post('/auth/login', { identifier: identifier.trim(), password });
      finish(res.data);
    });
  };

  const sendOtp = (purpose: 'login' | 'forgot') => (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await portalApi.post(purpose === 'login' ? '/auth/otp/request' : '/auth/forgot', {
        phone: phone.trim(),
      });
      setOtpSent(true);
      setInfo(`Kode OTP dikirim ke WhatsApp ${res.data?.masked ?? ''}. Berlaku 5 menit.`);
    });
  };

  const verifyOtp = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await portalApi.post('/auth/otp/verify', { phone: phone.trim(), code });
      finish(res.data);
    });
  };

  const resetPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await portalApi.post('/auth/reset', { phone: phone.trim(), code, newPassword });
      finish(res.data);
    });
  };

  const switchMode = (m: Mode) => {
    setMode(m); setError(null); setInfo(null); setOtpSent(false); setCode('');
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';
  const company = branding?.company;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel kiri — branding */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-sky-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2 text-white/90 hover:text-white">
          <ArrowLeft size={18} /> Kembali ke beranda
        </Link>
        <div>
          <Wifi size={40} className="mb-6 text-amber-300" />
          <h1 className="text-3xl font-bold leading-tight">
            Semua kebutuhan internet Anda dalam satu tempat
          </h1>
          <p className="mt-3 max-w-md text-white/80">
            Cek tagihan, bayar, atur WiFi, pantau koneksi, dan laporkan gangguan — kapan saja.
          </p>
        </div>
        <p className="text-sm text-white/70">{company?.name ?? 'RT/RW Net'}</p>
      </div>

      {/* Panel kanan — formulir */}
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:underline lg:hidden dark:text-slate-400">
            <ArrowLeft size={16} /> Beranda
          </Link>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Portal Pelanggan</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'forgot' ? 'Atur ulang kata sandi lewat OTP WhatsApp.' : 'Masuk untuk mengelola layanan internet Anda.'}
          </p>

          {mode !== 'forgot' && (
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {([['password', 'Kata Sandi', Lock], ['otp', 'OTP WhatsApp', MessageCircle]] as const).map(
                ([m, label, Icon]) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                      mode === m
                        ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                    )}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ),
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && !error && (
            <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              {info}
            </p>
          )}

          {mode === 'password' && (
            <form onSubmit={loginPassword} className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Nomor pelanggan atau email</label>
                <input className={inputCls} value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="CST000001" autoComplete="username" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kata sandi</label>
                <input className={inputCls} type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              <button className="btn-primary w-full" disabled={loading}>
                {loading && <Loader2 size={16} className="animate-spin" />} Masuk
              </button>
              <button type="button" onClick={() => switchMode('forgot')}
                className="w-full text-sm text-slate-500 hover:underline dark:text-slate-400">
                Lupa kata sandi?
              </button>
            </form>
          )}

          {mode === 'otp' && (
            <form onSubmit={otpSent ? verifyOtp : sendOtp('login')} className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Nomor WhatsApp</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="081234567890" inputMode="tel" disabled={otpSent} required />
              </div>
              {otpSent && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Kode OTP</label>
                  <input
                    className={`${inputCls} text-center text-lg tracking-[0.4em]`}
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric" maxLength={6} placeholder="······" autoFocus required
                  />
                </div>
              )}
              <button className="btn-primary w-full" disabled={loading || (otpSent && code.length !== 6)}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {otpSent ? 'Masuk' : 'Kirim Kode OTP'}
              </button>
              {otpSent && (
                <button type="button" onClick={() => { setOtpSent(false); setCode(''); setInfo(null); }}
                  className="w-full text-sm text-slate-500 hover:underline dark:text-slate-400">
                  Ganti nomor
                </button>
              )}
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={otpSent ? resetPassword : sendOtp('forgot')} className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Nomor WhatsApp terdaftar</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="081234567890" inputMode="tel" disabled={otpSent} required />
              </div>
              {otpSent && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Kode OTP</label>
                    <input className={`${inputCls} text-center text-lg tracking-[0.4em]`}
                      value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric" maxLength={6} placeholder="······" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Kata sandi baru</label>
                    <input className={inputCls} type="password" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Minimal 8 karakter, memuat huruf dan angka.
                    </p>
                  </div>
                </>
              )}
              <button className="btn-primary w-full" disabled={loading}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {otpSent ? 'Simpan & Masuk' : 'Kirim Kode OTP'}
              </button>
              <button type="button" onClick={() => switchMode('password')}
                className="w-full text-sm text-slate-500 hover:underline dark:text-slate-400">
                Kembali ke halaman masuk
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Belum berlangganan?{' '}
            <Link to="/" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
              Daftar internet
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
