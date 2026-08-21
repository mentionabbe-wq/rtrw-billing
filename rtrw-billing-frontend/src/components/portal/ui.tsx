import { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import clsx from 'clsx';

/** Kartu dasar portal — sudah menyesuaikan mode terang/gelap. */
export function PCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx(
      'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5',
      className,
    )}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
}

export function Loading({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-white/15">
      <Inbox className="mx-auto mb-3 text-slate-400" size={28} />
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
      <AlertCircle className="mx-auto mb-2 text-rose-500" size={24} />
      <p className="text-sm text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <button className="btn-primary mt-4" onClick={onRetry}>Coba lagi</button>
      )}
    </div>
  );
}

const TONE = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  slate: 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  blue: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
} as const;

export type Tone = keyof typeof TONE;

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('badge', TONE[tone])}>{children}</span>;
}

/** Pemetaan status layanan / tagihan ke warna & label Indonesia. */
export function statusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case 'active': return { tone: 'green', label: 'AKTIF' };
    case 'paid': return { tone: 'green', label: 'LUNAS' };
    case 'online': return { tone: 'green', label: 'ONLINE' };
    case 'unpaid': return { tone: 'amber', label: 'BELUM BAYAR' };
    case 'pending': return { tone: 'amber', label: 'MENUNGGU' };
    case 'suspended': return { tone: 'red', label: 'DITANGGUHKAN' };
    case 'isolated': return { tone: 'red', label: 'DIISOLIR' };
    case 'overdue': return { tone: 'red', label: 'TERLAMBAT' };
    case 'los': return { tone: 'red', label: 'GANGGUAN SINYAL' };
    case 'offline': return { tone: 'red', label: 'OFFLINE' };
    case 'settled': return { tone: 'green', label: 'BERHASIL' };
    case 'void': return { tone: 'slate', label: 'DIBATALKAN' };
    default: return { tone: 'slate', label: status?.toUpperCase() || 'TIDAK DIKETAHUI' };
  }
}

export function StatusBadge({ status }: { status: string }) {
  const { tone, label } = statusTone(status);
  return <Badge tone={tone}>{label}</Badge>;
}
