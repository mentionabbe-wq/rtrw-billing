import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { waktu } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { usePortalAuth } from '@/store/portalAuth';
import { ErrorState, Loading, PCard, PageTitle } from '@/components/portal/ui';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** "Pengaturan" — kata sandi, sesi perangkat, dan tema tampilan (§4, §38). */
export default function PortalSettings() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clear = usePortalAuth((s) => s.clear);
  const { mode, toggle } = useTheme();

  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });
  const [ok, setOk] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const sessions = useQuery<SessionRow[]>({
    queryKey: ['portal-sessions'],
    queryFn: async () => (await portalApi.get('/auth/sessions')).data,
  });

  const changePassword = useMutation({
    mutationFn: async (body: { oldPassword?: string; newPassword: string }) =>
      (await portalApi.post('/me/password', body)).data,
    onSuccess: () => {
      setOk('Kata sandi berhasil diubah.');
      setPw({ old: '', next: '', confirm: '' });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await portalApi.delete(`/auth/sessions/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-sessions'] }),
  });

  const logoutAll = useMutation({
    mutationFn: async () => (await portalApi.post('/auth/logout-all')).data,
    onSuccess: () => {
      setOk('Semua perangkat lain sudah dikeluarkan.');
      qc.invalidateQueries({ queryKey: ['portal-sessions'] });
    },
  });

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    setOk(null); setLocalError(null);
    if (pw.next.length < 8) { setLocalError('Kata sandi baru minimal 8 karakter.'); return; }
    if (!/[A-Za-z]/.test(pw.next) || !/\d/.test(pw.next)) {
      setLocalError('Kata sandi harus memuat huruf dan angka.');
      return;
    }
    if (pw.next !== pw.confirm) { setLocalError('Konfirmasi kata sandi tidak sama.'); return; }
    changePassword.mutate({ oldPassword: pw.old || undefined, newPassword: pw.next });
  };

  const logoutThis = async () => {
    try {
      await portalApi.post('/auth/logout');
    } catch {
      // sesi mungkin sudah tidak berlaku — tetap bersihkan sisi klien
    }
    clear();
    navigate('/portal/masuk', { replace: true });
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';

  return (
    <>
      <PageTitle title="Pengaturan" subtitle="Keamanan akun dan tampilan portal." />

      {ok && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={18} /> {ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PCard>
          <p className="font-semibold text-slate-900 dark:text-white">Ubah kata sandi</p>
          <form onSubmit={submitPassword} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Kata sandi saat ini</label>
              <input className={inputCls} type="password" value={pw.old}
                onChange={(e) => setPw((v) => ({ ...v, old: e.target.value }))}
                placeholder="Kosongkan bila belum pernah menyetel" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Kata sandi baru</label>
              <input className={inputCls} type="password" value={pw.next}
                onChange={(e) => setPw((v) => ({ ...v, next: e.target.value }))} minLength={8} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Konfirmasi kata sandi baru</label>
              <input className={inputCls} type="password" value={pw.confirm}
                onChange={(e) => setPw((v) => ({ ...v, confirm: e.target.value }))} minLength={8} required />
            </div>
            {(localError || changePassword.isError) && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {localError ?? errorMessage(changePassword.error, 'Gagal mengubah kata sandi.')}
              </p>
            )}
            <button className="btn-primary" disabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 size={16} className="animate-spin" />} Simpan
            </button>
          </form>
        </PCard>

        <PCard>
          <p className="font-semibold text-slate-900 dark:text-white">Tampilan</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pilihan tema tersimpan di perangkat ini.
          </p>
          <button
            onClick={toggle}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            {mode === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            <span className="flex-1 text-sm font-medium">
              Mode {mode === 'dark' ? 'gelap' : 'terang'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">ketuk untuk ganti</span>
          </button>

          <button
            onClick={logoutThis}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-rose-600 transition hover:bg-rose-50 dark:border-white/10 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            <LogOut size={18} />
            <span className="flex-1 text-sm font-medium">Keluar dari perangkat ini</span>
          </button>
        </PCard>
      </div>

      <PCard className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Perangkat yang masuk</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keluarkan perangkat yang tidak Anda kenali.
            </p>
          </div>
          <button
            className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
            onClick={() => logoutAll.mutate()}
            disabled={logoutAll.isPending}
          >
            {logoutAll.isPending && <Loader2 size={15} className="animate-spin" />}
            Keluar dari semua perangkat lain
          </button>
        </div>

        <div className="mt-4">
          {sessions.isLoading ? (
            <Loading label="Memuat sesi…" />
          ) : sessions.isError ? (
            <ErrorState
              message={errorMessage(sessions.error, 'Gagal memuat daftar sesi.')}
              onRetry={() => sessions.refetch()}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <Monitor size={18} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className={clsx('truncate text-sm font-medium',
                      s.current ? 'text-brand-700 dark:text-brand-300' : 'text-slate-800 dark:text-slate-200')}>
                      {s.userAgent?.slice(0, 60) ?? 'Perangkat tidak dikenal'}
                      {s.current && ' · perangkat ini'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {s.ip ?? '-'} · aktif {waktu(s.lastSeenAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <button
                      className="shrink-0 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                      onClick={() => revoke.mutate(s.id)}
                    >
                      Keluarkan
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PCard>
    </>
  );
}
