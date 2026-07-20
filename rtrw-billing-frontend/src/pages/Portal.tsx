import { useEffect, useState } from 'react';
import { WifiOff, MessageCircle, Building2, CreditCard, CheckCircle, Loader2, X, Upload } from 'lucide-react';

interface PortalSettings {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  tagline: string;
  suspendMessage: string;
  whatsappNumber?: string;
  paymentInstructions?: string;
  bankAccounts: { bank: string; accountNo: string; accountName: string }[];
  footerText?: string;
  qrisImage?: string | null;
}

const DEFAULT: PortalSettings = {
  companyName: 'RT/RW Net',
  primaryColor: '#012b6d',
  tagline: 'Layanan Internet Rumahan',
  suspendMessage: 'Internet Anda ditangguhkan karena belum melakukan pembayaran bulan ini.',
  bankAccounts: [],
};

export default function Portal() {
  const [cfg, setCfg] = useState<PortalSettings>(DEFAULT);
  const [claimOpen, setClaimOpen] = useState(false);

  useEffect(() => {
    fetch('/api/portal/settings')
      .then((r) => r.json())
      .then((d) => setCfg({ ...DEFAULT, ...d }))
      .catch(() => {});
  }, []);

  const waLink = cfg.whatsappNumber
    ? `https://wa.me/${cfg.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Halo, saya ingin melakukan pembayaran internet ${cfg.companyName}.`)}`
    : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div className="text-white py-6 px-4 text-center shadow-lg" style={{ backgroundColor: cfg.primaryColor }}>
        {cfg.logoUrl ? (
          <img src={cfg.logoUrl} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <WifiOff size={28} className="opacity-80" />
            <span className="text-2xl font-bold tracking-wide">{cfg.companyName}</span>
          </div>
        )}
        <p className="text-sm opacity-80">{cfg.tagline}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 gap-6 max-w-lg mx-auto w-full">
        {/* Warning card */}
        <div className="w-full rounded-2xl border border-red-200 bg-white shadow-sm p-6 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
            <WifiOff size={28} className="text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Internet Ditangguhkan</h1>
          <p className="text-slate-600 text-sm leading-relaxed">{cfg.suspendMessage}</p>
        </div>

        {/* QRIS statis */}
        {cfg.qrisImage && (
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Scan QRIS</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex justify-center">
              <img src={cfg.qrisImage} alt="QRIS" className="w-56 h-56 object-contain" />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              Setelah membayar, konfirmasi ke admin agar internet segera diaktifkan.
            </p>
          </div>
        )}

        {/* Bank accounts */}
        {cfg.bankAccounts.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Rekening Pembayaran</span>
            </div>
            <div className="space-y-2">
              {cfg.bankAccounts.map((b, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex items-center gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: cfg.primaryColor }}
                  >
                    {b.bank.slice(0, 3).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{b.bank}</p>
                    <p className="font-mono text-base tracking-widest text-slate-700">{b.accountNo}</p>
                    <p className="text-xs text-slate-500">a.n. {b.accountName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment instructions */}
        {cfg.paymentInstructions && (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={15} className="text-amber-700" />
              <span className="text-sm font-semibold text-amber-800">Cara Pembayaran</span>
            </div>
            <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">{cfg.paymentInstructions}</p>
          </div>
        )}

        {/* Konfirmasi sudah bayar + bukti transfer */}
        <button
          onClick={() => setClaimOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-white font-semibold shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: cfg.primaryColor }}
        >
          <CheckCircle size={20} />
          Saya Sudah Bayar
        </button>

        {/* WhatsApp button */}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-white font-semibold shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle size={20} />
            Hubungi via WhatsApp
          </a>
        )}

        {/* Contact number display */}
        {cfg.whatsappNumber && !waLink && (
          <p className="text-center text-sm text-slate-600">
            Hubungi: <span className="font-semibold">{cfg.whatsappNumber}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-xs text-slate-400 border-t border-slate-200">
        {cfg.footerText ?? `© ${new Date().getFullYear()} ${cfg.companyName}`}
      </div>

      {claimOpen && <PaymentClaimModal cfg={cfg} onClose={() => setClaimOpen(false)} />}
    </div>
  );
}

/* ---------- Popup konfirmasi bayar + upload bukti transfer ---------- */
function PaymentClaimModal({ cfg, onClose }: { cfg: PortalSettings; onClose: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('File harus berupa gambar (JPG/PNG).'); return; }
    if (file.size > 3 * 1024 * 1024) { setError('Ukuran gambar maksimal 3 MB.'); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setProof(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!identifier.trim()) { setError('Isi nama / no. pelanggan / user PPPoE Anda.'); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/payment-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), note: note || undefined, proofImage: proof ?? undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? `Gagal mengirim (${res.status})`);
      }
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal mengirim konfirmasi.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <>
            <CheckCircle className="text-emerald-500 mx-auto" size={44} />
            <h2 className="font-bold text-center text-slate-800">Konfirmasi Terkirim</h2>
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Bukti pembayaran Anda sudah diteruskan ke admin. Internet akan diaktifkan
              kembali setelah pembayaran diverifikasi — biasanya beberapa menit.
            </p>
            <button className="w-full py-3 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: cfg.primaryColor }} onClick={onClose}>
              Tutup
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Konfirmasi Pembayaran</h2>
              <button className="text-slate-400 hover:text-slate-600" onClick={onClose}><X size={18} /></button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Nama / No. Pelanggan / User PPPoE *</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="mis. budi001 atau C0001"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Bukti Transfer (opsional)</label>
              {proof ? (
                <div className="mt-1 relative">
                  <img src={proof} alt="Bukti" className="w-full max-h-52 object-contain rounded-lg border border-slate-200 bg-slate-50" />
                  <button
                    className="absolute top-2 right-2 rounded-full bg-white/90 p-1 shadow text-slate-500 hover:text-rose-600"
                    onClick={() => setProof(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="mt-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 py-6 cursor-pointer hover:border-slate-300">
                  <Upload size={20} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Ketuk untuk pilih foto</span>
                  <span className="text-xs text-slate-400">JPG/PNG, maks 3 MB</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onPick} />
                </label>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Catatan (opsional)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="mis. transfer BCA jam 10.00 a.n. Budi"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <button
              className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: cfg.primaryColor }}
              disabled={sending}
              onClick={submit}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Kirim Konfirmasi
            </button>
          </>
        )}
      </div>
    </div>
  );
}
