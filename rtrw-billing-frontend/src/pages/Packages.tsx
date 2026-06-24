import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Pkg {
  id: string;
  name: string;
  price: string;
  rateLimit: string;
  pppoeProfile: string;
  isActive: boolean;
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

export default function Packages() {
  const { data, isLoading } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Paket Layanan</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-slate-400">Memuat…</p>}
        {data?.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{p.name}</h3>
              <span className={`badge ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.isActive ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-brand-700">{rupiah(p.price)}<span className="text-sm font-normal text-slate-400">/bln</span></p>
            <dl className="mt-4 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between"><dt>Bandwidth</dt><dd className="font-medium">{p.rateLimit}</dd></div>
              <div className="flex justify-between"><dt>Profil PPPoE</dt><dd className="font-mono text-xs">{p.pppoeProfile}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
