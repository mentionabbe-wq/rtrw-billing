import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, KeyRound, Loader2, PenLine, Wifi } from 'lucide-react';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { Modal } from '@/components/public/Modal';
import { ErrorState, Loading, PCard, PageTitle, StatusBadge } from '@/components/portal/ui';

interface WifiInfo {
  supported: boolean;
  ssid: string | null;
  online: boolean;
  message: string | null;
}

interface DashboardFeatures {
  features: Record<string, boolean>;
}

/** "WiFi Saya" (§8–§10) — ganti nama & kata sandi WiFi sendiri lewat TR-069. */
export default function PortalWifi() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'ssid' | 'password' | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const wifi = useQuery<WifiInfo>({
    queryKey: ['portal-wifi'],
    queryFn: async () => (await portalApi.get('/me/wifi')).data,
  });

  const dash = useQuery<DashboardFeatures>({
    queryKey: ['portal-features'],
    queryFn: async () => (await portalApi.get('/me')).data,
    staleTime: 5 * 60_000,
  });

  const change = useMutation({
    mutationFn: async (body: { ssid?: string; password?: string }) =>
      (await portalApi.post('/me/wifi', body)).data,
    onSuccess: (res) => {
      setOkMessage(res?.message ?? 'Perubahan berhasil diterapkan.');
      setDialog(null);
      qc.invalidateQueries({ queryKey: ['portal-wifi'] });
    },
  });

  if (wifi.isLoading) return <Loading />;
  if (wifi.isError || !wifi.data) {
    return (
      <ErrorState
        message={errorMessage(wifi.error, 'Gagal memuat data WiFi.')}
        onRetry={() => wifi.refetch()}
      />
    );
  }

  const features = dash.data?.features ?? {};
  const info = wifi.data;

  return (
    <>
      <PageTitle title="WiFi Saya" subtitle="Atur nama dan kata sandi WiFi rumah Anda." />

      {okMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{okMessage}</span>
        </div>
      )}

      {!info.supported ? (
        <PCard>
          <div className="flex items-start gap-3">
            <Info size={20} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                Pengaturan WiFi otomatis belum tersedia
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{info.message}</p>
            </div>
          </div>
        </PCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <PCard className="lg:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">Nama WiFi (SSID)</p>
              <Wifi size={18} className="text-brand-600" />
            </div>
            <p className="mt-2 truncate text-lg font-bold text-slate-900 dark:text-white">
              {info.ssid ?? '(tidak terbaca)'}
            </p>
            <div className="mt-2"><StatusBadge status={info.online ? 'online' : 'offline'} /></div>
          </PCard>

          <PCard className="lg:col-span-2">
            <p className="font-semibold text-slate-900 dark:text-white">Aksi cepat</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-primary"
                onClick={() => { setOkMessage(null); change.reset(); setDialog('ssid'); }}
                disabled={features.wifiName === false}
              >
                <PenLine size={15} /> Ubah Nama WiFi
              </button>
              <button
                className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                onClick={() => { setOkMessage(null); change.reset(); setDialog('password'); }}
                disabled={features.wifiPassword === false}
              >
                <KeyRound size={15} /> Ubah Kata Sandi WiFi
              </button>
            </div>
            {(features.wifiName === false || features.wifiPassword === false) && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Sebagian pengaturan dinonaktifkan oleh admin.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Guest WiFi, sembunyikan SSID, dan restart perangkat menyusul pada tahap berikutnya
              sesuai kemampuan perangkat Anda.
            </p>
          </PCard>
        </div>
      )}

      <ChangeWifiDialog
        mode={dialog}
        onClose={() => setDialog(null)}
        onSubmit={(body) => change.mutate(body)}
        loading={change.isPending}
        error={change.isError ? errorMessage(change.error, 'Perubahan belum berhasil diterapkan.') : null}
      />
    </>
  );
}

function ChangeWifiDialog({
  mode, onClose, onSubmit, loading, error,
}: {
  mode: 'ssid' | 'password' | null;
  onClose: () => void;
  onSubmit: (body: { ssid?: string; password?: string }) => void;
  loading: boolean;
  error: string | null;
}) {
  const [ssid, setSsid] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (mode === 'ssid') {
      const v = ssid.trim();
      if (v.length < 2 || v.length > 32) {
        setLocalError('Nama WiFi harus 2–32 karakter.');
        return;
      }
      onSubmit({ ssid: v });
      return;
    }
    if (pw.length < 8 || pw.length > 63) {
      setLocalError('Kata sandi WiFi harus 8–63 karakter.');
      return;
    }
    if (pw !== pw2) {
      setLocalError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    onSubmit({ password: pw });
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === 'ssid' ? 'Ubah Nama WiFi' : 'Ubah Kata Sandi WiFi'}
      subtitle={
        mode === 'password'
          ? 'Perangkat yang sedang terhubung mungkin akan terputus.'
          : 'Nama baru akan terlihat pada daftar WiFi di perangkat Anda.'
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {mode === 'ssid' ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Nama WiFi baru</label>
            <input className={inputCls} value={ssid} onChange={(e) => setSsid(e.target.value)}
              maxLength={32} placeholder="RumahBudi" autoFocus required />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Kata sandi WiFi baru</label>
              <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                minLength={8} maxLength={63} autoFocus required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Konfirmasi kata sandi</label>
              <input className={inputCls} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                minLength={8} maxLength={63} required />
            </div>
          </>
        )}

        {(localError || error) && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{localError ?? error}</p>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading && <Loader2 size={16} className="animate-spin" />} Simpan Perubahan
        </button>
      </form>
    </Modal>
  );
}
