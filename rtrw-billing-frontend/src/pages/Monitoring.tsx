import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Wifi, WifiOff, Power, PowerOff, Loader2, Radar, Users2, Plus, RefreshCw, Router as RouterIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';
import { getMonitoringSocket, OnuStatusEvent } from '@/lib/socket';

interface Device {
  id: string;
  serialNumber: string;
  customerName?: string;
  lastRxPower: string | null;
  lastStatus: string | null;
  oltIfIndex: number | null;
  onuId: number | null;
}

/** Index C-Data dikodekan 32-bit — 16 bit bawah = nomor port/onu sebenarnya. */
const decodeIdx = (v: number | null) => (v == null ? null : v > 0xffff ? v & 0xffff : v);
const fmtPort = (ifIndex: number | null, onuId: number | null) => {
  const p = decodeIdx(ifIndex);
  const o = decodeIdx(onuId);
  return p != null && o != null ? `PON ${p} / ONU ${o}` : '—';
};

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
  const canManage = useCan('settings.manage');
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
                <th className="px-4 py-3 font-medium">Port</th>
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
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtPort(r.oltIfIndex, r.onuId)}</td>
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada perangkat ONU — scan OLT di bawah lalu klik "Daftarkan".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Angka RX power diperbarui realtime dari worker SNMP backend (event <code>onu:status</code>).
        Ambang: &lt; −25 dBm warning, &lt; −27 dBm critical.
      </p>

      {canManage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <OnuScanPanel />
          <LiveSessionsPanel />
        </div>
      )}

      {canManage && <GenieacsPanel />}
    </div>
  );
}

/* -------------------- ONU TR-069 (GenieACS) -------------------- */
interface AcsDevice {
  id: string;
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  software: string | null;
  ssid: string | null;
  ip: string | null;
  lastInform: string | null;
  online: boolean;
}

function GenieacsPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<AcsDevice[]>({
    queryKey: ['genieacs-devices'],
    queryFn: async () => (await api.get('/genieacs/devices')).data,
    retry: false,
    refetchInterval: 60000,
  });

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-2 font-medium">
          <RouterIcon size={16} /> ONU TR-069 (GenieACS)
        </h2>
        <button className="btn-ghost text-sm" onClick={() => refetch()} disabled={isFetching} title="Refresh">
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        ONU yang lapor via TR-069 ke GenieACS — serial, model, SSID, IP WAN. Kelola detail (WiFi/reboot) di menu ACS.
      </p>

      {isLoading && <p className="text-sm text-slate-400 py-4 text-center">Memuat…</p>}

      {error != null && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          Gagal membaca GenieACS: {(error as any)?.response?.data?.message ?? (error as any)?.message}.
          Pastikan <code className="bg-amber-100 px-1 rounded">GENIEACS_URL</code> diset di environment aplikasi
          (mis. <code className="bg-amber-100 px-1 rounded">http://IP-SERVER:7557</code>) dan ONU sudah diarahkan
          ke ACS <code className="bg-amber-100 px-1 rounded">http://IP-SERVER:7547</code>.
        </div>
      )}

      {data && (
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Serial</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">SSID</th>
                <th className="px-3 py-2 font-medium">IP WAN</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Lapor Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{d.serial ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{[d.manufacturer, d.model ?? d.software].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-3 py-2 text-xs">{d.ssid ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.ip ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.online ? 'online' : 'offline'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {d.lastInform ? new Date(d.lastInform).toLocaleString('id-ID') : '—'}
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  Belum ada ONU yang lapor ke GenieACS. Isi ACS server di ONU: http://IP-SERVER:7547
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------- Scan ONU langsung dari OLT (SNMP walk) -------------------- */
interface OltLite { id: string; name: string; vendor: string }
interface WalkedOnu { ifIndex: number; onuId: number; dBm: number | null; health: string }

function OnuScanPanel() {
  const qc = useQueryClient();
  const [oltId, setOltId] = useState('');
  const { data: olts } = useQuery<OltLite[]>({
    queryKey: ['olts'],
    queryFn: async () => (await api.get('/olts')).data,
  });
  const scan = useMutation({
    mutationFn: async (id: string) => (await api.get<WalkedOnu[]>(`/olts/${id}/onus`)).data,
    onError: (e: any) => alert(`Scan gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const register = useMutation({
    mutationFn: (o: WalkedOnu) =>
      api.post('/monitoring/devices/register', { oltId, ifIndex: o.ifIndex, onuId: o.onuId, dBm: o.dBm }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
    onError: (e: any) => alert(`Gagal mendaftarkan: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const registerAll = async () => {
    if (!scan.data) return;
    for (const o of scan.data) {
      await api.post('/monitoring/devices/register', { oltId, ifIndex: o.ifIndex, onuId: o.onuId, dBm: o.dBm })
        .catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ['devices'] });
    alert(`${scan.data.length} ONU didaftarkan ke monitoring.`);
  };

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-medium"><Radar size={16} /> Scan ONU dari OLT</h2>
      <p className="mb-3 text-xs text-slate-400">Discovery langsung via SNMP walk — daftar semua ONU + redaman saat ini.</p>
      <div className="flex gap-2">
        <select className="input" value={oltId} onChange={(e) => setOltId(e.target.value)}>
          <option value="">Pilih OLT…</option>
          {olts?.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.vendor})</option>)}
        </select>
        <button
          className="btn-primary whitespace-nowrap"
          disabled={!oltId || scan.isPending}
          onClick={() => scan.mutate(oltId)}
        >
          {scan.isPending ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />} Scan
        </button>
      </div>

      {scan.data && (
        <>
          <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Port</th>
                  <th className="px-3 py-2 font-medium">RX (dBm)</th>
                  <th className="px-3 py-2 font-medium">Health</th>
                  <th className="px-3 py-2 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scan.data.map((o, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{fmtPort(o.ifIndex, o.onuId)}</td>
                    <td className={`px-3 py-2 ${dbmTone(o.dBm)}`}>{o.dBm == null ? 'LOS' : o.dBm.toFixed(2)}</td>
                    <td className="px-3 py-2"><span className={`badge ${healthTone[o.health] ?? 'bg-slate-100'}`}>{o.health}</span></td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn-ghost py-1 text-xs text-brand-600"
                        disabled={register.isPending}
                        onClick={() => register.mutate(o)}
                        title="Daftarkan ke monitoring">
                        <Plus size={13} /> Daftarkan
                      </button>
                    </td>
                  </tr>
                ))}
                {!scan.data.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Tidak ada ONU terbaca.</td></tr>}
              </tbody>
            </table>
          </div>
          {scan.data.length > 0 && (
            <button className="btn-ghost text-sm mt-2" onClick={registerAll}>
              <Plus size={14} /> Daftarkan Semua ({scan.data.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------- Sesi PPPoE aktif langsung dari Mikrotik -------------------- */
interface RouterLite { id: string; name: string }
interface ActiveSession { name: string; address: string; uptime: string; callerId: string; service: string }

function LiveSessionsPanel() {
  const [routerId, setRouterId] = useState('');
  const { data: routers } = useQuery<RouterLite[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
  });
  const load = useMutation({
    mutationFn: async (id: string) => (await api.get<ActiveSession[]>(`/routers/${id}/active`)).data,
    onError: (e: any) => alert(`Gagal ambil sesi: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-medium"><Users2 size={16} /> Sesi PPPoE Aktif</h2>
      <p className="mb-3 text-xs text-slate-400">Siapa yang online sekarang — dibaca live dari Mikrotik (<code>/ppp/active</code>).</p>
      <div className="flex gap-2">
        <select className="input" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
          <option value="">Pilih Router…</option>
          {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button
          className="btn-primary whitespace-nowrap"
          disabled={!routerId || load.isPending}
          onClick={() => load.mutate(routerId)}
        >
          {load.isPending ? <Loader2 size={16} className="animate-spin" /> : <Users2 size={16} />} Muat
        </button>
      </div>

      {load.data && (
        <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Uptime</th>
                <th className="px-3 py-2 font-medium">Caller ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {load.data.map((s, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.address}</td>
                  <td className="px-3 py-2 text-xs">{s.uptime}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.callerId ?? '—'}</td>
                </tr>
              ))}
              {!load.data.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Tidak ada sesi aktif.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {load.data && <p className="mt-2 text-xs text-slate-400">{load.data.length} sesi online.</p>}
    </div>
  );
}
