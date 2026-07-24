import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wifi, Power, Loader2, Radar, Users2, Plus, RefreshCw, Router as RouterIcon,
  RotateCw, X, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

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
  const canManage = useCan('settings.manage');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Monitoring ONU</h1>

      <GenieacsPanel />

      {canManage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <OnuScanPanel />
          <LiveSessionsPanel />
        </div>
      )}
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
  customerName?: string | null;
  pppoeUser?: string | null;
  rxPower?: number | null;
  opticalHealth?: 'ok' | 'warning' | 'critical' | null;
  acsId?: string | null;      // id TR-069 (aksi WiFi/reboot/hapus GenieACS)
  deviceId?: string | null;   // id device monitoring OLT (hapus dari monitoring)
  source?: 'tr069' | 'olt';
}
interface AcsDetail extends AcsDevice { password: string | null; ssidPath: string | null; passPath: string | null }

function GenieacsPanel() {
  const qc = useQueryClient();
  const canControl = useCan('monitoring.control');
  const [wifiFor, setWifiFor] = useState<AcsDevice | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<AcsDevice[]>({
    queryKey: ['genieacs-devices'],
    queryFn: async () => (await api.get('/genieacs/devices')).data,
    retry: false,
    refetchInterval: 60000,
  });

  const act = useMutation({
    mutationFn: ({ id, op }: { id: string; op: 'reboot' | 'refresh' }) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/${op}`),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['genieacs-devices'] });
      alert(v.op === 'reboot' ? 'Perintah reboot dikirim ke ONU.' : 'Refresh diminta — data diperbarui saat ONU inform.');
    },
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/genieacs/devices/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genieacs-devices'] }),
    onError: (e: any) => alert(`Gagal hapus: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const delDevice = useMutation({
    mutationFn: (id: string) => api.delete(`/monitoring/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genieacs-devices'] }),
    onError: (e: any) => alert(`Gagal hapus: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  // Daftar pelanggan utk mengaitkan device OLT yang belum terkait.
  const { data: subs } = useQuery<{ fullName: string; customerNo: string; subscriptionId: string | null }[]>({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
    enabled: canControl,
  });
  const assign = useMutation({
    mutationFn: ({ deviceId, subscriptionId }: { deviceId: string; subscriptionId: string }) =>
      api.post(`/monitoring/devices/${deviceId}/assign`, { subscriptionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genieacs-devices'] }),
    onError: (e: any) => alert(`Gagal mengaitkan: ${e?.response?.data?.message ?? e?.message}`),
  });

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-2 font-medium">
          <RouterIcon size={16} /> ONU Pelanggan
        </h2>
        <button className="btn-ghost text-sm" onClick={() => refetch()} disabled={isFetching} title="Refresh daftar">
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Pelanggan terdeteksi otomatis dari IP WAN → sesi PPPoE. Power (RX) dari polling OLT
        via ONU yang didaftarkan di Scan (ambang: &lt; −25 warning, &lt; −27 critical).
        Ubah SSID/password WiFi, refresh, atau reboot ONU dari sini.
      </p>

      {isLoading && <p className="text-sm text-slate-400 py-4 text-center">Memuat…</p>}

      {error != null && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          Gagal membaca GenieACS: {(error as any)?.response?.data?.message ?? (error as any)?.message}.
          Isi URL GenieACS di menu <strong>Pengaturan → Integrasi</strong>
          (mis. <code className="bg-amber-100 px-1 rounded">http://IP-SERVER:7557</code>) dan arahkan ONU
          ke ACS <code className="bg-amber-100 px-1 rounded">http://IP-SERVER:7547</code>.
        </div>
      )}

      {data && (
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Serial / Model</th>
                <th className="px-3 py-2 font-medium">Pelanggan</th>
                <th className="px-3 py-2 font-medium">SSID</th>
                <th className="px-3 py-2 font-medium">IP WAN</th>
                <th className="px-3 py-2 font-medium">Power (dBm)</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Lapor</th>
                {canControl && <th className="px-3 py-2 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{d.serial ?? '—'}</div>
                    <div className="text-xs text-slate-400">{[d.manufacturer, d.model ?? d.software].filter(Boolean).join(' ')}</div>
                  </td>
                  <td className="px-3 py-2">
                    {/* Baris OLT yg pelanggannya BELUM terdeteksi → dropdown kaitkan manual (fallback). */}
                    {canControl && d.source === 'olt' && d.deviceId && !d.customerName ? (
                      <select className="input text-xs py-1 min-w-[9rem]"
                        defaultValue=""
                        disabled={assign.isPending}
                        onChange={(e) => e.target.value && assign.mutate({ deviceId: d.deviceId!, subscriptionId: e.target.value })}>
                        <option value="">{d.customerName ?? '— kaitkan pelanggan —'}</option>
                        {subs?.filter((s) => s.subscriptionId).map((s) => (
                          <option key={s.subscriptionId!} value={s.subscriptionId!}>
                            {s.fullName} ({s.customerNo})
                          </option>
                        ))}
                      </select>
                    ) : d.customerName
                      ? <span className="text-slate-700">{d.customerName}</span>
                      : <span className="text-xs text-slate-400">— tak terdeteksi —</span>}
                    {d.pppoeUser && <div className="text-xs text-slate-400 font-mono">{d.pppoeUser}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{d.ssid ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.ip ?? '—'}</td>
                  <td className={`px-3 py-2 ${dbmTone(d.rxPower ?? null)}`}>
                    {d.rxPower != null ? d.rxPower.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <span className={`badge ${d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {d.online ? 'online' : 'offline'}
                      </span>
                      {d.opticalHealth && (
                        <span className={`badge ${healthTone[d.opticalHealth] ?? 'bg-slate-100 text-slate-500'}`}>
                          {d.opticalHealth === 'ok' ? 'normal' : d.opticalHealth}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {d.lastInform ? new Date(d.lastInform).toLocaleString('id-ID') : '—'}
                  </td>
                  {canControl && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {d.acsId && (
                          <>
                            <button className="btn-ghost text-brand-600" title="Ubah WiFi" onClick={() => setWifiFor(d)}><Wifi size={15} /></button>
                            <button className="btn-ghost" title="Refresh data ONU" disabled={act.isPending} onClick={() => act.mutate({ id: d.acsId!, op: 'refresh' })}><RotateCw size={15} /></button>
                            <button className="btn-ghost text-rose-600" title="Reboot ONU" disabled={act.isPending}
                              onClick={() => { if (confirm(`Reboot ONU ${d.serial ?? d.acsId}?`)) act.mutate({ id: d.acsId!, op: 'reboot' }); }}>
                              <Power size={15} />
                            </button>
                          </>
                        )}
                        {!d.acsId && (
                          <span className="text-xs text-slate-400 mr-1" title="ONU ini hanya terpantau dari OLT (belum lapor TR-069)">OLT</span>
                        )}
                        {/* Satu tombol hapus: utamakan lepas dari monitoring OLT; bila hanya TR-069, hapus dari GenieACS. */}
                        <button className="btn-ghost text-slate-400 hover:text-rose-600" title="Hapus ONU dari daftar"
                          disabled={delDevice.isPending || del.isPending}
                          onClick={() => {
                            if (d.deviceId) {
                              if (confirm(`Hapus ONU ${d.serial ?? ''} dari monitoring? (redaman berhenti dipantau; bisa didaftarkan lagi lewat Scan)`)) delDevice.mutate(d.deviceId!);
                            } else if (d.acsId) {
                              if (confirm(`Hapus ONU ${d.serial ?? d.acsId} dari GenieACS? (ONU muncul lagi bila masih inform)`)) del.mutate(d.acsId!);
                            }
                          }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={canControl ? 8 : 7} className="px-3 py-6 text-center text-slate-400">
                  Belum ada ONU. Klik <b>Scan</b> di bawah lalu <b>Daftarkan</b> untuk memantau redaman,
                  atau arahkan ONU ke ACS <code>http://IP-SERVER:7547</code> untuk kontrol WiFi/reboot.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {wifiFor && <AcsWifiModal device={wifiFor} onClose={() => setWifiFor(null)}
        onSaved={() => { setWifiFor(null); qc.invalidateQueries({ queryKey: ['genieacs-devices'] }); }} />}
    </div>
  );
}

function AcsWifiModal({ device, onClose, onSaved }: { device: AcsDevice; onClose: () => void; onSaved: () => void }) {
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
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            save.mutate({
              ssid: (fd.get('ssid') as string) || undefined,
              password: (fd.get('password') as string) || undefined,
            });
          }} className="space-y-3">
            <label className="block text-xs text-slate-500">Nama WiFi (SSID)
              <input name="ssid" className="input mt-1" defaultValue={detail?.ssid ?? ''} placeholder="Nama WiFi" />
            </label>
            <label className="block text-xs text-slate-500">Password WiFi
              <input name="password" className="input mt-1 font-mono" defaultValue={detail?.password ?? ''} placeholder="Kosongkan = tidak diubah" />
            </label>
            {!detail?.ssidPath && <p className="text-xs text-amber-600">Parameter WiFi tidak terdeteksi pada ONU ini.</p>}
            <button className="btn-primary w-full" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" size={16} /> : <Wifi size={16} />} Terapkan ke ONU
            </button>
            <p className="text-xs text-slate-400">Dikirim via connection-request; bila ONU offline, diterapkan saat online berikutnya.</p>
          </form>
        )}
      </div>
    </div>
  );
}

/* -------------------- Scan ONU langsung dari OLT (SNMP walk) -------------------- */
interface OltLite { id: string; name: string; vendor: string }
interface WalkedOnu {
  ifIndex: number; onuId: number; dBm: number | null; health: string;
  name: string | null; description: string | null;
}

function OnuScanPanel() {
  const qc = useQueryClient();
  const [oltId, setOltId] = useState('');
  const { data: olts } = useQuery<OltLite[]>({
    queryKey: ['olts'],
    queryFn: async () => (await api.get('/olts')).data,
  });
  // ONU yg SUDAH terdaftar (agar tak muncul tombol Daftarkan lagi).
  const { data: registered } = useQuery<{ oltIfIndex: number | null; onuId: number | null }[]>({
    queryKey: ['monitoring-devices'],
    queryFn: async () => (await api.get('/monitoring/devices')).data,
  });
  const regSet = new Set((registered ?? []).map((d) => `${d.oltIfIndex}-${d.onuId}`));
  const scan = useMutation({
    mutationFn: async (id: string) => (await api.get<WalkedOnu[]>(`/olts/${id}/onus`)).data,
    onError: (e: any) => alert(`Scan gagal: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const register = useMutation({
    mutationFn: (o: WalkedOnu) =>
      api.post('/monitoring/devices/register', {
        oltId, ifIndex: o.ifIndex, onuId: o.onuId, dBm: o.dBm, name: o.name, description: o.description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['genieacs-devices'] });
      qc.invalidateQueries({ queryKey: ['monitoring-devices'] });
    },
    onError: (e: any) => alert(`Gagal mendaftarkan: ${e?.response?.data?.message ?? e?.message ?? 'error'}`),
  });
  const registerAll = async () => {
    if (!scan.data) return;
    const baru = scan.data.filter((o) => !regSet.has(`${o.ifIndex}-${o.onuId}`));
    for (const o of baru) {
      await api.post('/monitoring/devices/register', {
        oltId, ifIndex: o.ifIndex, onuId: o.onuId, dBm: o.dBm, name: o.name, description: o.description,
      }).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ['genieacs-devices'] });
    qc.invalidateQueries({ queryKey: ['monitoring-devices'] });
    alert(`${baru.length} ONU baru didaftarkan. Pelanggan terkait otomatis dari nama ONU.`);
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
                  <th className="px-3 py-2 font-medium">Deskripsi</th>
                  <th className="px-3 py-2 font-medium">RX (dBm)</th>
                  <th className="px-3 py-2 font-medium">Health</th>
                  <th className="px-3 py-2 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scan.data.map((o, i) => {
                  const sudah = regSet.has(`${o.ifIndex}-${o.onuId}`);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{o.name ?? fmtPort(o.ifIndex, o.onuId)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{o.description ?? '—'}</td>
                      <td className={`px-3 py-2 ${dbmTone(o.dBm)}`}>{o.dBm == null ? 'LOS' : o.dBm.toFixed(2)}</td>
                      <td className="px-3 py-2"><span className={`badge ${healthTone[o.health] ?? 'bg-slate-100'}`}>{o.health}</span></td>
                      <td className="px-3 py-2 text-right">
                        {sudah ? (
                          <span className="text-xs text-emerald-600 font-medium">✓ Terdaftar</span>
                        ) : (
                          <button className="btn-ghost py-1 text-xs text-brand-600"
                            disabled={register.isPending}
                            onClick={() => register.mutate(o)}
                            title="Daftarkan ke monitoring">
                            <Plus size={13} /> Daftarkan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!scan.data.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Tidak ada ONU terbaca.</td></tr>}
              </tbody>
            </table>
          </div>
          {(() => {
            const baru = scan.data.filter((o) => !regSet.has(`${o.ifIndex}-${o.onuId}`)).length;
            return baru > 0 ? (
              <button className="btn-ghost text-sm mt-2" onClick={registerAll}>
                <Plus size={14} /> Daftarkan Semua ({baru} baru)
              </button>
            ) : (
              <p className="text-xs text-emerald-600 mt-2">✓ Semua ONU sudah terdaftar.</p>
            );
          })()}
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
