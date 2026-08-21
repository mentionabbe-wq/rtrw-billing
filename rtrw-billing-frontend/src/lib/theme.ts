import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const KEY = 'rtrw-theme';

function systemPrefersDark(): boolean {
  return !!(typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function stored(): ThemeMode | null {
  const v = localStorage.getItem(KEY);
  return v === 'dark' || v === 'light' ? v : null;
}

/**
 * Mode gelap untuk halaman publik & portal pelanggan.
 *
 * Kelas `dark` hanya dipasang selama komponen ini hidup, lalu dicabut saat
 * berpindah ke panel admin — panel admin memang dirancang terang saja.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => stored() ?? (systemPrefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    localStorage.setItem(KEY, mode);
    return () => root.classList.remove('dark');
  }, [mode]);

  return { mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) };
}
