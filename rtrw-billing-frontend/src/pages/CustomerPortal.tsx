import { useEffect, useState } from 'react';
import {
  Wifi, Receipt, CheckCircle, Loader2, LogIn, X, Upload, Eye, EyeOff, RefreshCw, AlertCircle,
} from 'lucide-react';

interface PortalCfg {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  tagline: string;
  qrisImage?: string | null;
  bankAccounts: { bank: string; accountNo: string; accountName: string }[];
  whatsappNumber?: string;
}

interface Overview {
  customer: { fullName: string; customerNo: string; status: string };
  subscription: {
    pppoeUser: string; status: string; dueDate: string;
    packageName: string | null; rateLimit: string | null; price: string | null;
  } | null;
  invoices: { id: string; invoiceNo: string; amount: string; status: string; dueDate: string; periodStart: string }[];
  payments: { id: string; amount: string; method: string | null; paidAt: string | null; invoiceNo: string | null }[];
  wifi: { deviceId: string; ssid: string | null; online: boolean } | null;
}

const rupiah = (v: string | number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

const tanggal = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const CFG_DEFAULT: PortalCfg = {
  companyName: 'RT/RW Net',
  primaryColor: '#012b6d',
  tagline: 'Layanan Internet Rumahan',
  bankAccounts: [],
};

export default function CustomerPortal() {
  const [cfg, setCfg] = useState<PortalCfg>(CFG_DEFAULT);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('portalToken'));
  const [data, setData] = useState<Overview | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    fetch('/api/portal/settings').then((r) => r.json())
      .then((d) => setCfg({ ...CFG_DEFAULT, ...d })).catch(() => {});
  }, []);

  // Coba kenali otomatis dari IP; bila sudah punya token, muat ulang data.
  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const res = await fetch('/api/portal/customer/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) { setData(await res.json()); return; }
          sessionStorage.removeItem('portalToken');
          setToken(null);
        }
        const res = await fetch('/api/portal/customer/identify', { method: 'POST' });
        const j = await res.json();
        if (j.identified) {
          sessionStorage.setItem('portalToken', j.token);
          setToken(j.token);
          setData(j.data);
        }
      } catch { /* tampilkan form login */ } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    if (!token) return;
    const res = await fetch('/api/portal/customer/me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setData(await res.json());
  }

  function logout() {
    sessionStorage.removeItem('portalToken');
    setToken(null);
    setData(null);
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="text-white py-5 px-4 text-center shadow-lg" style={{ backgroundColor: cfg.primaryColor }}>
        {cfg.logoUrl
          ? <img src={cfg.logoUrl} alt="logo" className="h-12 mx-auto mb-2 object-contain" />
          : <Wifi size={26} className="mx-auto mb-1 opacity-90" />}
        <h1 className="text-xl font-bold">{cfg.companyName}</h1>
        <p className="text-xs opacity-80">{data ? 'Portal Pelanggan' : cfg.tagline}</p>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 space-y-4">
        {!data
          ? <LoginCard cfg={cfg} onLogin={(t, d) => { sessionStorage.setItem('portalToken', t); setToken(t); setData(d); }} />
          : <Dashboard cfg={cfg} data={data} token={token!} onReload={reload} onLogout={logout} />}
      </main>

      <footer className="text-center py-4 text-xs text-slate-400 border-t border-slate-200">
        © {new Date().getFullYear()} {cfg.companyName}
      </footer>
    </div>
  );
}

