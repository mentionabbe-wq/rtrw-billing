# RT/RW Net Billing — Frontend (React)

Dashboard admin untuk sistem billing RT/RW Net. Terhubung ke backend NestJS
(`rtrw-billing-backend`) via REST + Socket.IO untuk monitoring ONU realtime.

## Stack
- **React 18 + TypeScript + Vite**
- **TailwindCSS** (UI bersih, mobile-responsive)
- **TanStack Query** (data fetching/cache) · **Zustand** (auth state, persisted)
- **socket.io-client** (live `onu:status`) · **Recharts** (grafik trafik) · **lucide-react** (ikon)

## Struktur
```
src/
├── main.tsx · App.tsx          # bootstrap + routing
├── lib/
│   ├── api.ts                  # axios + JWT interceptor + auto-logout 401
│   └── socket.ts               # koneksi Socket.IO namespace /monitoring
├── store/auth.ts               # token + user (persist localStorage)
├── components/
│   ├── Layout.tsx              # sidebar + topbar responsive (drawer di mobile)
│   └── ProtectedRoute.tsx
└── pages/
    ├── Login.tsx               # form login → POST /auth/login
    ├── Dashboard.tsx           # kartu stat + grafik trafik + ONU health live
    ├── Customers.tsx           # tabel + modal tambah/edit pelanggan
    ├── Subscriptions.tsx       # ubah paket (→ set_bandwidth) + suspend/aktifkan
    ├── Packages.tsx            # daftar paket layanan
    ├── Invoices.tsx            # daftar tagihan + generate massal bulanan
    ├── Monitoring.tsx          # optical power realtime + enable/disable port ONU (SNMP)
    ├── Settings.tsx            # CRUD Router Mikrotik & OLT (admin) + test koneksi
    ├── Audit.tsx               # audit log aksi mutasi (admin)
    ├── Users.tsx               # CRUD pengguna admin + reset password (admin)
    └── Security.tsx            # aktif/nonaktif 2FA (TOTP) untuk akun sendiri
```

## Menjalankan (butuh Node 20)
```bash
cp .env.example .env     # opsional: set VITE_API_URL kalau backend beda host
npm install
npm run dev              # http://localhost:5173
```
Dev server mem-proxy `/api` dan `/monitoring` (WebSocket) ke `http://localhost:3000`
(lihat `vite.config.ts`), jadi cukup jalankan backend di port 3000.

## Endpoint backend yang dipakai
| Halaman | Endpoint |
|---|---|
| Login | `POST /api/auth/login` |
| Dashboard | `GET /api/dashboard/stats` + WS `onu:status` |
| Pelanggan | `GET/POST /api/customers`, `GET/PATCH /api/customers/:id` |
| Langganan | `GET /api/subscriptions`, `PATCH /api/subscriptions/:id/package`, `POST .../suspend\|activate` |
| Paket | `GET /api/packages` |
| Tagihan | `GET /api/billing/invoices`, `POST /api/billing/invoices/generate-monthly` |
| Monitoring | `GET /api/monitoring/devices`, `POST /api/monitoring/devices/:id/port` + WS `onu:status` |
| Pengaturan | `GET/POST/PATCH/DELETE /api/routers` (+ `/test`), `GET/POST/PATCH/DELETE /api/olts` |
| Audit | `GET /api/audit-logs` |
| Pengguna | `GET/POST/PATCH/DELETE /api/users`, `POST /api/users/:id/reset-password` |
| Keamanan | `POST /api/auth/2fa/{setup,enable,disable}` |

**2FA (TOTP):** menu Keamanan (ikon perisai di header) → Aktifkan 2FA → scan QR (Google Authenticator/Authy) → konfirmasi kode. Saat 2FA aktif, login meminta kode 6-digit (form login otomatis menampilkan field saat backend balas `twoFactorRequired`).

**RBAC UI:** menu & tombol disembunyikan sesuai role (`src/lib/rbac.ts`, mirror dari `@Roles()` backend). Admin = semua; operator = pelanggan/langganan/monitoring; finance = billing. Pengaturan & Audit khusus admin. Backend tetap menegakkan via guard — UI hanya menyembunyikan.

Semua endpoint di atas sudah tersedia di backend (modul packages, dashboard,
monitoring controller, billing list ditambahkan untuk mendukung dashboard ini).

## Login default (setelah `npm run seed` di backend)
`admin@rtrw.local` / `admin12345` — **wajib diganti**.
