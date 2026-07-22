import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Cable, Trash2, X, Loader2, Save, Server, Box, Split, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Node {
  id: string; type: string; name: string; lat: string; lng: string;
  description: string | null; capacityTotal: number | null; capacityUsed: number | null;
  color: string | null; status: string;
}
interface CableT {
  id: string; name: string; type: string; cores: number;
  path: [number, number][]; color: string | null; description: string | null; status: string;
}

/** Kunci titik dibulatkan ~0.11m agar ujung yg di-snap dianggap sama. */
const ptKey = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/**
 * Telusuri konektivitas: mulai dari sumber (server/OLT yg up), lewati kabel &
 * titik yang up. Kabel yang tercapai = "teraliri" (animasi). Kabel/titik down
 * memutus aliran ke hilir. Kembalikan Set id kabel yang teraliri.
 */
function computeAlive(nodes: Node[], cables: CableT[]): Set<string> {
  const downPoints = new Set<string>();
  const sources: string[] = [];
  for (const n of nodes) {
    const k = ptKey(Number(n.lat), Number(n.lng));
    if (n.status === 'down') downPoints.add(k);
    else if (n.type === 'server' || n.type === 'olt') sources.push(k);
  }

  const adj = new Map<string, { id: string; other: string; up: boolean }[]>();
  for (const c of cables) {
    if (!c.path || c.path.length < 2) continue;
    const a = ptKey(c.path[0][0], c.path[0][1]);
    const b = ptKey(c.path[c.path.length - 1][0], c.path[c.path.length - 1][1]);
    const up = c.status !== 'down';
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ id: c.id, other: b, up });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ id: c.id, other: a, up });
  }

  const reachable = new Set<string>();
  const alive = new Set<string>();
  const queue = sources.filter((p) => !downPoints.has(p));
  queue.forEach((p) => reachable.add(p));
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of adj.get(p) ?? []) {
      if (!e.up) continue;                 // kabel putus → hilir mati
      alive.add(e.id);                     // kabel ini teraliri dari sisi sumber
      if (downPoints.has(e.other)) continue;
      if (!reachable.has(e.other)) { reachable.add(e.other); queue.push(e.other); }
    }
  }
  return alive;
}

const NODE_TYPES: Record<string, { label: string; color: string; icon: any }> = {
  server: { label: 'Server / POP', color: '#7c3aed', icon: Server },
  olt: { label: 'OLT', color: '#2563eb', icon: Box },
  odc: { label: 'ODC', color: '#0891b2', icon: Split },
  odp: { label: 'ODP', color: '#16a34a', icon: Split },
  pole: { label: 'Tiang', color: '#78716c', icon: MapPin },
  onu: { label: 'ONU Pelanggan', color: '#ea580c', icon: Radio },
  join: { label: 'Sambungan', color: '#db2777', icon: MapPin },
  other: { label: 'Lainnya', color: '#475569', icon: MapPin },
};

const CABLE_TYPES: Record<string, { label: string; color: string; weight: number }> = {
  backbone: { label: 'Backbone', color: '#dc2626', weight: 5 },
  distribution: { label: 'Distribusi', color: '#2563eb', weight: 3 },
  drop: { label: 'Drop / ke pelanggan', color: '#16a34a', weight: 2 },
};

