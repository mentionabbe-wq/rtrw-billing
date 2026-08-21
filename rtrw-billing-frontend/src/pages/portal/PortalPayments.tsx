import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { rupiah, waktu } from '@/lib/format';
import { EmptyState, ErrorState, Loading, PCard, PageTitle, StatusBadge } from '@/components/portal/ui';

interface PaymentRow {
  id: string;
  invoiceNo: string | null;
  amount: number;
  method: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

/** Riwayat pembayaran pelanggan. */
export default function PortalPayments() {
  const { data, isLoading, isError, error, refetch } = useQuery<PaymentRow[]>({
    queryKey: ['portal-payments'],
    queryFn: async () => (await portalApi.get('/me/payments')).data,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat riwayat pembayaran.')} onRetry={() => refetch()} />;
  }

  return (
    <>
      <PageTitle title="Pembayaran" subtitle="Riwayat pembayaran yang tercatat di sistem." />
      {data.length === 0 ? (
        <EmptyState
          title="Belum ada pembayaran"
          text="Pembayaran yang sudah diverifikasi akan tampil di sini."
        />
      ) : (
        <div className="space-y-3">
          {data.map((p) => (
            <PCard key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {p.invoiceNo ?? 'Pembayaran'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {p.method ? `Metode: ${p.method}` : 'Metode tidak tercatat'} ·{' '}
                    {waktu(p.paidAt ?? p.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{rupiah(p.amount)}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            </PCard>
          ))}
        </div>
      )}
    </>
  );
}
