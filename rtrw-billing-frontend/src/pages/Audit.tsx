import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AuditRow {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  statusCode: number | null;
  createdAt: string;
}

const methodTone = (action: string) => {
  if (action.startsWith('POST')) return 'bg-emerald-50 text-emerald-700';
  if (action.startsWith('PATCH') || action.startsWith('PUT')) return 'bg-amber-50 text-amber-700';
  if (action.startsWith('DELETE')) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

export default function Audit() {
  const { data, isLoading } = useQuery<AuditRow[]>({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get('/audit-logs')).data,
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <p className="text-sm text-slate-500">
        Mencatat setiap aksi yang mengubah data (POST/PATCH/DELETE). Body tidak disimpan.
      </p>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Waktu</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Kode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {new Date(a.createdAt).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3">{a.userEmail ?? <span className="text-slate-400">sistem/anonim</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${methodTone(a.action)} font-mono`}>{a.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    {a.entity ?? '—'}{a.entityId ? <span className="font-mono text-xs text-slate-400"> #{a.entityId}</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.ip ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.statusCode ?? '—'}</td>
                </tr>
              ))}
              {!isLoading && !data?.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada catatan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
