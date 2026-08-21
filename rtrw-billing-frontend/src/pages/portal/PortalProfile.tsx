import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { portalApi } from '@/lib/portalApi';
import { errorMessage } from '@/lib/publicApi';
import { tanggal } from '@/lib/format';
import { usePortalAuth } from '@/store/portalAuth';
import { ErrorState, Loading, PCard, PageTitle } from '@/components/portal/ui';

interface Profile {
  id: string;
  customerNo: string;
  fullName: string;
  email: string | null;
  phoneMasked: string;
  address: string | null;
  rt: string | null;
  rw: string | null;
  photoUrl: string | null;
  status: string;
  memberSince: string;
  hasPassword: boolean;
}

/** "Profil" (§37) — hanya data non-teknis yang boleh diubah pelanggan. */
export default function PortalProfile() {
  const qc = useQueryClient();
  const patchCustomer = usePortalAuth((s) => s.patchCustomer);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [ok, setOk] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<Profile>({
    queryKey: ['portal-profile'],
    queryFn: async () => (await portalApi.get('/me/profile')).data,
  });

  useEffect(() => {
    if (data) setForm({ fullName: data.fullName, email: data.email ?? '', phone: '' });
  }, [data]);

  const save = useMutation({
    mutationFn: async (body: Record<string, string | undefined>) =>
      (await portalApi.patch('/me/profile', body)).data as Profile,
    onSuccess: (res) => {
      setOk('Profil berhasil diperbarui.');
      patchCustomer({ fullName: res.fullName, email: res.email, phoneMasked: res.phoneMasked });
      qc.invalidateQueries({ queryKey: ['portal-profile'] });
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <ErrorState message={errorMessage(error, 'Gagal memuat profil.')} onRetry={() => refetch()} />;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOk(null);
    save.mutate({
      fullName: form.fullName !== data.fullName ? form.fullName : undefined,
      email: form.email !== (data.email ?? '') ? form.email : undefined,
      phone: form.phone.trim() || undefined,
    });
  };

  const inputCls = 'input dark:border-white/15 dark:bg-slate-800 dark:text-white';

  return (
    <>
      <PageTitle title="Profil" subtitle="Data pribadi dan kontak Anda." />

      {ok && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={18} /> {ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <PCard>
          <p className="text-sm text-slate-500 dark:text-slate-400">Nomor pelanggan</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{data.customerNo}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Alamat</dt>
              <dd className="text-right text-slate-800 dark:text-slate-200">{data.address ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">RT / RW</dt>
              <dd className="text-slate-800 dark:text-slate-200">{data.rt ?? '-'} / {data.rw ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Pelanggan sejak</dt>
              <dd className="text-slate-800 dark:text-slate-200">{tanggal(data.memberSince)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Perubahan alamat dilakukan oleh petugas karena memengaruhi instalasi jaringan.
          </p>
        </PCard>

        <PCard className="lg:col-span-2">
          <p className="font-semibold text-slate-900 dark:text-white">Ubah data kontak</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nama lengkap</label>
              <input className={inputCls} value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                minLength={2} maxLength={80} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input className={inputCls} type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Nomor WhatsApp</label>
              <input className={inputCls} value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={`Saat ini: ${data.phoneMasked}`} inputMode="tel" />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Kosongkan bila tidak ingin mengubah. Nomor ini dipakai untuk OTP & notifikasi.
              </p>
            </div>

            {save.isError && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errorMessage(save.error, 'Gagal menyimpan profil.')}
              </p>
            )}

            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Loader2 size={16} className="animate-spin" />} Simpan Perubahan
            </button>
          </form>

          {!data.hasPassword && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <Lock size={16} className="mt-0.5 shrink-0" />
              Anda belum memiliki kata sandi portal. Setel di menu Pengaturan agar bisa masuk
              tanpa OTP.
            </p>
          )}
        </PCard>
      </div>
    </>
  );
}
