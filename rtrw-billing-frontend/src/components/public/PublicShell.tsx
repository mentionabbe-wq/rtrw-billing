import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Moon, Sun, Wifi, X } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/lib/theme';

export interface LandingCompany {
  name: string;
  tagline: string;
  logoUrl: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
  officeAddress: string | null;
  footerText: string | null;
}

interface Props {
  company?: LandingCompany;
  children: ReactNode;
  /** Tautan bagian halaman (anchor) — kosongkan pada halaman non-landing. */
  sections?: { id: string; label: string }[];
}

export function waLink(number: string | null | undefined, text: string): string {
  const digits = (number ?? '').replace(/\D/g, '');
  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : '#';
}

/** Kerangka halaman publik: navigasi, mode gelap, footer, tombol WhatsApp. */
export function PublicShell({ company, children, sections = [] }: Props) {
  const { mode, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const name = company?.name ?? 'RT/RW Net';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-sky-400 text-white">
                <Wifi size={18} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900 dark:text-white">{name}</span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {company?.tagline ?? 'Layanan Internet Rumahan'}
              </span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {s.label}
              </a>
            ))}
            <button
              onClick={toggle}
              className="ml-1 rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              title={mode === 'dark' ? 'Mode terang' : 'Mode gelap'}
              aria-label="Ubah tema"
            >
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              to="/portal"
              className="ml-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Login Pelanggan
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:hidden">
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-slate-600 dark:text-slate-300"
              aria-label="Ubah tema"
            >
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg p-2 text-slate-600 dark:text-slate-300"
              aria-label="Menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-white/10 dark:bg-slate-950">
            <div className="flex flex-col gap-1">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {s.label}
                </a>
              ))}
              <Link
                to="/portal"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Login Pelanggan
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-20 border-t border-slate-200 bg-white/70 py-10 dark:border-white/10 dark:bg-slate-950/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{name}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {company?.footerText ?? company?.tagline ?? 'Layanan internet untuk warga.'}
            </p>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="mb-2 font-semibold text-slate-900 dark:text-white">Kontak</p>
            {company?.whatsappNumber && <p>WhatsApp: {company.whatsappNumber}</p>}
            {company?.contactEmail && <p>Email: {company.contactEmail}</p>}
            {company?.officeAddress && <p className="mt-1">{company.officeAddress}</p>}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="mb-2 font-semibold text-slate-900 dark:text-white">Tautan</p>
            <Link to="/portal" className="block hover:underline">Portal Pelanggan</Link>
            <a href="#status" className="block hover:underline">Status Jaringan</a>
            <a href="#faq" className="block hover:underline">FAQ</a>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-500">
          © {new Date().getFullYear()} {name}
        </p>
      </footer>

      {company?.whatsappNumber && (
        <a
          href={waLink(company.whatsappNumber, 'Halo, saya ingin bertanya tentang layanan internet.')}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            'fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3',
            'text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600',
          )}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.9 9.9 0 0 0 4.88 1.27h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.11-.96-.29-1.65-.59-2.9-1.25-4.8-4.17-4.95-4.37-.14-.2-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36l.56.01c.18 0 .42-.07.66.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.2-.14.31-.28.48l-.42.49c-.14.14-.28.29-.12.57.16.29.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.27.14.43.12.59-.07.16-.2.68-.79.86-1.07.18-.28.36-.23.61-.14.24.1 1.55.73 1.82.86.27.14.45.2.51.31.07.11.07.64-.17 1.32Z" />
          </svg>
          <span className="hidden sm:inline">Hubungi Kami</span>
        </a>
      )}
    </div>
  );
}
