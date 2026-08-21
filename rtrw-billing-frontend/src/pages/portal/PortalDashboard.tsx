import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, CalendarClock, Gauge, HardDrive, Receipt, Wifi,
} from 'lucide-react';
import clsx from 'clsx';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { rupiah, tanggal } from '@/lib/format';
import { usePortalAuth } from '@/store/portalAuth';
import { ErrorState, Loading, PCard, StatusBadge } from '@/components/portal/ui';

interface Dashboard {
  customer: { fullName: string; customerNo: string; status: string };
  subscription: {
    status: string;
    dueDate: string | null;
    package: { name: string; price: number; speedDownMbps: number | null; speedUpMbps: number | null } | null;
    routerName: string | null;
  } | null;
  billing: {
    outstandingTotal: number;
    unpaidCount: number;
    nextInvoice: { id: string; invoiceNo: string; amount: number; dueDate: string; status: string } | null;
  };
  service: { status: string; daysRemaining: number | null; dueDate: string | null };
  device: { type: string; status: string; signalLabel: string } | null;
  notifications: { unread: number };
  announcement: { status: string; note: string | null } | null;
}

export default function PortalDashboard() {
  const customer = usePortalAuth((s) => s.customer);
  const { data, isLoading, isError, error, refetch } = useQuery<Dashboard>({
    queryKey: ['portal-dashboard'],
    queryFn: async () => (await portalApi.get('/me')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat dasbor.')} onRetry={() => refetch()} />;
  }

  const firstName = (data.customer.fullName ?? customer?.fullName ?? '').split(' ')[0];
  const days = data.service.daysRemaining;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
        Selamat datang, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Ringkasan layanan internet Anda hari ini.
      </p>

      {data.announcement && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              {data.announcement.status === 'outage' ? 'Gangguan jaringan' : 'Gangguan sebagian'}
            </p>
            <p>{data.announcement.note ?? 'Tim teknis sedang menangani.'}</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Status Internet</p>
            <Wifi size={18} className="text-brand-600" />
          </div>
          <div className="mt-2">
            <StatusBadge status={data.service.status} />
          </div>
          <Link to="/portal/internet" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
            Lihat detail <ArrowRight size={12} />
          </Link>
        </PCard>

        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Paket</p>
            <Gauge size={18} className="text-brand-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
            {data.subscription?.package?.name ?? '-'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.subscription?.package?.speedDownMbps
              ? `${data.subscription.package.speedDownMbps} Mbps`
              : 'Kecepatan sesuai paket'}
          </p>
        </PCard>

        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Tagihan</p>
            <Receipt size={18} className="text-brand-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
            {rupiah(data.billing.outstandingTotal)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.billing.unpaidCount
              ? `${data.billing.unpaidCount} tagihan belum dibayar`
              : 'Tidak ada tunggakan'}
          </p>
        </PCard>

        <PCard>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Masa Aktif</p>
            <CalendarClock size={18} className="text-brand-600" />
          </div>
          <p className={clsx(
            'mt-2 text-lg font-bold',
            days != null && days < 0 ? 'text-rose-600 dark:text-rose-400'
              : days != null && days <= 3 ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white',
          )}>
            {days == null ? '-' : days < 0 ? `Lewat ${Math.abs(days)} hari` : `${days} hari`}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Jatuh tempo {tanggal(data.service.dueDate)}
          </p>
        </PCard>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <PCard className="lg:col-span-2">
          <p className="font-semibold text-slate-900 dark:text-white">Tagihan terdekat</p>
          {data.billing.nextInvoice ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{data.billing.nextInvoice.invoiceNo}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Jatuh tempo {tanggal(data.billing.nextInvoice.dueDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {rupiah(data.billing.nextInvoice.amount)}
                </p>
                <StatusBadge status={data.billing.nextInvoice.status} />
              </div>
              <Link to="/portal/tagihan" className="btn-primary w-full sm:w-auto">Lihat Tagihan</Link>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Semua tagihan Anda sudah lunas. Terima kasih! 🎉
            </p>
          )}
        </PCard>

        <PCard>
          <p className="font-semibold text-slate-900 dark:text-white">Perangkat Internet</p>
          {data.device ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-slate-400" />
                <span className="uppercase">{data.device.type}</span>
                <span className="ml-auto"><StatusBadge status={data.device.status} /></span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Kualitas sinyal</span>
                <span className={clsx(
                  'font-medium',
                  data.device.signalLabel === 'normal' && 'text-emerald-600 dark:text-emerald-400',
                  data.device.signalLabel === 'warning' && 'text-amber-600 dark:text-amber-400',
                  data.device.signalLabel === 'critical' && 'text-rose-600 dark:text-rose-400',
                )}>
                  {data.device.signalLabel === 'normal' ? 'Normal'
                    : data.device.signalLabel === 'warning' ? 'Perlu dicek'
                      : data.device.signalLabel === 'critical' ? 'Lemah'
                        : 'Tidak diketahui'}
                </span>
              </div>
              <Link to="/portal/perangkat" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                Detail perangkat <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Data perangkat belum tersedia. Hubungi teknisi bila internet bermasalah.
            </p>
          )}
        </PCard>
      </div>
    </div>
  );
}
