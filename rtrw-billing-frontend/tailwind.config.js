/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Mode gelap dipakai landing page & portal pelanggan (lihat src/lib/theme.ts).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
