import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Lebar maksimum panel. */
  size?: 'sm' | 'md' | 'lg';
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' } as const;

export function Modal({ open, title, subtitle, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${WIDTH[size]} max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:text-slate-100`}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
          aria-label="Tutup"
        >
          <X size={18} />
        </button>
        <h2 className="pr-8 text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
