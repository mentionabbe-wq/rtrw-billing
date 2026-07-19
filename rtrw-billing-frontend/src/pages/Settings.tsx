import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Trash2, Pencil, PlugZap, Server, Network, Globe, ExternalLink, CreditCard, MessageCircle, CheckCircle2, XCircle, Database, Download } from 'lucide-react';
import { api } from '@/lib/api';

interface Router {
  id: string; name: string; host: string; apiPort: number;
  apiUsername: string; status: string; hasSecret: boolean; suspendProfile: string | null;
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
  const [tab, setTab] = useState<'routers' | 'olts' | 'portal' | 'integrations' | 'backup'>('routers');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Pengaturan</h1>
      <div className="flex gap-2 border-b border-slate-200 flex-wrap">
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
        <button
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === 'portal' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('portal')}
        >
          <Globe size={15} className="mr-1 inline" /> Portal Bayar
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === 'integrations' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('integrations')}
        >
          <CreditCard size={15} className="mr-1 inline" /> Integrasi
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === 'backup' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('backup')}
        >
          <Database size={15} className="mr-1 inline" /> Backup
        </button>
      </div>
      {tab === 'routers' && <RoutersPanel />}
      {tab === 'olts' && <OltsPanel />}
      {tab === 'portal' && <PortalPanel />}
      {tab === 'integrations' && <IntegrationsPanel />}
      {tab === 'backup' && <BackupPanel />}
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
    onSuccess: (res: any) => {
      invalidate();
      const d = res?.data;
      alert(d?.ok
        ? `Mikrotik online ✓\nIdentity: ${d.identity ?? '-'}\nRouterOS: ${d.version ?? '-'} (${d.board ?? '-'})`
        : `Gagal konek Mikrotik:\n${d?.error ?? 'unknown'}\n\nCek: port API (coba 8728 spt Mikhmon), service api aktif, user/password, & firewall.`);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      name: fd.get('name'), host: fd.get('host'),
      apiPort: Number(fd.get('apiPort')) || 8728,
      apiUsername: fd.get('apiUsername'),
      suspendProfile: fd.get('suspendProfile') || '',
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
            <input name="apiPort" type="number" className="input" placeholder="Port API (8728 plain spt Mikhmon / 8729 SSL)" defaultValue={form.apiPort ?? 8728} />
            <input name="apiUsername" className="input" placeholder="User API (least-privilege)" defaultValue={form.apiUsername} required />
            <input name="apiSecret" type="password" className="input" placeholder={form.id ? 'Password API (kosongkan = tetap)' : 'Password API'} />
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
              <p className="text-xs font-medium text-blue-800">Captive Portal (opsional)</p>
              <input name="suspendProfile" className="input font-mono text-sm" placeholder="Nama PPP profile suspend (mis. suspend-profile) — kosong = internet mati total" defaultValue={form.suspendProfile ?? ''} />
              <p className="text-xs text-blue-600">Jika diisi, pelanggan suspend tetap konek ke jaringan tapi traffic di-redirect ke portal bayar. Profil ini harus sudah dibuat di Mikrotik.</p>
            </div>
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
              <option value="cdata-gpon">C-Data GPON (FD11xx/FD12xx/FD16xx)</option>
              <option value="cdata">C-Data EPON (FD11xx/FD12xx)</option>
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

/* -------------------------- Portal Panel -------------------------- */
interface BankAccount { bank: string; accountNo: string; accountName: string }
interface PortalSettings {
  companyName: string; logoUrl: string; primaryColor: string; tagline: string;
  suspendMessage: string; whatsappNumber: string; paymentInstructions: string;
  bankAccounts: BankAccount[]; footerText: string;
}

function PortalPanel() {
  const qc = useQueryClient();
  const [bankForm, setBankForm] = useState<BankAccount | null>(null);
  const [bankIdx, setBankIdx] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PortalSettings>({
    queryKey: ['portal-settings'],
    queryFn: async () => (await api.get('/portal/settings')).data,
  });

  const save = useMutation({
    mutationFn: (body: any) => api.patch('/portal/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-settings'] }),
  });

  const [color, setColor] = useState(data?.primaryColor ?? '#012b6d');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save.mutate({
      companyName: fd.get('companyName'),
      logoUrl: fd.get('logoUrl') || null,
      primaryColor: color,
      tagline: fd.get('tagline'),
      suspendMessage: fd.get('suspendMessage'),
      whatsappNumber: fd.get('whatsappNumber') || null,
      paymentInstructions: fd.get('paymentInstructions') || null,
      footerText: fd.get('footerText') || null,
    });
  }

  function saveBank(b: BankAccount) {
    const banks = [...(data?.bankAccounts ?? [])];
    if (bankIdx !== null) banks[bankIdx] = b; else banks.push(b);
    save.mutate({ bankAccounts: banks });
    setBankForm(null); setBankIdx(null);
  }

  function removeBank(i: number) {
    const banks = (data?.bankAccounts ?? []).filter((_, idx) => idx !== i);
    save.mutate({ bankAccounts: banks });
  }

  if (isLoading) return <div className="text-slate-400 py-8 text-center">Memuat…</div>;

  return (
    <div className="space-y-6">
      {/* Preview link */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Halaman Portal Bayar</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Pelanggan suspended akan diarahkan ke halaman ini via Mikrotik NAT redirect.
          </p>
        </div>
        <a href="/portal" target="_blank" rel="noopener noreferrer"
          className="btn-ghost text-brand-600 flex items-center gap-1 whitespace-nowrap text-sm">
          <ExternalLink size={14} /> Lihat Portal
        </a>
      </div>

      {/* General settings */}
      <div className="card p-5">
        <h3 className="font-semibold mb-4 text-sm text-slate-700">Identitas & Pesan</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Nama Perusahaan</label>
              <input name="companyName" className="input" defaultValue={data?.companyName} placeholder="RT/RW Net" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Tagline</label>
              <input name="tagline" className="input" defaultValue={data?.tagline} placeholder="Layanan Internet Rumahan" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Warna Utama</label>
              <div className="flex gap-2 items-center">
                <input type="color" className="h-9 w-14 rounded border border-slate-200 p-1 cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
                <input className="input flex-1 font-mono text-xs" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#012b6d" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">No. WhatsApp (tanpa +)</label>
              <input name="whatsappNumber" className="input" defaultValue={data?.whatsappNumber ?? ''} placeholder="6281234567890" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">URL Logo (opsional)</label>
            <input name="logoUrl" className="input" defaultValue={data?.logoUrl ?? ''} placeholder="https://..." />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Pesan Penangguhan</label>
            <textarea name="suspendMessage" className="input" rows={2} defaultValue={data?.suspendMessage} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Cara Pembayaran (opsional)</label>
            <textarea name="paymentInstructions" className="input" rows={3}
              defaultValue={data?.paymentInstructions ?? ''}
              placeholder="Contoh: Transfer ke rekening di bawah, lalu konfirmasi ke WhatsApp dengan kirim bukti transfer." />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Teks Footer (opsional)</label>
            <input name="footerText" className="input" defaultValue={data?.footerText ?? ''} placeholder="© 2024 RT/RW Net Anda" />
          </div>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" size={15} />} Simpan
          </button>
        </form>
      </div>

      {/* Bank accounts */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-700">Rekening Pembayaran</h3>
          <button className="btn-primary text-xs" onClick={() => { setBankForm({ bank: '', accountNo: '', accountName: '' }); setBankIdx(null); }}>
            <Plus size={14} /> Tambah Rekening
          </button>
        </div>
        {data?.bankAccounts.length === 0 && <p className="text-sm text-slate-400">Belum ada rekening. Tambah agar pelanggan tahu harus transfer ke mana.</p>}
        <div className="space-y-2">
          {data?.bankAccounts.map((b, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <div className="flex-1">
                <p className="font-semibold text-sm">{b.bank}</p>
                <p className="font-mono text-xs text-slate-600">{b.accountNo} — {b.accountName}</p>
              </div>
              <button className="btn-ghost" onClick={() => { setBankForm(b); setBankIdx(i); }}><Pencil size={14} /></button>
              <button className="btn-ghost text-rose-600" onClick={() => removeBank(i)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Mikrotik NAT instructions */}
      <div className="card p-5 border-amber-200 bg-amber-50">
        <h3 className="font-semibold text-sm text-amber-800 mb-2">Cara Setup Redirect di Mikrotik</h3>
        <p className="text-xs text-amber-700 mb-3">
          Tambahkan rule berikut di Mikrotik agar pelanggan suspended otomatis diarahkan ke halaman portal ini.
        </p>
        <pre className="bg-amber-100 rounded p-3 text-xs text-amber-900 overflow-x-auto whitespace-pre-wrap">{
`# Ganti IP_SERVER dengan IP CasaOS/server billing Anda
/ip firewall nat
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=80 \\
    action=dst-nat to-addresses=IP_SERVER to-ports=3000 comment="captive-portal"
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=443 \\
    action=dst-nat to-addresses=IP_SERVER to-ports=3000 comment="captive-portal-https"`
        }</pre>
        <p className="text-xs text-amber-700 mt-2">
          Pelanggan yang di-suspend akan masuk ke address-list <code className="bg-amber-100 px-1 rounded">isolir</code>, lalu HTTP/HTTPS-nya diarahkan ke port 3000 server billing → halaman <code className="bg-amber-100 px-1 rounded">/portal</code>.
        </p>
      </div>

      {/* Bank form modal */}
      {bankForm && (
        <Modal title={bankIdx !== null ? 'Edit Rekening' : 'Tambah Rekening'} onClose={() => { setBankForm(null); setBankIdx(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); saveBank({ bank: fd.get('bank') as string, accountNo: fd.get('accountNo') as string, accountName: fd.get('accountName') as string }); }} className="space-y-3">
            <input name="bank" className="input" placeholder="Nama Bank (mis. BRI, BCA, Mandiri)" defaultValue={bankForm.bank} required />
            <input name="accountNo" className="input font-mono" placeholder="Nomor Rekening" defaultValue={bankForm.accountNo} required />
            <input name="accountName" className="input" placeholder="Atas Nama" defaultValue={bankForm.accountName} required />
            <button className="btn-primary w-full">Simpan</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------ Integrations Panel ------------------------ */
interface IntegrationSettings {
  tripay: { hasApiKey: boolean; hasPrivateKey: boolean; merchantCode: string; mode: string; fromEnv: boolean };
  midtrans: { hasServerKey: boolean; mode: string; fromEnv: boolean };
  whatsapp: {
    apiUrl: string; hasToken: boolean; fromEnv: boolean; reminderEnabled: boolean; reminderDays: number;
    adminPhone: string; notifyEnabled: boolean;
  };
  genieacs: { url: string; username: string; hasPassword: boolean; fromEnv: boolean };
}

function ConfiguredBadge({ ok, fromEnv }: { ok: boolean; fromEnv?: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
      <CheckCircle2 size={13} /> Terkonfigurasi{fromEnv ? ' (dari env)' : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
      <XCircle size={13} /> Belum diisi
    </span>
  );
}

function IntegrationsPanel() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<IntegrationSettings>({
    queryKey: ['integration-settings'],
    queryFn: async () => (await api.get('/settings/integrations')).data,
  });

  const save = useMutation({
    mutationFn: (body: any) => api.patch('/settings/integrations', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-settings'] });
      alert('Tersimpan!');
    },
    onError: (e: any) => alert(`Gagal menyimpan: ${e?.response?.data?.message ?? e.message}`),
  });

  const testReminder = useMutation({
    mutationFn: () => api.post('/billing/reminders/send'),
    onSuccess: (res: any) =>
      alert(`Pengingat dikirim: ${res.data.sent} pesan (utk invoice jatuh tempo H-${res.data.days}).`),
    onError: (e: any) => alert(`Gagal: ${e?.response?.data?.message ?? e.message}`),
  });

  const testAcs = useMutation({
    mutationFn: () => api.get('/genieacs/devices'),
    onSuccess: (res: any) => alert(`GenieACS terhubung ✓ — ${res.data.length} perangkat terbaca.`),
    onError: (e: any) => alert(`GenieACS gagal: ${e?.response?.data?.message ?? e.message}`),
  });

  function onSubmitTripay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      tripayMerchantCode: fd.get('tripayMerchantCode'),
      tripayMode: fd.get('tripayMode'),
    };
    if (fd.get('tripayApiKey')) body.tripayApiKey = fd.get('tripayApiKey');
    if (fd.get('tripayPrivateKey')) body.tripayPrivateKey = fd.get('tripayPrivateKey');
    save.mutate(body);
  }

  function onSubmitMidtrans(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = { midtransMode: fd.get('midtransMode') };
    if (fd.get('midtransServerKey')) body.midtransServerKey = fd.get('midtransServerKey');
    save.mutate(body);
  }

  function onSubmitWa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      waApiUrl: fd.get('waApiUrl'),
      waReminderEnabled: fd.get('waReminderEnabled') === 'on',
      waReminderDays: Number(fd.get('waReminderDays')) || 3,
      waAdminPhone: fd.get('waAdminPhone'),
      waNotifyEnabled: fd.get('waNotifyEnabled') === 'on',
    };
    if (fd.get('waApiToken')) body.waApiToken = fd.get('waApiToken');
    save.mutate(body);
  }

  function onSubmitAcs(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      genieacsUrl: fd.get('genieacsUrl'),
      genieacsUsername: fd.get('genieacsUsername'),
    };
    if (fd.get('genieacsPassword')) body.genieacsPassword = fd.get('genieacsPassword');
    save.mutate(body);
  }

  if (isLoading) return <div className="text-slate-400 py-8 text-center">Memuat…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
        Konfigurasi di sini tersimpan di database (terenkripsi) dan langsung aktif tanpa
        restart. Environment variable tetap dipakai sebagai fallback bila kolom kosong.
        Field secret yang dikosongkan = nilai lama tetap dipertahankan.
      </div>

      {/* Tripay */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <CreditCard size={16} className="text-indigo-500" /> Tripay
          </h3>
          <ConfiguredBadge ok={data!.tripay.hasApiKey && data!.tripay.hasPrivateKey && !!data!.tripay.merchantCode} fromEnv={data!.tripay.fromEnv} />
        </div>
        <form onSubmit={onSubmitTripay} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Merchant Code</label>
              <input name="tripayMerchantCode" className="input font-mono" defaultValue={data?.tripay.merchantCode} placeholder="T1234" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Mode</label>
              <select name="tripayMode" className="input" defaultValue={data?.tripay.mode}>
                <option value="sandbox">Sandbox (uji coba)</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">API Key</label>
            <input name="tripayApiKey" type="password" className="input font-mono" placeholder={data?.tripay.hasApiKey ? '••••••• (kosongkan = tetap)' : 'API Key dari dashboard Tripay'} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Private Key</label>
            <input name="tripayPrivateKey" type="password" className="input font-mono" placeholder={data?.tripay.hasPrivateKey ? '••••••• (kosongkan = tetap)' : 'Private Key dari dashboard Tripay'} />
          </div>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" size={15} />} Simpan Tripay
          </button>
        </form>
      </div>

      {/* Midtrans */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <CreditCard size={16} className="text-teal-500" /> Midtrans
          </h3>
          <ConfiguredBadge ok={data!.midtrans.hasServerKey} fromEnv={data!.midtrans.fromEnv} />
        </div>
        <form onSubmit={onSubmitMidtrans} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Server Key</label>
              <input name="midtransServerKey" type="password" className="input font-mono" placeholder={data?.midtrans.hasServerKey ? '••••••• (kosongkan = tetap)' : 'SB-Mid-server-...'} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Mode</label>
              <select name="midtransMode" className="input" defaultValue={data?.midtrans.mode}>
                <option value="sandbox">Sandbox (uji coba)</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" size={15} />} Simpan Midtrans
          </button>
        </form>
      </div>

      {/* WhatsApp */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <MessageCircle size={16} className="text-emerald-500" /> WhatsApp Gateway
          </h3>
          <ConfiguredBadge ok={!!data!.whatsapp.apiUrl && data!.whatsapp.hasToken} fromEnv={data!.whatsapp.fromEnv} />
        </div>
        <form onSubmit={onSubmitWa} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">API URL</label>
            <input name="waApiUrl" className="input font-mono text-sm" defaultValue={data?.whatsapp.apiUrl} placeholder="https://api.fonnte.com/send" />
            <p className="text-xs text-slate-400 mt-1">Kompatibel Fonnte / Wablas — body: {'{ target, message }'} dengan header Authorization Bearer.</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">API Token</label>
            <input name="waApiToken" type="password" className="input font-mono" placeholder={data?.whatsapp.hasToken ? '••••••• (kosongkan = tetap)' : 'Token dari provider WA'} />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="waReminderEnabled" defaultChecked={data?.whatsapp.reminderEnabled} className="rounded" />
              Kirim pengingat pembayaran otomatis (setiap hari jam 08:00)
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              Kirim
              <input name="waReminderDays" type="number" min={0} max={14} className="input w-20 text-center" defaultValue={data?.whatsapp.reminderDays ?? 3} />
              hari sebelum jatuh tempo
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="waNotifyEnabled" defaultChecked={data?.whatsapp.notifyEnabled} className="rounded" />
              Notifikasi kejadian ke admin (ONU LOS/pulih, pembayaran masuk, voucher terjual)
            </label>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">No. WA Admin (tanpa +)</label>
              <input name="waAdminPhone" className="input" defaultValue={data?.whatsapp.adminPhone ?? ''} placeholder="6281234567890" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" size={15} />} Simpan WhatsApp
            </button>
            <button type="button" className="btn-ghost text-sm" disabled={testReminder.isPending}
              onClick={() => testReminder.mutate()}>
              {testReminder.isPending ? <Loader2 className="animate-spin" size={15} /> : <MessageCircle size={15} />}
              Kirim Pengingat Sekarang
            </button>
          </div>
        </form>
      </div>

      {/* GenieACS (TR-069) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <Network size={16} className="text-sky-500" /> GenieACS (TR-069)
          </h3>
          <ConfiguredBadge ok={!!data!.genieacs.url} fromEnv={data!.genieacs.fromEnv} />
        </div>
        <form onSubmit={onSubmitAcs} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">URL NBI GenieACS</label>
            <input name="genieacsUrl" className="input font-mono text-sm" defaultValue={data?.genieacs.url} placeholder="http://192.168.30.102:7557" />
            <p className="text-xs text-slate-400 mt-1">Port NBI GenieACS (default 7557). ONU diarahkan ke ACS di port 7547.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Username (opsional)</label>
              <input name="genieacsUsername" className="input" defaultValue={data?.genieacs.username} placeholder="kosong jika tanpa auth" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Password (opsional)</label>
              <input name="genieacsPassword" type="password" className="input" placeholder={data?.genieacs.hasPassword ? '••••••• (kosongkan = tetap)' : 'kosong jika tanpa auth'} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" size={15} />} Simpan GenieACS
            </button>
            <button type="button" className="btn-ghost text-sm" disabled={testAcs.isPending}
              onClick={() => testAcs.mutate()}>
              {testAcs.isPending ? <Loader2 className="animate-spin" size={15} /> : <PlugZap size={15} />}
              Test Koneksi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* --------------------------- Backup Panel --------------------------- */
interface BackupFile { name: string; sizeBytes: number; createdAt: string }

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

function BackupPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<BackupFile[]>({
    queryKey: ['backups'],
    queryFn: async () => (await api.get('/settings/backups')).data,
  });

  const run = useMutation({
    mutationFn: () => api.post('/settings/backups/run'),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      alert(`Backup berhasil: ${res.data.name} (${fmtSize(res.data.sizeBytes)})`);
    },
    onError: (e: any) => alert(`${e?.response?.data?.message ?? e.message}`),
  });

  async function download(name: string) {
    const res = await api.get(`/settings/backups/${encodeURIComponent(name)}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <Database size={16} className="text-indigo-500" /> Backup Database
          </h3>
          <button className="btn-primary text-sm" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            Backup Sekarang
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Backup otomatis setiap hari jam 02:00 (disimpan {`±`}2 minggu terakhir).
          Unduh berkala dan simpan di tempat lain (laptop/Nextcloud) untuk keamanan ganda.
          Restore: <code className="bg-slate-100 px-1 rounded">pg_restore -d rtrw_billing file.dump</code>
        </p>

        {isLoading && <p className="text-sm text-slate-400 py-4 text-center">Memuat…</p>}
        {data && (
          <div className="rounded-lg border border-slate-100 divide-y divide-slate-100">
            {data.map((f) => (
              <div key={f.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-mono text-xs">{f.name}</span>
                  <span className="text-xs text-slate-400 ml-3">
                    {new Date(f.createdAt).toLocaleString('id-ID')} · {fmtSize(f.sizeBytes)}
                  </span>
                </div>
                <button className="btn-ghost text-brand-600 text-xs" onClick={() => download(f.name)} title="Unduh">
                  <Download size={14} /> Unduh
                </button>
              </div>
            ))}
            {!data.length && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Belum ada backup. Klik "Backup Sekarang" — atau tunggu jadwal 02:00.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 border-amber-200 bg-amber-50 text-xs text-amber-800">
        <p className="font-semibold mb-1">Penting: mount folder backup ke host</p>
        <p>
          Agar backup tidak hilang saat container di-recreate, tambahkan volume di compose CasaOS
          (service app): <code className="bg-amber-100 px-1 rounded">- /DATA/AppData/rtrw-billing/backups:/app/backups</code>
        </p>
      </div>
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
