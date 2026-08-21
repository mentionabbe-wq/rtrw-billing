import axios from 'axios';
import { usePortalAuth } from '@/store/portalAuth';

/** Klien API portal pelanggan (`/api/portal/*`) — memakai token portal. */
export const portalApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api/portal',
});

portalApi.interceptors.request.use((config) => {
  const token = usePortalAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sesi kedaluwarsa / dicabut admin → bersihkan sesi lokal, ProtectedPortalRoute
// akan mengarahkan kembali ke halaman masuk.
portalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) usePortalAuth.getState().clear();
    return Promise.reject(err);
  },
);
