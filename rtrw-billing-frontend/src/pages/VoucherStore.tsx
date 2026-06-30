import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Wifi, ShoppingCart, CheckCircle, Clock, Loader2, ExternalLink, Copy } from 'lucide-react';
import { api } from '@/lib/api';

interface Package {
  id: number;
  name: string;
  durationMinutes: number;
  price: string;
  mikrotikProfile: string;
}

interface Router {
  id: string;
  name: string;
  status: string;
}

interface PortalSettings {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  tagline: string;
}

interface VoucherResult {
  code: string;
  username: string;
  password: string | null;
  status: string;
  packageName: string | null;
  durationMinutes: number | null;
  buyerName: string | null;
}

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

const fmtDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} Menit`;
  if (minutes < 1440) return `${minutes / 60} Jam`;
  if (minutes < 10080) return `${minutes / 1440} Hari`;
  return `${minutes / 10080} Minggu`;
};

export default function VoucherStore() {
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code');

  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ buyerName: '', buyerPhone: '', gateway: 'tripay' });
  const [payLinkResult, setPayLinkResult] = useState<{ code: string; url: string } | null>(null);

  const { data: settings } = useQuery<PortalSettings>({
    queryKey: ['portal-settings'],
    queryFn: async () => (await api.get('/portal/settings')).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: packages, isLoading: pkgLoading } = useQuery<Package[]>({
    queryKey: ['hotspot-packages'],
    queryFn: async () => (await api.get('/hotspot/packages')).data,
  });

  const { data: routers } = useQuery<Router[]>({
    queryKey: ['hotspot-routers'],
    queryFn: async () => (await api.get('/hotspot/routers')).data,
  });

  const { data: voucherResult, refetch: refetchVoucher } = useQuery<VoucherResult | null>({
    queryKey: ['voucher-status', codeFromUrl],
    queryFn: async () => {
      if (!codeFromUrl) return null;
      const res = await api.get(`/hotspot/voucher/${codeFromUrl}`);
      return res.data;
    },
    enabled: !!codeFromUrl,
    refetchInterval: (data) => (data?.status === 'pending' ? 5000 : false),
  });

  const defaultRouter = routers?.[0];

  const purchase = useMutation({
    mutationFn: (body: any) => api.post('/hotspot/purchase', body),
    onSuccess: (res) => {
      setPayLinkResult({ code: res.data.code, url: res.data.paymentUrl });
      setShowForm(false);
    },
    onError: (e: any) => alert(`Gagal membuat pembayaran: ${e?.response?.data?.message ?? e.message}`),
  });

  const handleBuy = () => {
    if (!selectedPkg || !defaultRouter) return;
    purchase.mutate({
      packageId: selectedPkg.id,
      routerId: defaultRouter.id,
      buyerName: form.buyerName,
      buyerPhone: form.buyerPhone,
      gateway: form.gateway,
    });
  };

  const color = settings?.primaryColor ?? '#012b6d';

  // ── Tampilan voucher setelah bayar ──────────────────────────────────────────
  if (codeFromUrl && voucherResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="p-6 text-white text-center" style={{ background: color }}>
            {settings?.logoUrl
              ? <img src={settings.logoUrl} alt="logo" className="h-12 w-12 rounded-lg object-cover mx-auto mb-2" />
              : <Wifi className="mx-auto mb-2" size={40} />}
            <h1 className="text-xl font-bold">{settings?.companyName ?? 'RT/RW Net'}</h1>
          </div>

          <div className="p-6 space-y-5">
            {voucherResult.status === 'pending' ? (
              <div className="text-center space-y-3">
                <Clock className="mx-auto text-amber-500" size={48} />
                <h2 className="text-lg font-semibold">Menunggu Konfirmasi Pembayaran</h2>
                <p className="text-sm text-slate-500">
                  Kode voucher Anda: <span className="font-mono font-bold text-slate-800">{codeFromUrl}</span>
                </p>
                <p className="text-xs text-slate-400">Halaman ini otomatis refresh setelah pembayaran dikonfirmasi.</p>
                <button className="text-sm text-indigo-600 underline" onClick={() => refetchVoucher()}>
                  Refresh manual
                </button>
              </div>
            ) : voucherResult.status === 'active' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle size={24} />
                  <span className="font-semibold text-lg">Voucher Aktif!</span>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Kode Voucher</p>
                    <p className="font-mono text-2xl font-bold tracking-widest text-slate-800">{voucherResult.code}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <p className="text-xs text-slate-400">Username</p>
                      <p className="font-mono font-bold text-slate-800">{voucherResult.username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Password</p>
                      <p className="font-mono font-bold text-slate-800">{voucherResult.password}</p>
                    </div>
                  </div>
                  {voucherResult.packageName && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-xs text-slate-400">Paket</p>
                      <p className="font-medium text-slate-700">
                        {voucherResult.packageName}
                        {voucherResult.durationMinutes ? ` (${fmtDuration(voucherResult.durationMinutes)})` : ''}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-800">
                  <p className="font-semibold mb-1">Cara menggunakan:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Hubungkan perangkat ke jaringan WiFi</li>
                    <li>Buka browser, ketik alamat apapun</li>
                    <li>Anda akan diarahkan ke halaman login hotspot</li>
                    <li>Masukkan <strong>username</strong> dan <strong>password</strong> di atas</li>
                    <li>Klik Login — internet langsung aktif!</li>
                  </ol>
                </div>

                <button
                  className="w-full text-sm py-2 rounded-lg border border-slate-300 flex items-center justify-center gap-2 hover:bg-slate-50"
                  onClick={() => {
                    navigator.clipboard.writeText(`Username: ${voucherResult.username}\nPassword: ${voucherResult.password}`);
                    alert('Disalin!');
                  }}
                >
                  <Copy size={14} /> Salin username & password
                </button>
              </div>
            ) : (
              <div className="text-center text-slate-500">
                <p>Voucher tidak valid atau sudah tidak aktif.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Toko voucher utama ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="text-white py-10 px-4 text-center" style={{ background: color }}>
        {settings?.logoUrl
          ? <img src={settings.logoUrl} alt="logo" className="h-16 w-16 rounded-xl object-cover mx-auto mb-3 shadow-lg" />
          : <Wifi className="mx-auto mb-3 opacity-90" size={52} />}
        <h1 className="text-2xl font-bold">{settings?.companyName ?? 'RT/RW Net'}</h1>
        <p className="text-blue-200 text-sm mt-1">{settings?.tagline ?? 'Layanan Internet Rumahan'}</p>
        <p className="text-white/80 text-sm mt-2 font-medium">Beli Voucher Internet</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {routers && routers.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-center">
            Belum ada router terkonfigurasi. Hubungi administrator.
          </div>
        )}

        {pkgLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-500" size={36} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {packages?.map((pkg) => (
            <div key={pkg.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all p-5 flex flex-col">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                {fmtDuration(pkg.durationMinutes)}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">{pkg.name}</h3>
              <p className="text-2xl font-extrabold mb-4" style={{ color }}>
                {rupiah(pkg.price)}
              </p>
              <button
                className="mt-auto w-full py-2 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: color }}
                disabled={!defaultRouter}
                onClick={() => { setSelectedPkg(pkg); setShowForm(true); }}
              >
                <ShoppingCart size={16} /> Beli Sekarang
              </button>
            </div>
          ))}
        </div>

        {!pkgLoading && packages?.length === 0 && (
          <p className="text-center text-slate-400 py-10">Belum ada paket voucher tersedia.</p>
        )}

        <p className="text-center text-xs text-slate-400">
          Sudah punya kode? Langsung masukkan ke halaman login hotspot WiFi.
        </p>
      </div>

      {/* Modal form beli */}
      {showForm && selectedPkg && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl">
            <h2 className="font-bold text-lg">Beli {selectedPkg.name}</h2>
            <p className="text-sm text-slate-500">
              Durasi: {fmtDuration(selectedPkg.durationMinutes)} · Harga: <strong>{rupiah(selectedPkg.price)}</strong>
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Nama (opsional)</label>
                <input className="input mt-1" placeholder="Nama Anda"
                  value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">No. WhatsApp (opsional)</label>
                <input className="input mt-1" placeholder="08xxxxxxxxxx" type="tel"
                  value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} />
                <p className="text-xs text-slate-400 mt-1">Kode voucher akan dikirim ke nomor ini setelah pembayaran.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Metode Bayar</label>
                <select className="input mt-1" value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })}>
                  <option value="tripay">Tripay (QRIS / VA / Alfamart)</option>
                  <option value="midtrans">Midtrans (QRIS / Kartu / VA)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="flex-1 py-2 rounded-xl border border-slate-300 text-sm font-medium hover:bg-slate-50"
                onClick={() => setShowForm(false)}>
                Batal
              </button>
              <button
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                style={{ background: color }}
                disabled={purchase.isPending}
                onClick={handleBuy}
              >
                {purchase.isPending ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                Bayar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal link pembayaran */}
      {payLinkResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl">
            <CheckCircle className="text-emerald-500 mx-auto" size={40} />
            <h2 className="font-bold text-center">Pesanan Dibuat</h2>
            <p className="text-sm text-slate-500 text-center">
              Kode Anda: <span className="font-mono font-bold text-slate-800">{payLinkResult.code}</span>
              <br />Selesaikan pembayaran untuk mengaktifkan voucher.
            </p>
            <a href={payLinkResult.url} target="_blank" rel="noopener noreferrer"
              className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90"
              style={{ background: color }}>
              <ExternalLink size={16} /> Lanjut Bayar
            </a>
            <button className="w-full text-sm text-slate-400 hover:text-slate-600 py-1"
              onClick={() => setPayLinkResult(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
