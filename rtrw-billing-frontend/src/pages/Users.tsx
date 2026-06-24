import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Trash2, Pencil, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

interface UserRow {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'finance';
  isActive: boolean;
  totpEnabled: boolean;
  createdAt: string;
}

const roleTone: Record<string, string> = {
  admin: 'bg-brand-50 text-brand-700',
  operator: 'bg-sky-50 text-sky-700',
  finance: 'bg-emerald-50 text-emerald-700',
};

export default function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (body: any) => api.post('/users', body),
    onSuccess: () => { invalidate(); setCreating(false); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.patch(`/users/${id}`, body),
    onSuccess: () => { invalidate(); setEdit(null); },
  });
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => { setResetFor(null); alert('Password berhasil direset.'); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e.response?.data?.message || 'Gagal menghapus.'),
  });

  function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({ email: fd.get('email'), password: fd.get('password'), role: fd.get('role') });
  }
  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    const fd = new FormData(e.currentTarget);
    update.mutate({ id: edit.id, body: { email: fd.get('email'), role: fd.get('role'), isActive: fd.get('isActive') === 'on' } });
  }
  function submitReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetFor) return;
    const fd = new FormData(e.currentTarget);
    reset.mutate({ id: resetFor.id, password: fd.get('password') as string });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pengguna Admin</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Tambah User</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Aktif</th>
                <th className="px-4 py-3 font-medium">2FA</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>}
              {data?.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {u.email} {u.id === me?.id && <span className="text-xs text-slate-400">(Anda)</span>}
                  </td>
                  <td className="px-4 py-3"><span className={`badge ${roleTone[u.role]}`}>{u.role}</span></td>
                  <td className="px-4 py-3">{u.isActive ? '✓' : <span className="text-rose-600">nonaktif</span>}</td>
                  <td className="px-4 py-3">
                    {u.totpEnabled
                      ? <span className="badge bg-emerald-50 text-emerald-700"><ShieldCheck size={12} className="mr-1" /> aktif</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost" title="Edit" onClick={() => setEdit(u)}><Pencil size={16} /></button>
                      <button className="btn-ghost text-amber-600" title="Reset password" onClick={() => setResetFor(u)}><KeyRound size={16} /></button>
                      <button
                        className="btn-ghost text-rose-600"
                        title="Hapus"
                        disabled={u.id === me?.id}
                        onClick={() => confirm(`Hapus user ${u.email}?`) && del.mutate(u.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada user.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal title="Tambah User" onClose={() => setCreating(false)}>
          <form onSubmit={submitCreate} className="space-y-3">
            <input name="email" type="email" className="input" placeholder="Email" required />
            <input name="password" type="password" className="input" placeholder="Password (min 8)" minLength={8} required />
            <select name="role" className="input" defaultValue="operator">
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="finance">finance</option>
            </select>
            {create.isError && <p className="text-sm text-red-600">Gagal (email mungkin sudah dipakai).</p>}
            <button className="btn-primary w-full" disabled={create.isPending}>{create.isPending && <Loader2 className="animate-spin" size={16} />} Simpan</button>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title="Edit User" onClose={() => setEdit(null)}>
          <form onSubmit={submitEdit} className="space-y-3">
            <input name="email" type="email" className="input" defaultValue={edit.email} required />
            <select name="role" className="input" defaultValue={edit.role}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="finance">finance</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked={edit.isActive} /> Aktif
            </label>
            <button className="btn-primary w-full" disabled={update.isPending}>{update.isPending && <Loader2 className="animate-spin" size={16} />} Simpan</button>
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset Password — ${resetFor.email}`} onClose={() => setResetFor(null)}>
          <form onSubmit={submitReset} className="space-y-3">
            <input name="password" type="password" className="input" placeholder="Password baru (min 8)" minLength={8} required />
            <button className="btn-primary w-full" disabled={reset.isPending}>{reset.isPending && <Loader2 className="animate-spin" size={16} />} Reset</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

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
