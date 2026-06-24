import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, Wifi, WifiOff, Power, PowerOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';
import { getMonitoringSocket, OnuStatusEvent } from '@/lib/socket';

interface Device {
  id: string;
  serialNumber: string;
  customerName?: string;
  lastRxPower: string | null;
  lastStatus: string | null;
}

const healthTone: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-rose-50 text-rose-700',
};

function dbmTone(dbm: number | null) {
  if (dbm == null) return 'text-slate-400';
  if (dbm < -27) return 'text-rose-600 font-semibold';
  if (dbm < -25) return 'text-amber-600 font-semibold';
  return 'text-emerald-600 font-semibold';
}

export default function Monitoring() {
  const { data } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: async () => (await api.get('/monitoring/devices')).data,
  });

  const canControl = useCan('monitoring.control');
  const [live, setLive] = useState<Record<string, OnuStatusEvent>>({});
  const [connected, setConnected] = useState(false);

  const portCtl = useMutation({
    mutationFn: ({ id, up }: { id: string; up: boolean }) =>
      api.post(`/monitoring/devices/${id}/port`, { up }),
    onError: () => alert('Gagal mengirim perintah SNMP ke OLT.'),
  });

  useEffect(() => {
    const socket = getMonitoringSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onStatus = (e: OnuStatusEvent) => setLive((p) => ({ ...p, [e.deviceId]: e }));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('onu:status', onStatus);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('onu:status', onStatus);
    };
  }, []);

  const rows = useMemo(
    () =>
      (data ?? []).map((d) => {
        const ev = live[d.id];
        const dbm = ev ? ev.dBm : d.lastRxPower != null ? Number(d.lastRxPower) : null;
        const health = ev?.health ?? (d.lastStatus === 'los' ? 'critical' : 'ok');
        return { ...d, dbm, health };
      }),
    [data, live],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Monitoring ONU</h1>
        <span className={`badge ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {connected ? <Wifi size={14} className="mr-1" /> : <WifiOff size={14} className="mr-1" />}
          {connected ? 'Live' : 'Terputus'}
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Serial ONU</th>
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">RX Power (dBm)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Port ONU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{r.serialNumber}</td>
                  <td className="px-4 py-3">{r.customerName ?? '—'}</td>
                  <td className={`px-4 py-3 ${dbmTone(r.dbm)}`}>
                    {r.dbm == null ? '—' : r.dbm.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${healthTone[r.health] ?? 'bg-slate-100'}`}>
                      <Activity size={12} className="mr-1" /> {r.health}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!canControl && <span className="text-xs text-slate-400">—</span>}
                      {canControl && (
                        <>
                          <button
                            className="btn-ghost text-emerald-600"
                            disabled={portCtl.isPending}
                            onClick={() => portCtl.mutate({ id: r.id, up: true })}
                            title="Enable port (SNMP)"
                          >
                            <Power size={16} />
                          </button>
                          <button
                            className="btn-ghost text-rose-600"
                            disabled={portCtl.isPending}
                            onClick={() => {
                              if (confirm(`Nonaktifkan port ONU ${r.serialNumber}?`)) portCtl.mutate({ id: r.id, up: false });
                            }}
                            title="Disable port (SNMP)"
                          >
                            <PowerOff size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada perangkat ONU.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Angka RX power diperbarui realtime dari worker SNMP backend (event <code>onu:status</code>).
        Ambang: &lt; −25 dBm warning, &lt; −27 dBm critical.
      </p>
    </div>
  );
}