function nodeIcon(type: string, color?: string | null) {
  const c = color || NODE_TYPES[type]?.color || '#475569';
  return L.divIcon({
    className: 'rtrw-node-marker',
    html: `<div style="background:${c};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18],
  });
}

/** Tangkap klik peta saat mode "tambah titik" atau "gambar kabel". */
function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function NetworkMap() {
  const qc = useQueryClient();
  const canEdit = useCan('customers.write');
  const { data } = useQuery<{ nodes: Node[]; cables: CableT[] }>({
    queryKey: ['map'],
    queryFn: async () => (await api.get('/map')).data,
  });

  // Mode interaksi: null | 'add-node' | 'draw-cable'
  const [mode, setMode] = useState<null | 'add-node' | 'draw-cable'>(null);
  const [draft, setDraft] = useState<[number, number][]>([]); // titik kabel yg sedang digambar
  const [nodeForm, setNodeForm] = useState<Partial<Node> | null>(null);
  const [cableForm, setCableForm] = useState<Partial<CableT> | null>(null);

  const center = useMemo<[number, number]>(() => {
    const n = data?.nodes?.[0];
    if (n) return [Number(n.lat), Number(n.lng)];
    return [-6.2, 106.816]; // default Jakarta; geser ke lokasi Anda lalu simpan node pertama
  }, [data]);

  // Kabel yang teraliri (untuk animasi) — dihitung ulang tiap data berubah.
  const alive = useMemo(() => computeAlive(data?.nodes ?? [], data?.cables ?? []), [data]);

  /** Tempelkan klik ke titik/ujung kabel terdekat (~20m) supaya tersambung. */
  function snap(lat: number, lng: number): [number, number] {
    const thr = 0.0002; // ~22m
    let best: [number, number] | null = null;
    let bestD = thr;
    for (const n of data?.nodes ?? []) {
      const d = Math.hypot(Number(n.lat) - lat, Number(n.lng) - lng);
      if (d < bestD) { bestD = d; best = [Number(n.lat), Number(n.lng)]; }
    }
    for (const c of data?.cables ?? []) {
      for (const end of [c.path[0], c.path[c.path.length - 1]]) {
        if (!end) continue;
        const d = Math.hypot(end[0] - lat, end[1] - lng);
        if (d < bestD) { bestD = d; best = [end[0], end[1]]; }
      }
    }
    return best ?? [Number(lat.toFixed(7)), Number(lng.toFixed(7))];
  }

  const saveNode = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: any }) =>
      id ? api.patch(`/map/nodes/${id}`, body) : api.post('/map/nodes', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['map'] }); setNodeForm(null); },
    onError: () => alert('Gagal menyimpan titik.'),
  });
  const delNode = useMutation({
    mutationFn: (id: string) => api.delete(`/map/nodes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['map'] }); setNodeForm(null); },
  });
  const saveCable = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: any }) =>
      id ? api.patch(`/map/cables/${id}`, body) : api.post('/map/cables', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['map'] }); setCableForm(null); setDraft([]); },
    onError: () => alert('Gagal menyimpan kabel.'),
  });
  const delCable = useMutation({
    mutationFn: (id: string) => api.delete(`/map/cables/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['map'] }); setCableForm(null); },
  });

  function onMapClick(lat: number, lng: number) {
    if (mode === 'add-node') {
      const [sl, sn] = snap(lat, lng);
      setNodeForm({ type: 'odp', name: '', lat: String(sl), lng: String(sn) });
      setMode(null);
    } else if (mode === 'draw-cable') {
      setDraft((d) => [...d, snap(lat, lng)]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Peta Jaringan</h1>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {mode === 'draw-cable' ? (
              <>
                <span className="text-sm text-slate-500 self-center">
                  Klik peta untuk menambah titik belok ({draft.length} titik)…
                </span>
                <button className="btn-primary text-sm" disabled={draft.length < 2}
                  onClick={() => setCableForm({ name: '', type: 'distribution', cores: 12, path: draft })}>
                  <Save size={15} /> Selesai
                </button>
                <button className="btn-ghost text-sm" onClick={() => { setMode(null); setDraft([]); }}>Batal</button>
              </>
            ) : mode === 'add-node' ? (
              <>
                <span className="text-sm text-slate-500 self-center">Klik peta untuk menaruh titik…</span>
                <button className="btn-ghost text-sm" onClick={() => setMode(null)}>Batal</button>
              </>
            ) : (
              <>
                <button className="btn-ghost text-sm" onClick={() => setMode('add-node')}>
                  <MapPin size={15} /> Tambah Titik
                </button>
                <button className="btn-ghost text-sm" onClick={() => { setMode('draw-cable'); setDraft([]); }}>
                  <Cable size={15} /> Gambar Kabel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="card p-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {Object.entries(NODE_TYPES).slice(0, 6).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: v.color }} /> {v.label}
          </span>
        ))}
        <span className="w-px bg-slate-200 mx-1" />
        {Object.entries(CABLE_TYPES).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-1 rounded" style={{ background: v.color }} /> {v.label}
          </span>
        ))}
        <span className="w-px bg-slate-200 mx-1" />
        <span className="text-slate-400">Garis bergerak = teraliri · abu-abu = putus/tak tersambung</span>
      </div>

      <div className="card overflow-hidden" style={{ height: '70vh' }}>
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {(mode === 'add-node' || mode === 'draw-cable') && <ClickHandler onClick={onMapClick} />}

          {/* Kabel tersimpan */}
          {data?.cables.map((c) => {
            const t = CABLE_TYPES[c.type] ?? CABLE_TYPES.distribution;
            const isAlive = c.status !== 'down' && alive.has(c.id);
            return (
              <Polyline
                key={`${c.id}-${isAlive}`}
                positions={c.path}
                pathOptions={{
                  color: isAlive ? (c.color || t.color) : '#94a3b8',
                  weight: t.weight,
                  opacity: isAlive ? 1 : 0.55,
                  className: isAlive ? 'fiber-flow' : '',
                  dashArray: c.status === 'down' ? '4 8' : undefined,
                }}
                eventHandlers={{ click: () => canEdit && setCableForm(c) }}
              >
                <Popup>
                  <b>{c.name}</b><br />
                  {t.label} · {c.cores} core<br />
                  Status: {isAlive ? '🟢 teraliri' : c.status === 'down' ? '🔴 putus' : '⚪ tidak tersambung ke sumber'}
                  {c.description && <><br />{c.description}</>}
                </Popup>
              </Polyline>
            );
          })}

          {/* Kabel yang sedang digambar */}
          {draft.length > 0 && (
            <Polyline positions={draft} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '6 6' }} />
          )}

          {/* Titik */}
          {data?.nodes.map((n) => (
            <Marker key={`${n.id}-${n.status}`} position={[Number(n.lat), Number(n.lng)]}
              icon={nodeIcon(n.type, n.status === 'down' ? '#94a3b8' : n.color)}
              eventHandlers={{ click: () => canEdit && setNodeForm(n) }}>
              <Popup>
                <b>{n.name}</b> {n.status === 'down' && '🔴'}<br />
                {NODE_TYPES[n.type]?.label ?? n.type}
                {n.capacityTotal != null && <><br />Port: {n.capacityUsed ?? 0}/{n.capacityTotal}</>}
                {n.description && <><br />{n.description}</>}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {!data?.nodes.length && (
        <p className="text-sm text-slate-400">
          Belum ada data. Klik <strong>Tambah Titik</strong>, geser peta ke lokasi Anda, lalu klik untuk menaruh
          OLT/ODP pertama. Setelah itu gambar jalur kabel dengan <strong>Gambar Kabel</strong>.
        </p>
      )}

      {nodeForm && (
        <NodeModal
          node={nodeForm}
          onClose={() => setNodeForm(null)}
          onSave={(body) => saveNode.mutate({ id: nodeForm.id, body })}
          onDelete={nodeForm.id ? () => confirm('Hapus titik ini?') && delNode.mutate(nodeForm.id!) : undefined}
          saving={saveNode.isPending}
        />
      )}
      {cableForm && (
        <CableModal
          cable={cableForm}
          onClose={() => { setCableForm(null); setDraft([]); }}
          onSave={(body) => saveCable.mutate({ id: cableForm.id, body: { ...body, path: cableForm.path } })}
          onDelete={cableForm.id ? () => confirm('Hapus kabel ini?') && delCable.mutate(cableForm.id!) : undefined}
          saving={saveCable.isPending}
        />
      )}
    </div>
  );
}

function NodeModal({ node, onClose, onSave, onDelete, saving }: {
  node: Partial<Node>; onClose: () => void; onSave: (b: any) => void; onDelete?: () => void; saving: boolean;
}) {
  const [type, setType] = useState(node.type ?? 'odp');
  const [status, setStatus] = useState(node.status ?? 'up');
  const isSplitter = type === 'odp' || type === 'odc';
  return (
    <Modal title={node.id ? 'Edit Titik' : 'Tambah Titik'} onClose={onClose} onDelete={onDelete}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          type, status,
          name: fd.get('name'),
          lat: node.lat, lng: node.lng,
          description: fd.get('description') || null,
          capacityTotal: fd.get('capacityTotal') ? Number(fd.get('capacityTotal')) : null,
          capacityUsed: fd.get('capacityUsed') ? Number(fd.get('capacityUsed')) : null,
        });
      }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Jenis</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(NODE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="up">🟢 Aktif</option>
              <option value="down">🔴 Mati / Putus</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Nama</label>
          <input name="name" className="input" defaultValue={node.name} placeholder="mis. ODP-03 Gg. Melati" required />
        </div>
        {isSplitter && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Kapasitas total</label>
              <input name="capacityTotal" type="number" className="input" defaultValue={node.capacityTotal ?? ''} placeholder="mis. 8" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Terpakai</label>
              <input name="capacityUsed" type="number" className="input" defaultValue={node.capacityUsed ?? ''} placeholder="mis. 5" />
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Catatan</label>
          <textarea name="description" className="input" rows={2} defaultValue={node.description ?? ''} placeholder="mis. splitter 1:8, di tiang PLN depan warung" />
        </div>
        <p className="text-xs text-slate-400">Koordinat: {Number(node.lat).toFixed(6)}, {Number(node.lng).toFixed(6)}</p>
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan
        </button>
      </form>
    </Modal>
  );
}

function CableModal({ cable, onClose, onSave, onDelete, saving }: {
  cable: Partial<CableT>; onClose: () => void; onSave: (b: any) => void; onDelete?: () => void; saving: boolean;
}) {
  return (
    <Modal title={cable.id ? 'Edit Kabel' : 'Simpan Kabel'} onClose={onClose} onDelete={onDelete}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          name: fd.get('name'),
          type: fd.get('type'),
          cores: Number(fd.get('cores')) || 12,
          status: fd.get('status'),
          description: fd.get('description') || null,
        });
      }} className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Nama</label>
          <input name="name" className="input" defaultValue={cable.name} placeholder="mis. Backbone OLT → ODC-1" required />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Jenis</label>
            <select name="type" className="input" defaultValue={cable.type ?? 'distribution'}>
              {Object.entries(CABLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Core</label>
            <input name="cores" type="number" className="input" defaultValue={cable.cores ?? 12} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Status</label>
            <select name="status" className="input" defaultValue={cable.status ?? 'up'}>
              <option value="up">🟢 Aktif</option>
              <option value="down">🔴 Putus</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Catatan</label>
          <textarea name="description" className="input" rows={2} defaultValue={cable.description ?? ''} />
        </div>
        <p className="text-xs text-slate-400">{cable.path?.length ?? 0} titik lintasan.</p>
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, onDelete, children }: {
  title: string; onClose: () => void; onDelete?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <div className="flex items-center gap-1">
            {onDelete && (
              <button className="btn-ghost text-rose-600" title="Hapus" onClick={onDelete}><Trash2 size={16} /></button>
            )}
            <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