/* ------------------------------ Login ------------------------------ */
function LoginCard({ cfg, onLogin }: { cfg: PortalCfg; onLogin: (token: string, data: Overview) => void }) {
  const [customerNo, setCustomerNo] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/portal/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerNo, phoneLast4 }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.message ?? 'Login gagal.'); return; }
      onLogin(j.token, j.data);
    } catch {
      setErr('Tidak dapat terhubung ke server.');
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
      <div className="text-center">
        <LogIn size={28} className="mx-auto mb-2" style={{ color: cfg.primaryColor }} />
        <h2 className="font-bold text-slate-800">Masuk Portal Pelanggan</h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Kami tidak dapat mengenali koneksi Anda secara otomatis. Masuk dengan
          no. pelanggan dan 4 digit terakhir nomor HP yang terdaftar.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">No. Pelanggan</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
            placeholder="mis. C0001" value={customerNo} onChange={(e) => setCustomerNo(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">4 Digit Terakhir No. HP</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tracking-widest outline-none focus:border-slate-400"
            placeholder="1234" inputMode="numeric" maxLength={4}
            value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, ''))} required />
        </div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <button className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: cfg.primaryColor }} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Masuk
        </button>
      </form>

      {cfg.whatsappNumber && (
        <p className="text-center text-xs text-slate-400">
          Lupa data? <a className="underline" href={`https://wa.me/${cfg.whatsappNumber.replace(/\D/g, '')}`}
            target="_blank" rel="noopener noreferrer">Hubungi admin</a>
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Dashboard ---------------------------- */
function Dashboard({ cfg, data, token, onReload, onLogout }: {
  cfg: PortalCfg; data: Overview; token: string; onReload: () => void; onLogout: () => void;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);

  const unpaid = data.invoices.filter((i) => i.status === 'unpaid');
  const totalUnpaid = unpaid.reduce((s, i) => s + Number(i.amount), 0);
  const sub = data.subscription;
  const aktif = sub?.status === 'active';

  return (
    <>
      {/* Identitas + status */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-slate-800">{data.customer.fullName}</p>
            <p className="font-mono text-xs text-slate-400">{data.customer.customerNo}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {aktif ? 'Aktif' : sub?.status ?? data.customer.status}
          </span>
        </div>
        {sub && (
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Paket</dt>
              <dd className="font-medium">{sub.packageName ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Kecepatan</dt>
              <dd className="font-mono text-xs">{sub.rateLimit ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Jatuh tempo</dt>
              <dd className="font-medium">{tanggal(sub.dueDate)}</dd></div>
          </dl>
        )}
      </div>

      {/* Tagihan */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-sm mb-3">
          <Receipt size={16} style={{ color: cfg.primaryColor }} /> Tagihan
        </h2>

        {unpaid.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <CheckCircle size={18} className="text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800">Tidak ada tagihan tertunggak. Terima kasih! 🎉</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-3">
              <p className="text-xs text-amber-700">Total belum dibayar</p>
              <p className="text-2xl font-extrabold text-amber-900">{rupiah(totalUnpaid)}</p>
              <p className="text-xs text-amber-700 mt-0.5">{unpaid.length} tagihan</p>
            </div>
            <div className="space-y-1.5">
              {unpaid.map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{i.periodStart?.slice(0, 7) ?? i.invoiceNo}</span>
                  <span className="font-medium">{rupiah(i.amount)}</span>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: cfg.primaryColor }} onClick={() => setPayOpen(true)}>
              <CheckCircle size={16} /> Bayar & Konfirmasi
            </button>
          </>
        )}
      </div>

      {/* WiFi */}
      {data.wifi ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-sm mb-3">
            <Wifi size={16} style={{ color: cfg.primaryColor }} /> WiFi Rumah
          </h2>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-slate-500 text-xs">Nama WiFi saat ini</p>
              <p className="font-medium">{data.wifi.ssid ?? '—'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              data.wifi.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {data.wifi.online ? 'online' : 'offline'}
            </span>
          </div>
          <button className="mt-4 w-full py-2.5 rounded-xl border text-sm font-semibold"
            style={{ borderColor: cfg.primaryColor, color: cfg.primaryColor }}
            onClick={() => setWifiOpen(true)}>
            Ubah Nama & Password WiFi
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-start gap-2">
          <AlertCircle size={16} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Pengaturan WiFi mandiri belum tersedia untuk perangkat Anda. Hubungi admin
            bila ingin mengubah nama atau password WiFi.
          </p>
        </div>
      )}

      {/* Riwayat pembayaran */}
      {data.payments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 text-sm mb-3">Riwayat Pembayaran</h2>
          <div className="space-y-2">
            {data.payments.slice(0, 6).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <p className="font-medium">{rupiah(p.amount)}</p>
                  <p className="text-xs text-slate-400">{tanggal(p.paidAt)} · {p.method ?? '—'}</p>
                </div>
                <CheckCircle size={16} className="text-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 flex items-center justify-center gap-1"
          onClick={onReload}>
          <RefreshCw size={14} /> Muat ulang
        </button>
        <button className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-500"
          onClick={onLogout}>
          Keluar
        </button>
      </div>

      {payOpen && <PayModal cfg={cfg} token={token} onClose={() => setPayOpen(false)} />}
      {wifiOpen && data.wifi && (
        <WifiModal cfg={cfg} token={token} currentSsid={data.wifi.ssid}
          onClose={() => setWifiOpen(false)} onSaved={() => { setWifiOpen(false); onReload(); }} />
      )}
    </>
  );
}

/* ------------------- Modal bayar + bukti transfer ------------------- */
function PayModal({ cfg, token, onClose }: { cfg: PortalCfg; token: string; onClose: () => void }) {
  const [proof, setProof] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr('File harus gambar.'); return; }
    if (f.size > 3 * 1024 * 1024) { setErr('Maksimal 3 MB.'); return; }
    setErr(null);
    const r = new FileReader();
    r.onload = () => setProof(String(r.result));
    r.readAsDataURL(f);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/portal/customer/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: note || undefined, proofImage: proof ?? undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal mengirim');
      setSent(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 my-8" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <>
            <CheckCircle className="text-emerald-500 mx-auto" size={44} />
            <h2 className="font-bold text-center text-slate-800">Konfirmasi Terkirim</h2>
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Admin akan memverifikasi pembayaran Anda. Layanan aktif kembali setelah diverifikasi.
            </p>
            <button className="w-full py-3 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: cfg.primaryColor }} onClick={onClose}>Tutup</button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Bayar & Konfirmasi</h2>
              <button className="text-slate-400" onClick={onClose}><X size={18} /></button>
            </div>

            {cfg.qrisImage && (
              <div className="text-center">
                <p className="text-xs font-medium text-slate-600 mb-2">Scan QRIS</p>
                <img src={cfg.qrisImage} alt="QRIS" className="w-48 h-48 object-contain mx-auto rounded-xl border border-slate-200 p-2" />
              </div>
            )}

            {cfg.bankAccounts?.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-medium text-slate-600">Atau transfer ke:</p>
                {cfg.bankAccounts.map((b, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold">{b.bank}</span> <span className="font-mono">{b.accountNo}</span>
                    <div className="text-xs text-slate-400">a.n. {b.accountName}</div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-600">Bukti Transfer (opsional)</label>
              {proof ? (
                <div className="mt-1 relative">
                  <img src={proof} alt="bukti" className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50" />
                  <button className="absolute top-2 right-2 rounded-full bg-white/90 p-1 shadow text-slate-500"
                    onClick={() => setProof(null)}><X size={14} /></button>
                </div>
              ) : (
                <label className="mt-1 flex flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-200 py-5 cursor-pointer">
                  <Upload size={18} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Ketuk untuk pilih foto</span>
                  <input type="file" accept="image/*" className="hidden" onChange={pick} />
                </label>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Catatan (opsional)</label>
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="mis. transfer BCA jam 10.00" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {err && <p className="text-xs text-rose-600">{err}</p>}

            <button className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: cfg.primaryColor }} disabled={busy} onClick={submit}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Kirim Konfirmasi
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------- Modal ubah WiFi (TR-069) --------------------- */
function WifiModal({ cfg, token, currentSsid, onClose, onSaved }: {
  cfg: PortalCfg; token: string; currentSsid: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [ssid, setSsid] = useState(currentSsid ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/portal/customer/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ssid: ssid !== currentSsid ? ssid : undefined,
          password: password || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal mengubah WiFi');
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <CheckCircle className="text-emerald-500 mx-auto" size={44} />
            <h2 className="font-bold text-center text-slate-800">Perubahan Dikirim</h2>
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Pengaturan baru sedang diterapkan ke perangkat. Perangkat yang terhubung
              akan terputus sesaat — sambungkan ulang dengan nama/password baru.
            </p>
            <button className="w-full py-3 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: cfg.primaryColor }} onClick={onSaved}>Selesai</button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Ubah WiFi</h2>
              <button className="text-slate-400" onClick={onClose}><X size={18} /></button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Nama WiFi (SSID)</label>
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Nama WiFi" />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Password Baru</label>
              <div className="mt-1 flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
                  type={show ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Kosongkan = tidak diubah" />
                <button type="button" className="px-3 rounded-lg border border-slate-200 text-slate-500"
                  onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">Minimal 8 karakter.</p>
            </div>

            {err && <p className="text-xs text-rose-600">{err}</p>}

            <button className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: cfg.primaryColor }} disabled={busy} onClick={submit}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} Simpan Perubahan
            </button>
          </>
        )}
      </div>
    </div>
  );
}
