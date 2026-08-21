import { FormEvent, ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowRight, Banknote, Check, ChevronDown, Gauge, Loader2, MapPin, QrCode,
  Receipt, ShieldCheck, Wifi,
} from 'lucide-react';
import clsx from 'clsx';
import { errorMessage, publicApi } from '@/lib/publicApi';
import { rupiah } from '@/lib/format';
import { LandingCompany, PublicShell, waLink } from '@/components/public/PublicShell';
import { CekTagihanDialog } from '@/components/public/CekTagihanDialog';
import { DaftarDialog, PublicPackage } from '@/components/public/DaftarDialog';

interface LandingData {
  company: LandingCompany & { primaryColor: string };
  hero: { title: string; subtitle: string };
  highlights: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  payment: {
    instructions: string | null;
    bankAccounts: { bank: string; accountNo: string; accountName: string }[];
    qrisAvailable: boolean;
  };
  coverageNote: string | null;
  registrationEnabled: boolean;
  packages: PublicPackage[];
  coverage: {
    id: string; name: string; village: string | null; rt: string | null; rw: string | null;
    status: 'available' | 'full' | 'planned'; note: string | null;
  }[];
  status: { status: 'operational' | 'degraded' | 'outage'; note: string | null; checkedAt: string };
}

const SECTIONS = [
  { id: 'paket', label: 'Paket' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'pembayaran', label: 'Pembayaran' },
  { id: 'status', label: 'Status Jaringan' },
  { id: 'faq', label: 'FAQ' },
];

const STATUS_UI = {
  operational: { dot: 'bg-emerald-500', label: 'Semua sistem normal', ring: 'ring-emerald-500/30', emoji: '🟢' },
  degraded: { dot: 'bg-amber-500', label: 'Gangguan sebagian', ring: 'ring-amber-500/30', emoji: '🟡' },
  outage: { dot: 'bg-rose-500', label: 'Gangguan besar', ring: 'ring-rose-500/30', emoji: '🔴' },
} as const;

