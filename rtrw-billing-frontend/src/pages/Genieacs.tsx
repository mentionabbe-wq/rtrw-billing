import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wifi, RotateCw, RefreshCw, Power, X, Loader2, Router as RouterIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface AcsDevice {
  id: string;
  serial: string | null;
  manufacturer: string | null;
  productClass: string | null;
  model: string | null;
  software: string | null;
  ssid: string | null;
  ip: string | null;
  lastInform: string | null;
  online: boolean;
}
interface AcsDetail extends AcsDevice {
  password: string | null;
  connectedHosts: string | null;
  uptime: string | null;
  ssidPath: string | null;
  passPath: string | null;
}

export default function Genieacs() {
  const qc = useQueryClient();
  const canControl = useCan('monitoring.control');
  const [wifiFor, setWifiFor] = useState<AcsDevice | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<AcsDevice[]>({
    queryKey: ['acs-devices'],
    queryFn: async () => (await api.get('/genieacs/devices')).data,
    retry: false,
    refetchInterval: 30000,
  });

  const act = useMutation({
    mutationFn: ({ id, op }: { id: string; op: 'reboot' | 'refresh' }) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/${op}`),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['acs-devices'] });
      alert(v.op === 'reboot' ? 'Perintah reboot dikirim.' : 'Refresh diminta — data akan diperbarui saat ONU inform.');
    },
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  const errMsg = (error as any)?.response?.data?.message;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ONU TR-069 (GenieACS)</h1>
        <button className="btn-ghost" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Muat ulang
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Kontrol ONU via GenieACS: ubah SSID/password WiFi, reboot, refresh. Data dari server GenieACS Anda.
      </p>

      {error && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Tidak bisa terhubung ke GenieACS{errMsg ? `: ${errMsg}` : ''}.<br />
          Set <code>GENIEACS_URL</code> (mis. <code>http://IP:7557</code>) di environment aplikasi (CasaOS) lalu Recreate.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Serial / Model</th>
                <th className="px-4 py-3 font-medium">SSID WiFi</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Inform Terakhir</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{d.serial ?? d.id}</div>
                    <div className="text-xs text-slate-400">{d.manufacturer} {d.model ?? d.productClass}</div>
                  </td>
                  <td className="px-4 py-3">{d.ssid ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.ip ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.lastInform ? new Date(d.lastInform).toLocaleString('id-ID') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canControl ? (
                        <>
                          <button className="btn-ghost text-brand-600" title="Ubah WiFi" onClick={() => setWifiFor(d)}><Wifi size={16} /></button>
                          <button className="btn-ghost" title="Refresh data" disabled={act.isPending} onClick={() => act.mutate({ id: d.id, op: 'refresh' })}><RotateCw size={16} /></button>
                          <button className="btn-ghost text-rose-600" title="Reboot ONU" disabled={act.isPending}
                            onClick={() => { if (confirm(`Reboot ONU ${d.serial ?? d.id}?`)) act.mutate({ id: d.id, op: 'reboot' }); }}>
                            <Power size={16} />
                          </button>
                        </>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !error && !data?.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  <RouterIcon size={20} className="mx-auto mb-2 opacity-50" />
                  Belum ada ONU terdaftar di GenieACS.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {wifiFor && <WifiModal device={wifiFor} onClose={() => setWifiFor(null)} onSaved={() => { setWifiFor(null); qc.invalidateQueries({ queryKey: ['acs-devices'] }); }} />}
    </div>
  );
}

function WifiModal({ device, onClose, onSaved }: { device: AcsDevice; onClose: () => void; onSaved: () => void }) {
  const { data: detail, isLoading } = useQuery<AcsDetail>({
    queryKey: ['acs-device', device.id],
    queryFn: async () => (await api.get(`/genieacs/devices/${encodeURIComponent(device.id)}`)).data,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (body: { ssid?: string; password?: string }) =>
      api.post(`/genieacs/devices/${encodeURIComponent(device.id)}/wifi`, body),
    onSuccess: () => { alert('Perintah ubah WiFi dikirim ke ONU.'); onSaved(); },
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save.mutate({
      ssid: (fd.get('ssid') as string) || undefined,
      password: (fd.get('password') as string) || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Ubah WiFi — {device.serial ?? device.id}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        {isLoading ? (
          <p className="py-6 text-center text-slate-400">Memuat parameter…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs text-slate-500">SSID
              <input name="ssid" className="input mt-1" defaultValue={detail?.ssid ?? ''} placeholder="Nama WiFi" />
            </label>
            <label className="block text-xs text-slate-500">Password WiFi
              <input name="password" className="input mt-1 font-mono" defaultValue={detail?.password ?? ''} placeholder="Kosongkan = tidak diubah" />
            </label>
            {!detail?.ssidPath && <p className="text-xs text-amber-600">Parameter WiFi tidak terdeteksi pada device ini.</p>}
            <button className="btn-primary w-full" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" size={16} /> : <Wifi size={16} />} Terapkan ke ONU
            </button>
            <p className="text-xs text-slate-400">Perubahan dikirim via connection-request; bila ONU offline, akan diterapkan saat online berikutnya.</p>
          </form>
        )}
      </div>
    </div>
  );
}
