import { useEffect, useState } from 'react';
import { WifiOff, MessageCircle, Building2, CreditCard } from 'lucide-react';

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
    </div>
  );
}
