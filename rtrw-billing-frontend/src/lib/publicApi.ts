import axios from 'axios';

/**
 * Klien untuk API publik (`/api/public/*`) — tanpa token, dipakai landing page.
 * Sengaja terpisah dari `api` (admin) agar interceptor auto-logout admin tidak
 * ikut jalan saat pengunjung biasa membuka halaman depan.
 */
export const publicApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api/public',
});

/**
 * Klien untuk endpoint publik di luar prefix `/public` — mis. pengaturan
 * portal (`/api/portal/settings`) dan konfirmasi pembayaran manual.
 */
export const appApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
});

/** Ambil pesan error yang ramah dari respons NestJS. */
export function errorMessage(e: any, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  if (typeof msg === 'string') return msg;
  if (e?.code === 'ERR_NETWORK') return 'Tidak dapat terhubung ke server.';
  return fallback;
}
