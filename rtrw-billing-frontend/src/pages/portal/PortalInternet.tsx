import { useQuery } from '@tanstack/react-query';
import { RefreshCw, WifiOff } from 'lucide-react';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { rupiah, tanggal, uptimeLabel } from '@/lib/format';
import { EmptyState, ErrorState, Loading, PCard, PageTitle, StatusBadge } from '@/components/portal/ui';

interface InternetData {
  subscription: {
    status: string;
    dueDate: string | null;
    connType: string;
    pppoeUser: string | null;
    routerName: string | null;
    package: {
      name: string; price: number; speedDownMbps: number | null; speedUpMbps: number | null; rateLimit: string;
    } | null;
  } | null;
  live: { online: boolean; ip: string | null; uptime: string | null } | null;
  liveError: string | null;
}

/** Menu "Internet Saya" (§7) — data teknis yang boleh dilihat pelanggan. */
export default function PortalInternet() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<InternetData>({
    queryKey: ['portal-internet'],
    queryFn: async () => (await portalApi.get('/me/internet')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat data koneksi.')} onRetry={() => refetch()} />;
  }

  if (!data.subscription) {
    return (
      <>
        <PageTitle title="Internet Saya" />
        <EmptyState
          title="Belum ada langganan aktif"
          text="Data langganan Anda belum dibuat petugas. Hubungi admin bila layanan sudah terpasang."
        />
      </>
    );
  }

  const s = data.subscription;
  const rows: { label: string; value: string; badge?: boolean }[] = [
    { label: 'Paket', value: s.package?.name ?? '-' },
    { label: 'Kecepatan unduh', value: s.package?.speedDownMbps ? `${s.package.speedDownMbps} Mbps` : '-' },
    { label: 'Kecepatan unggah', value: s.package?.speedUpMbps ? `${s.package.speedUpMbps} Mbps` : '-' },
    { label: 'Biaya bulanan', value: s.package ? rupiah(s.package.price) : '-' },
    { label: 'Router', value: s.routerName ?? '-' },
    { label: 'Tipe koneksi', value: s.connType?.toUpperCase() ?? '-' },
    { label: 'Akun PPPoE', value: s.pppoeUser ?? '-' },
    { label: 'Alamat IP', value: data.live?.ip ?? '-' },
    { label: 'Lama tersambung', value: uptimeLabel(data.live?.uptime) },
    { label: 'Jatuh tempo', value: tanggal(s.dueDate) },
  ];

  return (
    <>
      <PageTitle title="Internet Saya" subtitle="Detail layanan dan status koneksi Anda." />

      <div className="grid gap-4 lg:grid-cols-3">
        <PCard className="lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Status koneksi</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
              title="Muat ulang"
            >
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : undefined} />
            </button>
          </div>

          {data.liveError ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <WifiOff size={16} className="mt-0.5 shrink-0" />
              <span>{data.liveError}</span>
            </div>
          ) : (
            <div className="mt-3">
              <StatusBadge status={data.live?.online ? 'online' : 'offline'} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {data.live?.online
                  ? `Tersambung ${uptimeLabel(data.live.uptime)}`
                  : 'Perangkat Anda sedang tidak tersambung ke jaringan.'}
              </p>
            </div>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
            <p className="text-sm text-slate-500 dark:text-slate-400">Status langganan</p>
            <div className="mt-1"><StatusBadge status={s.status} /></div>
          </div>
        </PCard>

        <PCard className="lg:col-span-2">
          <p className="font-semibold text-slate-900 dark:text-white">Detail layanan</p>
          <dl className="mt-3 divide-y divide-slate-100 text-sm dark:divide-white/5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">{r.label}</dt>
                <dd className="text-right font-medium text-slate-900 dark:text-white">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Data teknis (PPPoE, IP, router) hanya dapat diubah oleh petugas.
          </p>
        </PCard>
      </div>
    </>
  );
}
