import axios from 'axios';
import { useAuth } from '@/store/auth';

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuth.getState().logout();
    }
    return Promise.reject(err);
  },
);
