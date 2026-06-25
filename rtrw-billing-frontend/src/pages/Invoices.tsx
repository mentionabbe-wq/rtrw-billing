import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Loader2, Wallet } from 'lucide-react';
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
  const { data, isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/billing/invoices')).data,
  });

  const generate = useMutation({
    mutationFn: () => api.post('/billing/invoices/generate-monthly'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      const { created, skipped } = res.data ?? {};
      alert(`Tagihan dibuat: ${created} baru, ${skipped} dilewati (sudah ada).`);
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
      <p className="text-sm text-slate-500">
        Klik <strong>Bayar</strong> untuk menandai lunas. Pelanggan yang ter-suspend akan
        <strong> otomatis aktif kembali</strong> via Mikrotik dan jatuh tempo diperpanjang.
      </p>

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
                    <div className="flex justify-end">
                      {inv.status === 'paid' ? (
                        <span className="text-xs text-emerald-600">Lunas ✓</span>
                      ) : canBilling ? (
                        <button
                          className="btn-primary py-1"
                          disabled={pay.isPending}
                          onClick={() => {
                            if (confirm(`Tandai LUNAS tagihan ${inv.invoiceNo} (${rupiah(inv.amount)})?\nPelanggan akan diaktifkan kembali.`))
                              pay.mutate(inv.id);
                          }}
                          title="Bayar / tandai lunas"
                        >
                          {pay.isPending && pay.variables === inv.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Wallet size={14} />} Bayar
                        </button>
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
    </div>
  );
}