export default function Landing() {
  const [cekOpen, setCekOpen] = useState(false);
  const [daftarOpen, setDaftarOpen] = useState(false);
  const [presetPackage, setPresetPackage] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<LandingData>({
    queryKey: ['public-landing'],
    queryFn: async () => (await publicApi.get('/landing')).data,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">Halaman belum dapat dimuat</p>
          <p className="mt-1 text-sm text-slate-500">Periksa koneksi Anda lalu coba lagi.</p>
          <button className="btn-primary mt-4" onClick={() => refetch()}>Muat ulang</button>
        </div>
      </div>
    );
  }

  const status = STATUS_UI[data.status.status];
  const openDaftar = (pkgId?: string) => {
    setPresetPackage(pkgId ?? null);
    setDaftarOpen(true);
  };

  return (
    <PublicShell company={data.company} sections={SECTIONS}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-600/10 via-sky-400/5 to-transparent dark:from-brand-600/20 dark:via-sky-500/5" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className={clsx(
              'inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1',
              'text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-200', status.ring,
            )}>
              <span className={clsx('h-2 w-2 rounded-full', status.dot)} />
              {status.label}
            </span>

            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl dark:text-white">
              {data.hero.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
              {data.hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/portal" className="btn-primary px-5 py-2.5">
                Login Pelanggan <ArrowRight size={16} />
              </Link>
              <button className="btn border border-slate-300 bg-white px-5 py-2.5 text-slate-800 hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                onClick={() => setCekOpen(true)}>
                <Receipt size={16} /> Cek Tagihan
              </button>
              <a
                href={waLink(data.company.whatsappNumber, 'Halo, saya ingin bertanya tentang layanan internet.')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn border border-slate-300 bg-white px-5 py-2.5 text-slate-800 hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                Hubungi Kami
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {data.highlights.slice(0, 3).map((h) => (
                <div key={h.title}>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{h.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{h.text}</p>
                </div>
              ))}
            </div>
          </div>

          <NetworkIllustration />
        </div>
      </section>

      {/* ── PAKET ────────────────────────────────────────────────────────── */}
      <Section id="paket" title="Paket Internet" subtitle="Harga sudah termasuk pemasangan WiFi. Tanpa FUP.">
        {data.packages.length === 0 ? (
          <EmptyState text="Paket belum tersedia. Silakan hubungi kami via WhatsApp." />
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {data.packages.map((p) => (
              <article
                key={p.id}
                className={clsx(
                  'relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg',
                  'dark:bg-white/5',
                  p.badge
                    ? 'border-brand-500 ring-2 ring-brand-500/20 dark:border-brand-500'
                    : 'border-slate-200 dark:border-white/10',
                )}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold tracking-wide text-white">
                    {p.badge}
                  </span>
                )}
                {/* Nama paket sudah memuat kecepatannya, jadi tidak diulang lagi. */}
                <h3 className="text-xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                  {p.name}
                </h3>
                <p className="mt-3 text-3xl font-bold text-brand-600 dark:text-brand-400">
                  {rupiah(p.price)}
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/bulan</span>
                </p>
                {p.description && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{p.description}</p>
                )}
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn-primary mt-6 w-full"
                  onClick={() => openDaftar(p.id)}
                  disabled={!data.registrationEnabled}
                >
                  {data.registrationEnabled ? 'Berlangganan' : 'Pendaftaran ditutup'}
                </button>
              </article>
            ))}
          </div>
        )}
      </Section>

      {/* ── COVERAGE ─────────────────────────────────────────────────────── */}
      <Section
        id="coverage"
        title="Cek Ketersediaan Internet"
        subtitle={data.coverageNote ?? 'Pastikan lokasi Anda sudah masuk area layanan kami.'}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <CoverageCheck onDaftar={() => openDaftar()} />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <MapPin size={18} className="text-brand-600" /> Area Terjangkau
            </h3>
            {data.coverage.length === 0 ? (
              <EmptyState text="Data area layanan belum diisi admin." />
            ) : (
              <ul className="space-y-2">
                {data.coverage.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{a.name}</span>
                      {a.village && <span className="block text-xs text-slate-500 dark:text-slate-400">{a.village}</span>}
                    </span>
                    <span className={clsx(
                      'badge shrink-0',
                      a.status === 'available' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                      a.status === 'full' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                      a.status === 'planned' && 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                    )}>
                      {a.status === 'available' ? 'Tersedia' : a.status === 'full' ? 'Penuh' : 'Rencana'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* ── PEMBAYARAN ───────────────────────────────────────────────────── */}
      <Section id="pembayaran" title="Cara Pembayaran" subtitle="Bayar kapan saja, layanan aktif kembali otomatis setelah terverifikasi.">
        <div className="grid gap-5 md:grid-cols-3">
          {data.payment.bankAccounts.map((b) => (
            <div key={b.accountNo} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <Banknote className="text-brand-600" size={22} />
              <p className="mt-3 font-semibold text-slate-900 dark:text-white">{b.bank}</p>
              <p className="text-lg font-bold tracking-wide">{b.accountNo}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">a.n. {b.accountName}</p>
            </div>
          ))}
          {data.payment.qrisAvailable && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <QrCode className="text-brand-600" size={22} />
              <p className="mt-3 font-semibold text-slate-900 dark:text-white">QRIS</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Scan QRIS dari portal pelanggan, semua e-wallet & mobile banking.
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <ShieldCheck className="text-brand-600" size={22} />
            <p className="mt-3 font-semibold text-slate-900 dark:text-white">Konfirmasi Otomatis</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Status tagihan & layanan diperbarui otomatis setelah pembayaran terverifikasi.
            </p>
          </div>
        </div>
        {data.payment.instructions && (
          <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
            {data.payment.instructions}
          </p>
        )}
      </Section>

      {/* ── STATUS JARINGAN ──────────────────────────────────────────────── */}
      <Section id="status" title="Status Jaringan" subtitle="Informasi gangguan & pemeliharaan, dapat dilihat tanpa login.">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-white/10 dark:bg-white/5">
          <span className={clsx('grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl ring-4', status.ring)}>
            {status.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{status.label}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{data.status.note}</p>
          </div>
          <Link to="/portal" className="btn-primary sm:ml-auto">
            <Activity size={16} /> Cek Koneksi Saya
          </Link>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section id="faq" title="Pertanyaan Umum">
        <div className="mx-auto max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
          {data.faq.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900 dark:text-white">
                {f.q}
                <ChevronDown size={18} className="shrink-0 transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── CTA AKHIR ────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-sky-500 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">Semua kebutuhan internet Anda dalam satu tempat</h2>
          <p className="mx-auto mt-2 max-w-2xl text-white/80">
            Cek tagihan, bayar, ganti nama & kata sandi WiFi, pantau koneksi, dan buat laporan gangguan —
            langsung dari portal pelanggan.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn bg-white px-5 py-2.5 font-semibold text-brand-700 hover:bg-slate-100"
              onClick={() => openDaftar()} disabled={!data.registrationEnabled}>
              Daftar Internet
            </button>
            <Link to="/portal" className="btn border border-white/40 px-5 py-2.5 font-semibold text-white hover:bg-white/10">
              Masuk Portal
            </Link>
          </div>
        </div>
      </section>

      <CekTagihanDialog open={cekOpen} onClose={() => setCekOpen(false)} />
      <DaftarDialog
        open={daftarOpen}
        onClose={() => setDaftarOpen(false)}
        packages={data.packages}
        presetPackageId={presetPackage}
      />
    </PublicShell>
  );
}

// ─── Bagian pembantu ─────────────────────────────────────────────────────────

function Section({
  id, title, subtitle, children,
}: { id?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
      <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">{title}</h2>
      {subtitle && <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
      {text}
    </div>
  );
}

/** Ilustrasi jaringan RT/RW: ISP → MikroTik → OLT → ONU → WiFi rumah. */
function NetworkIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-full bg-brand-500/20 blur-3xl dark:bg-brand-500/25" />
      <div className="relative rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div className="space-y-3">
          {[
            { icon: Gauge, label: 'Uplink ISP', note: 'Fiber backbone' },
            { icon: Activity, label: 'MikroTik + OLT', note: 'PPPoE & VLAN terkelola' },
            { icon: Wifi, label: 'ONU & WiFi Rumah', note: 'Diatur sendiri dari portal' },
          ].map((row, i) => (
            <div key={row.label}>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-sky-400 text-white">
                  <row.icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.label}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.note}</p>
                </div>
              </div>
              {i < 2 && (
                <div className="ml-8 h-4 w-px bg-gradient-to-b from-brand-500/60 to-sky-400/60" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Formulir cek ketersediaan berdasarkan alamat / RT-RW / GPS (§35). */
function CoverageCheck({ onDaftar }: { onDaftar: () => void }) {
  const [address, setAddress] = useState('');
  const [rt, setRt] = useState('');
  const [rw, setRw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ covered: boolean; message: string } | null>(null);

  const check = async (payload: Record<string, unknown>) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await publicApi.post('/coverage/check', payload);
      setResult(res.data);
    } catch (e) {
      setError(errorMessage(e, 'Gagal memeriksa area layanan.'));
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void check({ address: address.trim() || undefined, rt: rt.trim() || undefined, rw: rw.trim() || undefined });
  };

  const byGps = () => {
    if (!navigator.geolocation) {
      setError('Perangkat Anda tidak mendukung deteksi lokasi.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => void check({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setError('Izin lokasi ditolak.'); setLoading(false); },
      { timeout: 10000 },
    );
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Alamat Anda</label>
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="Nama jalan / kelurahan" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">RT</label>
            <input className={inputCls} value={rt} onChange={(e) => setRt(e.target.value)} placeholder="01" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RW</label>
            <input className={inputCls} value={rw} onChange={(e) => setRw(e.target.value)} placeholder="05" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading && <Loader2 size={16} className="animate-spin" />} Cek Alamat
          </button>
          <button type="button" onClick={byGps} disabled={loading}
            className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10">
            <MapPin size={16} /> Pakai GPS
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {result && (
        <div className={clsx(
          'mt-4 rounded-xl p-4 text-sm',
          result.covered
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
            : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
        )}>
          <p>{result.message}</p>
          <button type="button" onClick={onDaftar} className="mt-3 font-semibold underline underline-offset-2">
            Daftar sekarang
          </button>
        </div>
      )}
    </form>
  );
}
