import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Trash2, Pencil, PlugZap, Server, Network } from 'lucide-react';
import { api } from '@/lib/api';

interface Router {
  id: string; name: string; host: string; apiPort: number;
  apiUsername: string; status: string; hasSecret: boolean;
}
interface Olt {
  id: string; name: string; host: string; vendor: string; snmpVersion: string;
  snmpUser: string; status: string; hasAuthKey: boolean; hasPrivKey: boolean;
}

const statusTone: Record<string, string> = {
  online: 'bg-emerald-50 text-emerald-700',
  offline: 'bg-rose-50 text-rose-700',
  unknown: 'bg-slate-100 text-slate-500',
};

export default function Settings() {
  const [tab, setTab] = useState<'routers' | 'olts'>('routers');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Pengaturan Perangkat</h1>
      <div className="flex gap-2 border-b border-slate-200">
        <button
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === 'routers' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('routers')}
        >
          <Server size={15} className="mr-1 inline" /> Router Mikrotik
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === 'olts' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('olts')}
        >
          <Network size={15} className="mr-1 inline" /> OLT (SNMP)
        </button>
      </div>
      {tab === 'routers' ? <RoutersPanel /> : <OltsPanel />}
    </div>
  );
}

/* ----------------------------- Routers ----------------------------- */
function RoutersPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Router> | null>(null);

  const { data, isLoading } = useQuery<Router[]>({
    queryKey: ['routers'],
    queryFn: async () => (await api.get('/routers')).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['routers'] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: any }) =>
      id ? api.patch(`/routers/${id}`, body) : api.post('/routers', body),
    onSuccess: () => { invalidate(); setForm(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/routers/${id}`),
    onSuccess: invalidate,
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/routers/${id}/test`),
    onSuccess: invalidate,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      name: fd.get('name'), host: fd.get('host'),
      apiPort: Number(fd.get('apiPort')) || 8729,
      apiUsername: fd.get('apiUsername'),
    };
    const secret = fd.get('apiSecret') as string;
    if (secret) body.apiSecret = secret;
    save.mutate({ id: form?.id, body });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> Tambah Router</button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Host:Port</th>
                <th className="px-4 py-3 font-medium">User API</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.host}:{r.apiPort}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.apiUsername}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusTone[r.status] ?? 'bg-slate-100'}`}>{r.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost text-brand-600" title="Test koneksi" disabled={test.isPending} onClick={() => test.mutate(r.id)}><PlugZap size={16} /></button>
                      <button className="btn-ghost" title="Edit" onClick={() => setForm(r)}><Pencil size={16} /></button>
                      <button className="btn-ghost text-rose-600" title="Hapus" onClick={() => confirm(`Hapus router ${r.name}?`) && del.mutate(r.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada router.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit Router' : 'Tambah Router'} onClose={() => setForm(null)}>
          <form onSubmit={onSubmit} className="space-y-3">
            <input name="name" className="input" placeholder="Nama" defaultValue={form.name} required />
            <input name="host" className="input" placeholder="Host / IP (mis. 192.168.88.1)" defaultValue={form.host} required />
            <input name="apiPort" type="number" className="input" placeholder="Port API-SSL" defaultValue={form.apiPort ?? 8729} />
            <input name="apiUsername" className="input" placeholder="User API (least-privilege)" defaultValue={form.apiUsername} required />
            <input name="apiSecret" type="password" className="input" placeholder={form.id ? 'Password API (kosongkan = tetap)' : 'Password API'} />
            {save.isError && <p className="text-sm text-red-600">Gagal menyimpan.</p>}
            <button className="btn-primary w-full" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" size={16} />} Simpan</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------ OLTs ------------------------------ */
function OltsPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Olt> | null>(null);

  const { data, isLoading } = useQuery<Olt[]>({
    queryKey: ['olts'],
    queryFn: async () => (await api.get('/olts')).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['olts'] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: any }) =>
      id ? api.patch(`/olts/${id}`, body) : api.post('/olts', body),
    onSuccess: () => { invalidate(); setForm(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/olts/${id}`),
    onSuccess: invalidate,
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/olts/${id}/test`),
    onSuccess: (res: any) => {
      invalidate();
      const d = res?.data;
      alert(d?.ok ? `OLT online ✓\n${d.description ?? ''}` : `OLT gagal koneksi:\n${d?.error ?? 'unknown'}`);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      name: fd.get('name'), host: fd.get('host'),
      vendor: fd.get('vendor'), snmpVersion: fd.get('snmpVersion'),
      snmpUser: fd.get('snmpUser'),
    };
    if (fd.get('snmpAuthKey')) body.snmpAuthKey = fd.get('snmpAuthKey');
    if (fd.get('snmpPrivKey')) body.snmpPrivKey = fd.get('snmpPrivKey');
    save.mutate({ id: form?.id, body });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> Tambah OLT</button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">SNMP User</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{o.host}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-brand-50 text-brand-700 uppercase">{o.vendor}</span>
                    <span className="badge ml-1 bg-slate-100 text-slate-500 uppercase">{o.snmpVersion ?? 'v3'}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{o.snmpUser}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost text-brand-600" title="Test koneksi" disabled={test.isPending} onClick={() => test.mutate(o.id)}><PlugZap size={16} /></button>
                      <button className="btn-ghost" title="Edit" onClick={() => setForm(o)}><Pencil size={16} /></button>
                      <button className="btn-ghost text-rose-600" title="Hapus" onClick={() => confirm(`Hapus OLT ${o.name}?`) && del.mutate(o.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada OLT.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit OLT' : 'Tambah OLT'} onClose={() => setForm(null)}>
          <form onSubmit={onSubmit} className="space-y-3">
            <input name="name" className="input" placeholder="Nama" defaultValue={form.name} required />
            <input name="host" className="input" placeholder="Host / IP" defaultValue={form.host} required />
            <select name="vendor" className="input" defaultValue={form.vendor ?? 'zte'}>
              <option value="zte">ZTE (C300/C320)</option>
              <option value="huawei">Huawei (MA56xx/MA58xx)</option>
              <option value="cdata">C-Data (FD11xx/FD12xx)</option>
              <option value="generic">Generic</option>
            </select>
            <select name="snmpVersion" className="input" defaultValue={form.snmpVersion ?? 'v3'}>
              <option value="v3">SNMP v3 (authPriv) — ZTE/Huawei</option>
              <option value="v2c">SNMP v2c (community) — C-Data/EPON</option>
            </select>
            <input name="snmpUser" className="input" placeholder="SNMPv3 user / v2c community" defaultValue={form.snmpUser} required />
            <p className="text-xs text-slate-400 -mt-1">Untuk v2c: isi community (mis. <span className="font-mono">public</span>) di kolom atas; auth/priv key di bawah dikosongkan.</p>
            <input name="snmpAuthKey" type="password" className="input" placeholder={form.id ? 'Auth key (kosongkan = tetap)' : 'SNMPv3 auth key (SHA) — kosongkan utk v2c'} />
            <input name="snmpPrivKey" type="password" className="input" placeholder={form.id ? 'Priv key (kosongkan = tetap)' : 'SNMPv3 priv key (AES) — kosongkan utk v2c'} />
            {save.isError && <p className="text-sm text-red-600">Gagal menyimpan.</p>}
            <button className="btn-primary w-full" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" size={16} />} Simpan</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------- Modal ----------------------------- */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
