import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HardDrive, Signal, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { waktu } from '@/lib/format';
import { EmptyState, ErrorState, Loading, PCard, PageTitle, StatusBadge } from '@/components/portal/ui';

interface DeviceData {
  device: {
    type: string;
    serialNumber: string | null;
    status: string;
    signalLabel: 'normal' | 'warning' | 'critical' | 'unknown';
    updatedAt: string | null;
  } | null;
}

const SIGNAL = {
  normal: { label: 'Normal', cls: 'text-emerald-600 dark:text-emerald-400' },
  warning: { label: 'Perlu dicek', cls: 'text-amber-600 dark:text-amber-400' },
  critical: { label: 'Lemah', cls: 'text-rose-600 dark:text-rose-400' },
  unknown: { label: 'Tidak diketahui', cls: 'text-slate-500 dark:text-slate-400' },
} as const;

/** "Perangkat" (§32) — status ONU tanpa detail konfigurasi OLT. */
export default function PortalDevice() {
  const { data, isLoading, isError, error, refetch } = useQuery<DeviceData>({
    queryKey: ['portal-device'],
    queryFn: async () => (await portalApi.get('/me/device')).data,
    refetchInterval: 120_000,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat data perangkat.')} onRetry={() => refetch()} />;
  }

  if (!data.device) {
    return (
      <>
        <PageTitle title="Perangkat Internet" />
        <EmptyState
          title="Data perangkat belum tersedia"
          text="Petugas belum mendaftarkan ONU/ONT Anda ke sistem monitoring."
        />
      </>
    );
  }

  const d = data.device;
  const signal = SIGNAL[d.signalLabel];

  return (
    <>
      <PageTitle title="Perangkat Internet" subtitle="Status perangkat yang terpasang di rumah Anda." />

      <div className="grid gap-4 lg:grid-cols-3">
        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Perangkat</p>
            <HardDrive size={18} className="text-brand-600" />
          </div>
          <p className="mt-2 text-lg font-bold uppercase text-slate-900 dark:text-white">{d.type}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            SN: {d.serialNumber ?? 'tidak tercatat'}
          </p>
        </PCard>

        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Status</p>
            <Wifi size={18} className="text-brand-600" />
          </div>
          <div className="mt-2"><StatusBadge status={d.status} /></div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Diperbarui {waktu(d.updatedAt)}
          </p>
        </PCard>

        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Kualitas sinyal</p>
            <Signal size={18} className="text-brand-600" />
          </div>
          <p className={clsx('mt-2 text-lg font-bold', signal.cls)}>{signal.label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {d.signalLabel === 'critical'
              ? 'Sinyal fiber lemah — sebaiknya laporkan ke teknisi.'
              : 'Nilai teknis lengkap tersedia di panel teknisi.'}
          </p>
        </PCard>
      </div>

      <PCard className="mt-4">
        <p className="font-semibold text-slate-900 dark:text-white">Aksi</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/portal/wifi" className="btn-primary">
            <Wifi size={15} /> Pengaturan WiFi
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Tombol restart perangkat akan tersedia pada tahap berikutnya, mengikuti kemampuan
          perangkat yang terpasang.
        </p>
      </PCard>
    </>
  );
}
