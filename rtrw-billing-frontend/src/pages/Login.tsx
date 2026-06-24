import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export default function Login() {
  const [email, setEmail] = useState('admin@rtrw.local');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [needToken, setNeedToken] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        email, password, token: token || undefined,
      });
      if (data.twoFactorRequired) {
        setNeedToken(true);
        setError('Masukkan kode 2FA dari aplikasi authenticator.');
        return;
      }
      setSession(data);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Wifi size={24} />
          </div>
          <h1 className="text-lg font-semibold">RT/RW Net Billing</h1>
          <p className="text-sm text-slate-500">Masuk ke dashboard admin</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {needToken && (
            <div>
              <label className="mb-1 block text-sm font-medium">Kode 2FA</label>
              <input
                className="input tracking-widest"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
          )}
          {error && <p className={`text-sm ${needToken ? 'text-slate-500' : 'text-red-600'}`}>{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" size={16} />}
            Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
