import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, MessageCircle, Receipt, Wallet } from 'lucide-react';
import { portalApi } from '@/lib/portalApi';
import { appApi, errorMessage } from '@/lib/publicApi';
import { rupiah, tanggal } from '@/lib/format';
import { usePortalAuth } from '@/store/portalAuth';
import { Modal } from '@/components/public/Modal';
import { EmptyState, ErrorState, Loading, PCard, PageTitle, StatusBadge } from '@/components/portal/ui';

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  amount: number;
  status: string;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  packageName: string | null;
}

interface PortalSettings {
  companyName: string;
  whatsappNumber: string | null;
  paymentInstructions: string | null;
  bankAccounts: { bank: string; accountNo: string; accountName: string }[];
  qrisImage: string | null;
}

/** "Tagihan Saya" (§17) + pembayaran manual/QRIS (gateway menyusul di Phase 2). */
export default function PortalBilling() {
  const customer = usePortalAuth((s) => s.customer);
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<InvoiceRow[]>({
    queryKey: ['portal-invoices'],
    queryFn: async () => (await portalApi.get('/me/invoices')).data,
  });

  const { data: settings } = useQuery<PortalSettings>({
    queryKey: ['portal-settings-public'],
    queryFn: async () => (await appApi.get('/portal/settings')).data,
    staleTime: 5 * 60_000,
  });

  const claim = useMutation({
    mutationFn: async (note: string) =>
      (await appApi.post('/portal/payment-claim', {
        identifier: customer?.customerNo,
        note,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-invoices'] });
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat tagihan.')} onRetry={() => refetch()} />;
  }

  const unpaid = data.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
  const total = unpaid.reduce((n, i) => n + i.amount, 0);

  const waText = (i: InvoiceRow) =>
    `Tagihan ${i.invoiceNo}\nPelanggan: ${customer?.fullName} (${customer?.customerNo})\n` +
    `Periode: ${tanggal(i.periodStart)} – ${tanggal(i.periodEnd)}\nTotal: ${rupiah(i.amount)}\n` +
    `Jatuh tempo: ${tanggal(i.dueDate)}`;

  const printInvoice = (i: InvoiceRow) => {
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) return;
    const rowsHtml = [
      ['Nomor Invoice', i.invoiceNo],
      ['Pelanggan', `${customer?.fullName ?? '-'} (${customer?.customerNo ?? '-'})`],
      ['Paket', i.packageName ?? '-'],
      ['Periode', `${tanggal(i.periodStart)} – ${tanggal(i.periodEnd)}`],
      ['Jatuh tempo', tanggal(i.dueDate)],
      ['Status', i.status.toUpperCase()],
    ]
      .map(([k, v]) => `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`)
      .join('');

    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
      <title>${i.invoiceNo}</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:40px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#64748b;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
        td{padding:8px 0;border-bottom:1px solid #e2e8f0}
        .total{margin-top:24px;padding:16px;background:#f1f5f9;border-radius:12px;
          display:flex;justify-content:space-between;font-size:18px;font-weight:700}
      </style></head><body>
      <h1>${settings?.companyName ?? 'RT/RW Net'}</h1>
      <p class="muted">Invoice layanan internet</p>
      <table>${rowsHtml}</table>
      <div class="total"><span>Total</span><span>${rupiah(i.amount)}</span></div>
      <p class="muted" style="margin-top:32px">Dicetak ${tanggal(new Date())}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <>
      <PageTitle title="Tagihan Saya" subtitle="Riwayat tagihan layanan internet Anda." />

      {unpaid.length > 0 && (
        <PCard className="mb-5 border-brand-300 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Total tagihan belum dibayar</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{rupiah(total)}</p>
            </div>
            <button className="btn-primary" onClick={() => setPayFor(unpaid[0])}>
              <Wallet size={16} /> Bayar Sekarang
            </button>
          </div>
        </PCard>
      )}

      {data.length === 0 ? (
        <EmptyState title="Belum ada tagihan" text="Tagihan pertama Anda akan muncul di sini setelah diterbitkan." />
      ) : (
        <div className="space-y-3">
          {data.map((i) => (
            <PCard key={i.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-brand-600" />
                    <p className="font-semibold text-slate-900 dark:text-white">{i.invoiceNo}</p>
                    <StatusBadge status={i.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {i.packageName ?? 'Layanan internet'} · Periode {tanggal(i.periodStart)} – {tanggal(i.periodEnd)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Jatuh tempo {tanggal(i.dueDate)}
                  </p>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{rupiah(i.amount)}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(i.status === 'unpaid' || i.status === 'overdue') && (
                  <button className="btn-primary" onClick={() => setPayFor(i)}>
                    <Wallet size={15} /> Bayar Sekarang
                  </button>
                )}
                <button
                  className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                  onClick={() => printInvoice(i)}
                >
                  <Download size={15} /> Unduh Invoice
                </button>
                {settings?.whatsappNumber && (
                  <a
                    className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                    href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(waText(i))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} /> Kirim ke WhatsApp
                  </a>
                )}
              </div>
            </PCard>
          ))}
        </div>
      )}

      <PayDialog
        invoice={payFor}
        settings={settings}
        onClose={() => { setPayFor(null); claim.reset(); }}
        onClaim={(note) => claim.mutate(note)}
        claiming={claim.isPending}
        claimed={claim.isSuccess}
        claimError={claim.isError ? errorMessage(claim.error, 'Konfirmasi gagal dikirim.') : null}
      />
    </>
  );
}

function PayDialog({
  invoice, settings, onClose, onClaim, claiming, claimed, claimError,
}: {
  invoice: InvoiceRow | null;
  settings?: PortalSettings;
  onClose: () => void;
  onClaim: (note: string) => void;
  claiming: boolean;
  claimed: boolean;
  claimError: string | null;
}) {
  const [note, setNote] = useState('');

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title="Bayar Tagihan"
      subtitle={invoice ? `${invoice.invoiceNo} · ${rupiah(invoice.amount)}` : undefined}
    >
      {claimed ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Konfirmasi pembayaran Anda sudah dikirim ke admin. Layanan akan diaktifkan kembali
            setelah pembayaran diverifikasi.
          </p>
          <button className="btn-primary w-full" onClick={onClose}>Tutup</button>
        </div>
      ) : (
        <div className="space-y-4">
          {settings?.bankAccounts?.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Transfer bank</p>
              {settings.bankAccounts.map((b) => (
                <div key={b.accountNo} className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-white/5">
                  <p className="font-semibold">{b.bank}</p>
                  <p className="text-lg font-bold tracking-wide">{b.accountNo}</p>
                  <p className="text-slate-500 dark:text-slate-400">a.n. {b.accountName}</p>
                </div>
              ))}
            </div>
          ) : null}

          {settings?.qrisImage && (
            <div>
              <p className="mb-2 text-sm font-medium">QRIS</p>
              <img src={settings.qrisImage} alt="QRIS" className="mx-auto w-56 rounded-xl border border-slate-200 dark:border-white/10" />
            </div>
          )}

          {settings?.paymentInstructions && (
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {settings.paymentInstructions}
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Catatan konfirmasi (opsional)</label>
            <input
              className="input dark:border-white/15 dark:bg-slate-800 dark:text-white"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. transfer BCA a.n. Budi, 10 Sep 14:00"
            />
          </div>

          {claimError && <p className="text-sm text-rose-600 dark:text-rose-400">{claimError}</p>}

          <button className="btn-primary w-full" onClick={() => onClaim(note)} disabled={claiming}>
            {claiming && <Loader2 size={16} className="animate-spin" />}
            Saya Sudah Bayar
          </button>
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Pembayaran otomatis lewat QRIS/Virtual Account tersedia pada tahap berikutnya.
          </p>
        </div>
      )}
    </Modal>
  );
}
