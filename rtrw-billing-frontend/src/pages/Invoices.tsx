import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Loader2, Wallet, CreditCard, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Invoice {
  id: string;
  invoiceNo: string;
  amount: string;
  dueDate: string;
  status: string;
  customerName: string | null;
  customerNo: string | null;
  pppoeUser: string | null;
  subStatus: string | null;
}

interface GatewayStatus {
  tripay: { configured: boolean; mode: string };
  midtrans: { configured: boolean; mode: string };
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

const tone: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  unpaid: 'bg-amber-50 text-amber-700',
  overdue: 'bg-rose-50 text-rose-700',
  void: 'bg-slate-100 text-slate-500',
};

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
                <th className="px-4 py-3 font-medium">Jumlah</th>
                <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{inv.customerName ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400">{inv.pppoeUser ?? inv.customerNo ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{rupiah(inv.amount)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(inv.dueDate).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-3"><span className={`badge ${tone[inv.status] ?? 'bg-slate-100'}`}>{inv.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {inv.status === 'paid' ? (
                        <span className="text-xs text-emerald-600">Lunas ✓</span>
                      ) : canBilling ? (
                        <>
                          {/* Bayar manual (cash/transfer dikonfirmasi admin) */}
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
                          {/* Bayar Online via gateway */}
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada tagihan.</td></tr>
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
