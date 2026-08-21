const RP = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export const rupiah = (n: number | string | null | undefined): string =>
  RP.format(Number(n ?? 0));

const DATE = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export const tanggal = (v: string | Date | null | undefined): string =>
  v ? DATE.format(new Date(v)) : '-';

export const waktu = (v: string | Date | null | undefined): string =>
  v ? DATETIME.format(new Date(v)) : '-';

/** "3d5h30m" (format uptime RouterOS) → "3 hari 5 jam". */
export function uptimeLabel(v: string | null | undefined): string {
  if (!v) return '-';
  const m = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?/.exec(v);
  if (!m) return v;
  const [, w, d, h, min] = m;
  const parts: string[] = [];
  const days = (Number(w ?? 0) * 7) + Number(d ?? 0);
  if (days) parts.push(`${days} hari`);
  if (h) parts.push(`${Number(h)} jam`);
  if (!days && min) parts.push(`${Number(min)} menit`);
  return parts.length ? parts.join(' ') : v;
}
