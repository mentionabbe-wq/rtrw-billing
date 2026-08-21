import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { waktu } from '@/lib/format';
import { EmptyState, ErrorState, Loading, PCard, PageTitle } from '@/components/portal/ui';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICON_TONE: Record<string, string> = {
  invoice: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
  payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  isolate: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  reactivate: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  maintenance: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  outage: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  security: 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200',
};

export default function PortalNotifications() {
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<Notif[]>({
    queryKey: ['portal-notifications'],
    queryFn: async () => (await portalApi.get('/me/notifications')).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['portal-notifications'] });
    qc.invalidateQueries({ queryKey: ['portal-unread'] });
  };

  const readOne = useMutation({
    mutationFn: async (id: string) => (await portalApi.post(`/me/notifications/${id}/read`)).data,
    onSuccess: invalidate,
  });

  const readAll = useMutation({
    mutationFn: async () => (await portalApi.post('/me/notifications/read-all')).data,
    onSuccess: invalidate,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat notifikasi.')} onRetry={() => refetch()} />;
  }

  const unread = data.filter((n) => !n.readAt).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PageTitle
          title="Notifikasi"
          subtitle={unread ? `${unread} notifikasi belum dibaca.` : 'Semua notifikasi sudah dibaca.'}
        />
        {unread > 0 && (
          <button className="btn-ghost dark:text-slate-300 dark:hover:bg-white/10"
            onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            <CheckCheck size={16} /> Tandai semua dibaca
          </button>
        )}
      </div>

      {data.length === 0 ? (
        <EmptyState title="Belum ada notifikasi" text="Info tagihan, pembayaran, dan gangguan akan muncul di sini." />
      ) : (
        <div className="space-y-3">
          {data.map((n) => (
            <PCard key={n.id} className={clsx(!n.readAt && 'border-brand-300 dark:border-brand-500/40')}>
              <div className="flex items-start gap-3">
                <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                  ICON_TONE[n.type] ?? ICON_TONE.security)}>
                  <Bell size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-white">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{waktu(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <button
                    className="shrink-0 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                    onClick={() => readOne.mutate(n.id)}
                  >
                    Tandai dibaca
                  </button>
                )}
              </div>
            </PCard>
          ))}
        </div>
      )}
    </>
  );
}
