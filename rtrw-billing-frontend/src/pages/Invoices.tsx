import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Loader2, Wallet, CreditCard, ExternalLink, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Invoice {
  id: string;
  invoiceNo: string;
  amount: string;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt?: string;
  status: string;
  packageName?: string | null;
  customerName: string | null;
  customerNo: string | null;
  pppoeUser: string | null;
  subStatus: string | null;
}

interface GatewayStatus {
  tripay: { configured: boolean; mode: string };
  midtrans: { configured: boolean; mode: string };
}

interface PortalSettings {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  tagline: string;
  whatsappNumber: string | null;
  bankAccounts: { bank: string; accountNo: string; accountName: string }[];
  footerText: string | null;
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const tone: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  unpaid: 'bg-amber-50 text-amber-700',
  overdue: 'bg-rose-50 text-rose-700',
  void: 'bg-slate-100 text-slate-500',
};

function printInvoice(inv: Invoice, settings: PortalSettings | undefined) {
  const company = settings?.companyName ?? 'RT/RW Net';
  const logoUrl = settings?.logoUrl;
  const banks = settings?.bankAccounts ?? [];
  const footer = settings?.footerText ?? company;
  const color = settings?.primaryColor ?? '#012b6d';

  const statusLabel: Record<string, string> = {
    paid: 'LUNAS', unpaid: 'BELUM BAYAR', overdue: 'JATUH TEMPO', void: 'DIBATALKAN',
  };
  const statusColor: Record<string, string> = {
    paid: '#16a34a', unpaid: '#d97706', overdue: '#dc2626', void: '#6b7280',
  };

  const bankRows = banks.length
    ? banks.map((b) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-weight:600">${b.bank}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-family:monospace">${b.accountNo}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0">${b.accountName}</td>
        </tr>`).join('')
    : '';

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Faktur ${inv.invoiceNo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:32px}
    .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid ${color};padding-bottom:16px;margin-bottom:24px}
    .logo-wrap{display:flex;align-items:center;gap:12px}
    .logo-wrap img{height:52px;width:52px;object-fit:contain;border-radius:6px}
    .company-name{font-size:20px;font-weight:700;color:${color}}
    .invoice-label{text-align:right}
    .invoice-label .no{font-size:18px;font-weight:700;color:${color}}
    .invoice-label .date{font-size:12px;color:#64748b;margin-top:4px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:8px}
    .field{margin-bottom:6px}
    .field .label{font-size:11px;color:#64748b}
    .field .value{font-weight:600;color:#1e293b}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:${color};color:#fff;padding:8px 12px;text-align:left;font-size:12px}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}
    .total-row td{font-weight:700;font-size:15px;border-top:2px solid ${color};border-bottom:none;padding-top:12px}
    .status-badge{display:inline-block;padding:6px 20px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:.05em;border:2px solid;color:${statusColor[inv.status] ?? '#6b7280'};border-color:${statusColor[inv.status] ?? '#6b7280'}}
    .bank-table th{font-size:11px}
    .bank-table td{font-size:12px}
    .footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}button{display:none}}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-wrap">
      ${logoUrl ? `<img src="${logoUrl}" alt="logo">` : ''}
      <div>
        <div class="company-name">${company}</div>
        <div style="font-size:12px;color:#64748b">Layanan Internet</div>
      </div>
    </div>
    <div class="invoice-label">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.08em">Faktur / Invoice</div>
      <div class="no">${inv.invoiceNo}</div>
      <div class="date">Diterbitkan: ${fmtDate(inv.createdAt)}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="section-title">Data Pelanggan</div>
      <div class="field"><div class="label">Nama</div><div class="value">${inv.customerName ?? '—'}</div></div>
      <div class="field"><div class="label">No. Pelanggan</div><div class="value">${inv.customerNo ?? '—'}</div></div>
      <div class="field"><div class="label">Akun PPPoE</div><div class="value" style="font-family:monospace">${inv.pppoeUser ?? '—'}</div></div>
    </div>
    <div>
      <div class="section-title">Detail Tagihan</div>
      <div class="field"><div class="label">Periode</div><div class="value">${inv.periodStart ? inv.periodStart.slice(0, 7).split('-').reverse().join('/') : '—'}</div></div>
      <div class="field"><div class="label">Jatuh Tempo</div><div class="value">${fmtDate(inv.dueDate)}</div></div>
      <div class="field"><div class="label">Status</div><div class="value"><span class="status-badge">${statusLabel[inv.status] ?? inv.status.toUpperCase()}</span></div></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Deskripsi</th><th style="text-align:right">Jumlah</th></tr></thead>
    <tbody>
      <tr>
        <td>${inv.packageName ? `Paket ${inv.packageName}` : 'Layanan Internet'}${inv.periodStart ? ` — ${inv.periodStart.slice(0, 7).split('-').reverse().join('/')}` : ''}</td>
        <td style="text-align:right">${rupiah(inv.amount)}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="total-row"><td>Total</td><td style="text-align:right">${rupiah(inv.amount)}</td></tr>
    </tfoot>
  </table>

  ${inv.status !== 'paid' && banks.length ? `
  <div class="section-title">Cara Pembayaran</div>
  <table class="bank-table">
    <thead><tr><th>Bank</th><th>No. Rekening</th><th>Atas Nama</th></tr></thead>
    <tbody>${bankRows}</tbody>
  </table>
  ` : ''}

  <div class="footer">${footer}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=860,height=700');
  if (!win) { alert('Popup diblokir browser. Aktifkan popup untuk fitur cetak.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export default function Invoices() {
  const qc = useQueryClient();
  const canBilling = useCan('billing.write');
  const [payLinkResult, setPayLinkResult] = useState<{ invoiceNo: string; url: string; gateway: string } | null>(null);

  const { data, isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/billing/invoices')).data,
  });

  const { data: gwStatus } = useQuery<GatewayStatus>({
    queryKey: ['gateway-status'],
    queryFn: async () => (await api.get('/billing/gateway/status')).data,
    enabled: canBilling,
  });

  const { data: portalSettings } = useQuery<PortalSettings>({
    queryKey: ['portal-settings'],
    queryFn: async () => (await api.get('/portal/settings')).data,
    staleTime: 5 * 60 * 1000,
  });

  const anyGatewayConfigured = gwStatus?.tripay.configured || gwStatus?.midtrans.configured;
  const defaultGateway = gwStatus?.tripay.configured ? 'tripay' : 'midtrans';

  const generate = useMutation({
    mutationFn: () => api.post('/billing/invoices/generate-monthly'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      const { created, skipped } = res.data ?? {};
      alert(`Tagihan dibuat: ${created} baru, ${skipped} dilewati.`);
    },
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.post(`/billing/invoices/${id}/pay`, { method: 'cash' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: () => alert('Gagal memproses pembayaran.'),
  });

  const payLink = useMutation({
    mutationFn: ({ id, gateway }: { id: string; gateway: string }) =>
      api.post(`/billing/invoices/${id}/payment-link`, { gateway }),
    onSuccess: (res, vars) => {
      const d = res.data;
      if (d.alreadyPaid) { alert('Tagihan ini sudah lunas.'); return; }
      const inv = data?.find((i) => i.id === vars.id);
      setPayLinkResult({ invoiceNo: inv?.invoiceNo ?? '', url: d.paymentUrl, gateway: d.gateway });
    },
    onError: (e: any) => alert(`Gagal buat link: ${e?.response?.data?.message ?? e.message}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tagihan & Pembayaran</h1>
        {canBilling && (
          <button className="btn-primary" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <Loader2 className="animate-spin" size={16} /> : <Receipt size={16} />}
            Generate Tagihan Bulan Ini
          </button>
        )}
      </div>

      {/* Gateway status banner */}
      {canBilling && gwStatus && !anyGatewayConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Payment gateway belum dikonfigurasi.</strong> Isi <code className="bg-amber-100 px-1 rounded">TRIPAY_API_KEY</code> / <code className="bg-amber-100 px-1 rounded">MIDTRANS_SERVER_KEY</code> di environment CasaOS untuk aktifkan tombol Bayar Online.
        </div>
      )}
      {canBilling && gwStatus && anyGatewayConfigured && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CreditCard size={15} />
          Gateway aktif: {[gwStatus.tripay.configured && `Tripay (${gwStatus.tripay.mode})`, gwStatus.midtrans.configured && `Midtrans (${gwStatus.midtrans.mode})`].filter(Boolean).join(', ')}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">No. Invoice</th>
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">Periode</th>
                <th className="px-4 py-3 font-medium">Jumlah</th>
                <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{inv.customerName ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400">{inv.pppoeUser ?? inv.customerNo ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {inv.periodStart ? inv.periodStart.slice(0, 7).split('-').reverse().join('/') : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium">{rupiah(inv.amount)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(inv.dueDate).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-3"><span className={`badge ${tone[inv.status] ?? 'bg-slate-100'}`}>{inv.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {/* Cetak — always visible */}
                      <button
                        className="btn-ghost py-1 text-xs text-slate-600"
                        title="Cetak faktur"
                        onClick={() => printInvoice(inv, portalSettings)}
                      >
                        <Printer size={13} />
                      </button>

                      {inv.status === 'paid' ? (
                        <span className="text-xs text-emerald-600 self-center">Lunas ✓</span>
                      ) : canBilling ? (
                        <>
                          <button
                            className="btn-ghost text-emerald-700 py-1 text-xs"
                            disabled={pay.isPending}
                            onClick={() => {
                              if (confirm(`Tandai LUNAS tagihan ${inv.invoiceNo} (${rupiah(inv.amount)})?\nPelanggan akan diaktifkan kembali.`))
                                pay.mutate(inv.id);
                            }}
                            title="Tandai lunas manual"
                          >
                            {pay.isPending && pay.variables === inv.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Wallet size={13} />} Lunas
                          </button>
                          {anyGatewayConfigured && (
                            <button
                              className="btn-primary py-1 text-xs"
                              disabled={payLink.isPending}
                              onClick={() => payLink.mutate({ id: inv.id, gateway: defaultGateway })}
                              title="Generate link pembayaran online"
                            >
                              {payLink.isPending && payLink.variables?.id === inv.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <CreditCard size={13} />} Bayar Online
                            </button>
                          )}
                        </>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada tagihan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal link pembayaran */}
      {payLinkResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold">Link Pembayaran Dibuat</h2>
            <p className="text-sm text-slate-600">
              Invoice <span className="font-mono">{payLinkResult.invoiceNo}</span> via <strong className="capitalize">{payLinkResult.gateway}</strong>
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 break-all text-xs font-mono text-slate-700">
              {payLinkResult.url}
            </div>
            <p className="text-xs text-slate-500">Kirim link ini ke pelanggan via WhatsApp. Setelah bayar, status otomatis berubah lunas & internet aktif kembali.</p>
            <div className="flex gap-2">
              <a href={payLinkResult.url} target="_blank" rel="noopener noreferrer"
                className="btn-primary flex-1 flex items-center justify-center gap-1 text-sm">
                <ExternalLink size={14} /> Buka Link
              </a>
              <button className="btn-ghost flex-1 text-sm"
                onClick={() => { navigator.clipboard.writeText(payLinkResult.url); alert('Link disalin!'); }}>
                Salin Link
              </button>
            </div>
            <button className="w-full text-sm text-slate-400 hover:text-slate-600" onClick={() => setPayLinkResult(null)}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
