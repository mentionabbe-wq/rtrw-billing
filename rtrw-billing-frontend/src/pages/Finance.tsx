import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, TrendingUp, Ticket, Receipt, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface FinanceRow { bulan: string; pppoe: number; hotspot: number; total: number }
interface FinanceReport {
  series: FinanceRow[];
  totalPppoe: number;
  totalHotspot: number;
  totalAll: number;
  thisMonth: number;
  unpaidAmount: number;
  unpaidCount: number;
}

const rupiah = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

const fmtBulan = (ym: string) => {
  const [y, m] = ym.split('-');
  const nama = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${nama[Number(m) - 1]} ${y.slice(2)}`;
};

function Kpi({ icon: Icon, label, value, tone, sub }: any) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={18} />
        </div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Finance() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery<FinanceReport>({
    queryKey: ['finance', months],
    queryFn: async () => (await api.get(`/dashboard/finance?months=${months}`)).data,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Wallet size={22} className="text-emerald-500" /> Laporan Keuangan
        </h1>
        <select className="input w-auto text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={3}>3 bulan terakhir</option>
          <option value={6}>6 bulan terakhir</option>
          <option value={12}>12 bulan terakhir</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-500" size={36} /></div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={TrendingUp} label="Bulan Ini" value={rupiah(data.thisMonth)} tone="bg-emerald-50 text-emerald-600" />
            <Kpi icon={Wallet} label={`Total ${months} Bulan`} value={rupiah(data.totalAll)} tone="bg-indigo-50 text-indigo-600" />
            <Kpi icon={Ticket} label="Dari Voucher Hotspot" value={rupiah(data.totalHotspot)} tone="bg-sky-50 text-sky-600"
              sub={`PPPoE: ${rupiah(data.totalPppoe)}`} />
            <Kpi icon={Receipt} label="Piutang (Belum Bayar)" value={rupiah(data.unpaidAmount)} tone="bg-rose-50 text-rose-600"
              sub={`${data.unpaidCount} tagihan`} />
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-medium">Pemasukan per Bulan</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="bulan" tickFormatter={fmtBulan} fontSize={12} stroke="#94a3b8" />
                <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number, n: string) => [rupiah(v), n === 'pppoe' ? 'PPPoE' : 'Hotspot']}
                  labelFormatter={fmtBulan}
                />
                <Legend formatter={(v) => (v === 'pppoe' ? 'PPPoE' : 'Voucher Hotspot')} />
                <Bar dataKey="pppoe" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="hotspot" stackId="a" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Bulan</th>
                    <th className="px-4 py-3 font-medium text-right">PPPoE</th>
                    <th className="px-4 py-3 font-medium text-right">Voucher Hotspot</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.series].reverse().map((r) => (
                    <tr key={r.bulan} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{fmtBulan(r.bulan)}</td>
                      <td className="px-4 py-3 text-right">{rupiah(r.pppoe)}</td>
                      <td className="px-4 py-3 text-right">{rupiah(r.hotspot)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{rupiah(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{rupiah(data.totalPppoe)}</td>
                    <td className="px-4 py-3 text-right">{rupiah(data.totalHotspot)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{rupiah(data.totalAll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Pemasukan dihitung dari pembayaran PPPoE yang lunas (settled) + voucher hotspot aktif.
            Piutang = tagihan PPPoE berstatus belum dibayar.
          </p>
        </>
      )}
    </div>
  );
}
