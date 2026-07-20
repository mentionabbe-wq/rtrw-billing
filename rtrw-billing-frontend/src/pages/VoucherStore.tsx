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

interface BankAccount { bank: string; accountNo: string; accountName: string }
interface PortalSettings {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  tagline: string;
  qrisImage: string | null;
  bankAccounts: BankAccount[];
  whatsappNumber: string | null;
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
  // Alur tanpa gateway: pesanan QRIS/transfer menunggu persetujuan admin.
  const [manualOrder, setManualOrder] = useState<{ code: string; packageName: string; amount: string } | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claimNote, setClaimNote] = useState('');
  const [claimProof, setClaimProof] = useState<string | null>(null);

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

  // Hanya gateway yang terkonfigurasi yang ditawarkan ke pembeli.
  const { data: gateways } = useQuery<{ tripay: boolean; midtrans: boolean }>({
    queryKey: ['hotspot-gateways'],
    queryFn: async () => (await api.get('/hotspot/gateways')).data,
    staleTime: 5 * 60 * 1000,
  });
  const gatewayOptions = [
    ...(gateways?.tripay !== false ? [{ value: 'tripay', label: 'Tripay (QRIS / VA / Alfamart)' }] : []),
    ...(gateways?.midtrans !== false ? [{ value: 'midtrans', label: 'Midtrans (QRIS / Kartu / VA)' }] : []),
  ];

  const { data: voucherResult, refetch: refetchVoucher } = useQuery<VoucherResult | null>({
    queryKey: ['voucher-status', codeFromUrl],
    queryFn: async () => {
      if (!codeFromUrl) return null;
      const res = await api.get(`/hotspot/voucher/${codeFromUrl}`);
      return res.data;
    },
    enabled: !!codeFromUrl,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5000 : false),
  });

  const defaultRouter = routers?.[0];

  // Pastikan gateway terpilih selalu salah satu yang terkonfigurasi.
  useEffect(() => {
    if (gatewayOptions.length && !gatewayOptions.some((g) => g.value === form.gateway)) {
      setForm((f) => ({ ...f, gateway: gatewayOptions[0].value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateways]);

  // Tanpa gateway aktif → pakai alur QRIS statis / transfer manual.
  const manualMode = gatewayOptions.length === 0;

  const purchase = useMutation({
    mutationFn: (body: any) => api.post('/hotspot/purchase', body),
    onSuccess: (res) => {
      setPayLinkResult({ code: res.data.code, url: res.data.paymentUrl });
      setShowForm(false);
    },
    onError: (e: any) => alert(`Gagal membuat pembayaran: ${e?.response?.data?.message ?? e.message}`),
  });

  const order = useMutation({
    mutationFn: (body: any) => api.post('/hotspot/order', body),
    onSuccess: (res) => {
      setManualOrder(res.data);
      setClaimed(false);
      setShowForm(false);
    },
    onError: (e: any) => alert(`Gagal membuat pesanan: ${e?.response?.data?.message ?? e.message}`),
  });

  const claim = useMutation({
    mutationFn: () => api.post(`/hotspot/order/${manualOrder!.code}/claim`, {
      note: claimNote || undefined,
      proofImage: claimProof ?? undefined,
    }),
    onSuccess: () => setClaimed(true),
    onError: (e: any) => alert(`Gagal mengirim konfirmasi: ${e?.response?.data?.message ?? e.message}`),
  });

  function pickProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('File harus berupa gambar.'); return; }
    if (file.size > 3 * 1024 * 1024) { alert('Ukuran gambar maksimal 3 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setClaimProof(String(reader.result));
    reader.readAsDataURL(file);
  }

  const handleBuy = () => {
    if (!selectedPkg || !defaultRouter) return;
    const base = {
      packageId: selectedPkg.id,
      routerId: defaultRouter.id,
      buyerName: form.buyerName,
      buyerPhone: form.buyerPhone,
    };
    if (manualMode) order.mutate(base);
    else purchase.mutate({ ...base, gateway: form.gateway });
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
                    <p className="text-xs text-slate-400 mb-2">Kode Voucher Anda</p>
                    <p className="font-mono text-2xl font-bold tracking-widest text-indigo-700">{voucherResult.code}</p>
                    <p className="text-xs text-slate-400 mt-1">Gunakan kode ini sebagai username &amp; password</p>
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
                    <li>Anda akan diarahkan ke halaman login</li>
                    <li>Masukkan <strong>kode voucher</strong> di atas</li>
                    <li>Klik "Gunakan Voucher" — internet langsung aktif!</li>
                  </ol>
                </div>

                <button
                  className="w-full text-sm py-2 rounded-lg border border-slate-300 flex items-center justify-center gap-2 hover:bg-slate-50"
                  onClick={() => {
                    navigator.clipboard.writeText(voucherResult.code);
                    alert('Kode disalin!');
                  }}
                >
                  <Copy size={14} /> Salin kode voucher
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
              {gatewayOptions.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Metode Bayar</label>
                  <select className="input mt-1" value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })}>
                    {gatewayOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button className="flex-1 py-2 rounded-xl border border-slate-300 text-sm font-medium hover:bg-slate-50"
                onClick={() => setShowForm(false)}>
                Batal
              </button>
              <button
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                style={{ background: color }}
                disabled={purchase.isPending || order.isPending}
                onClick={handleBuy}
              >
                {(purchase.isPending || order.isPending)
                  ? <Loader2 size={16} className="animate-spin" />
                  : <ExternalLink size={16} />}
                {manualMode ? 'Pesan & Bayar' : 'Bayar'}
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

      {/* Modal pembayaran manual (QRIS statis / transfer) */}
      {manualOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl my-8">
            {claimed ? (
              <>
                <Clock className="text-amber-500 mx-auto" size={40} />
                <h2 className="font-bold text-center">Menunggu Verifikasi</h2>
                <p className="text-sm text-slate-500 text-center">
                  Konfirmasi Anda sudah kami terima. Voucher akan aktif setelah admin
                  memverifikasi pembayaran — biasanya beberapa menit.
                </p>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">Kode Pesanan</p>
                  <p className="font-mono text-xl font-bold tracking-widest text-slate-800">{manualOrder.code}</p>
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Simpan kode ini. Cek status kapan saja di
                  <span className="font-mono"> /voucher?code={manualOrder.code}</span>
                </p>
                {settings?.whatsappNumber && (
                  <a href={`https://wa.me/${settings.whatsappNumber}?text=Halo,%20konfirmasi%20pembayaran%20voucher%20kode%20${manualOrder.code}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50">
                    Hubungi Admin via WhatsApp
                  </a>
                )}
                <a href={`/voucher?code=${manualOrder.code}`}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90"
                  style={{ background: color }}>
                  Cek Status Voucher
                </a>
              </>
            ) : (
              <>
                <h2 className="font-bold text-center">Selesaikan Pembayaran</h2>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-400">{manualOrder.packageName}</p>
                  <p className="text-2xl font-extrabold" style={{ color }}>{rupiah(manualOrder.amount)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Kode: <span className="font-mono font-semibold text-slate-700">{manualOrder.code}</span>
                  </p>
                </div>

                {settings?.qrisImage && (
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-600 mb-2">Scan QRIS</p>
                    <img src={settings.qrisImage} alt="QRIS"
                      className="w-52 h-52 object-contain mx-auto rounded-xl border border-slate-200 bg-white p-2" />
                  </div>
                )}

                {settings?.bankAccounts?.length ? (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600">Atau transfer ke:</p>
                    {settings.bankAccounts.map((b, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-semibold">{b.bank}</span>{' '}
                        <span className="font-mono">{b.accountNo}</span>
                        <div className="text-xs text-slate-400">a.n. {b.accountName}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div>
                  <label className="text-xs font-medium text-slate-600">Bukti Transfer (opsional)</label>
                  {claimProof ? (
                    <div className="mt-1 relative">
                      <img src={claimProof} alt="Bukti" className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50" />
                      <button className="absolute top-2 right-2 rounded-full bg-white/90 p-1 shadow text-slate-500"
                        onClick={() => setClaimProof(null)}>✕</button>
                    </div>
                  ) : (
                    <label className="mt-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 py-5 cursor-pointer hover:border-slate-300">
                      <span className="text-xs text-slate-500">Ketuk untuk pilih foto</span>
                      <span className="text-xs text-slate-400">JPG/PNG, maks 3 MB</span>
                      <input type="file" accept="image/*" className="hidden" onChange={pickProof} />
                    </label>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Catatan (opsional)</label>
                  <input className="input mt-1" placeholder="mis. nama pengirim / jam transfer"
                    value={claimNote} onChange={(e) => setClaimNote(e.target.value)} />
                </div>

                <button
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                  style={{ background: color }}
                  disabled={claim.isPending}
                  onClick={() => claim.mutate()}
                >
                  {claim.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Saya Sudah Bayar
                </button>
                <button className="w-full text-sm text-slate-400 hover:text-slate-600 py-1"
                  onClick={() => setManualOrder(null)}>
                  Batal
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
