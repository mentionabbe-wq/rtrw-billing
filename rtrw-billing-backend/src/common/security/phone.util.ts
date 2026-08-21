/**
 * Utilitas nomor telepon Indonesia. Semua nomor disimpan & dicari dalam
 * bentuk E.164 tanpa tanda plus (mis. 6281234567788) agar "0812…", "+62812…"
 * dan "62812…" dianggap nomor yang sama.
 */

/** Normalisasi ke format 62xxxxxxxxxx. Mengembalikan '' bila jelas tidak valid. */
export function normalizePhone(raw: string | null | undefined): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  else if (d.startsWith('620')) d = '62' + d.slice(3);
  // Nomor seluler Indonesia: 62 + 9..13 digit.
  if (!/^62\d{9,13}$/.test(d)) return '';
  return d;
}

/** 6281234567788 → 0812****7788 (aman ditampilkan sebelum verifikasi OTP). */
export function maskPhone(raw: string | null | undefined): string {
  const d = normalizePhone(raw) || (raw ?? '').replace(/\D/g, '');
  if (d.length < 6) return '****';
  const local = d.startsWith('62') ? '0' + d.slice(2) : d;
  return `${local.slice(0, 4)}****${local.slice(-4)}`;
}

/** budi@mail.com → b***i@mail.com */
export function maskEmail(email: string | null | undefined): string {
  const [user, domain] = (email ?? '').split('@');
  if (!user || !domain) return '****';
  const head = user.slice(0, 1);
  const tail = user.length > 2 ? user.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

/** Nama lengkap → "Budi S." untuk tampilan pra-verifikasi. */
export function maskName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '****';
  const [first, ...rest] = parts;
  return rest.length ? `${first} ${rest.map((p) => p[0].toUpperCase() + '.').join(' ')}` : first;
}
