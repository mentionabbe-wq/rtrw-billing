import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MapPin, Phone, UserPlus, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/lib/rbac';

interface Lead {
  id: string;
  requestNo: string;
  fullName: string;
  phoneMasked: string;
  email: string | null;
  address: string;
  rt: string | null;
  rw: string | null;
  lat: number | null;
  lng: number | null;
  packageName: string | null;
  packageId: string | null;
  note: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected';
  rejectReason: string | null;
  customerNo: string | null;
  createdAt: string;
  handledAt: string | null;
}

interface Pkg { id: string; name: string; price: string }

const TABS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Baru' },
  { key: 'contacted', label: 'Dihubungi' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
  { key: 'all', label: 'Semua' },
];

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  contacted: 'bg-brand-100 text-brand-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

const waktu = (v: string | null) =>
  v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '-';

/** Panel admin: pendaftaran calon pelanggan dari landing page (§36). */
export default function Registrations() {
  const qc = useQueryClient();
  const isAdmin = useCan('settings.manage');
  const [tab, setTab] = useState('pending');
  const [approveFor, setApproveFor] = useState<Lead | null>(null);
  const [packageId, setPackageId] = useState('');

  const { data, isLoading } = useQuery<Lead[]>({
    queryKey: ['customer-requests', tab],
    queryFn: async () => (await api.get('/customer-requests', { params: { status: tab } })).data,
  });

  const { data: counts } = useQuery<Record<string, number>>({
    queryKey: ['customer-requests-counts'],
    queryFn: async () => (await api.get('/customer-requests/counts')).data,
    refetchInterval: 60_000,
  });

  const { data: packages } = useQuery<Pkg[]>({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/packages')).data,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['customer-requests'] });
    qc.invalidateQueries({ queryKey: ['customer-requests-counts'] });
  };

  const contacted = useMutation({
    mutationFn: (id: string) => api.post(`/customer-requests/${id}/contacted`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Gagal memperbarui status.'),
  });

  const approve = useMutation({
    mutationFn: (v: { id: string; packageId?: number }) =>
      api.post(`/customer-requests/${v.id}/approve`, {
        packageId: v.packageId,
        createPortalAccount: true,
      }),
    onSuccess: (res: any) => {
      invalidate();
      setApproveFor(null);
      alert(
        `Pendaftaran disetujui.\nPelanggan ${res?.data?.customerNo} dibuat.\n` +
          'Kata sandi sementara sudah dikirim ke WhatsApp pelanggan.\n\n' +
          'Lengkapi data teknis (PPPoE, router, ONU) di menu Pelanggan.',
      );
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Gagal menyetujui pendaftaran.'),
  });

  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/customer-requests/${v.id}/reject`, { reason: v.reason }),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Gagal menolak pendaftaran.'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calon Pelanggan</h1>
          <p className="text-sm text-slate-500">Pendaftaran yang masuk dari landing page.</p>
        </div>
        {!!counts?.pending && (
          <span className="badge bg-amber-100 text-amber-700">{counts.pending} menunggu</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-white/70 p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {t.label}
            {counts?.[t.key] ? ` (${counts[t.key]})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" /> Memuat pendaftaran…
        </div>
      ) : !data?.length ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          Belum ada pendaftaran pada kategori ini.
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((l) => (
            <div key={l.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.fullName}</span>
                    <span className={clsx('badge', STATUS_CLS[l.status])}>{l.status}</span>
                    <span className="text-xs text-slate-400">{l.requestNo}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <Phone size={14} /> {l.phoneMasked}
                    {l.email && <span className="text-slate-400">· {l.email}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {l.address} · RT {l.rt ?? '-'} / RW {l.rw ?? '-'}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Paket diminta: <strong>{l.packageName ?? 'belum menentukan'}</strong> · masuk {waktu(l.createdAt)}
                  </p>
                  {l.note && <p className="mt-1 text-sm italic text-slate-500">"{l.note}"</p>}
                  {l.rejectReason && (
                    <p className="mt-1 text-sm text-rose-600">Alasan penolakan: {l.rejectReason}</p>
                  )}
                  {l.customerNo && (
                    <p className="mt-1 text-sm text-emerald-700">Akun dibuat: {l.customerNo}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {l.lat != null && l.lng != null && (
                    <a
                      className="btn-ghost"
                      href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Buka lokasi di peta"
                    >
                      <MapPin size={16} /> Lokasi
                    </a>
                  )}
                  {l.status === 'pending' && (
                    <button className="btn-ghost" onClick={() => contacted.mutate(l.id)}>
                      <Phone size={16} /> Tandai dihubungi
                    </button>
                  )}
                  {isAdmin && l.status !== 'approved' && (
                    <>
                      <button
                        className="btn-primary"
                        onClick={() => { setApproveFor(l); setPackageId(l.packageId ?? ''); }}
                      >
                        <Check size={16} /> Setujui
                      </button>
                      <button
                        className="btn text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          const reason = window.prompt('Alasan penolakan:');
                          if (reason && reason.trim().length >= 3) {
                            reject.mutate({ id: l.id, reason: reason.trim() });
                          }
                        }}
                      >
                        <X size={16} /> Tolak
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {approveFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus size={18} /> Setujui Pendaftaran
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Akun pelanggan akan dibuat untuk <strong>{approveFor.fullName}</strong> dan kata sandi
              sementara dikirim ke WhatsApp-nya.
            </p>

            <label className="mt-4 block text-sm font-medium">Paket yang disepakati</label>
            <select className="input mt-1" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              <option value="">Ikuti pilihan pendaftar</option>
              {packages?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
              Data teknis (PPPoE, router, ONU) diisi terpisah di menu Pelanggan setelah pemasangan.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setApproveFor(null)}>Batal</button>
              <button
                className="btn-primary"
                disabled={approve.isPending}
                onClick={() => approve.mutate({
                  id: approveFor.id,
                  packageId: packageId ? Number(packageId) : undefined,
                })}
              >
                {approve.isPending && <Loader2 size={16} className="animate-spin" />} Setujui & Buat Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
