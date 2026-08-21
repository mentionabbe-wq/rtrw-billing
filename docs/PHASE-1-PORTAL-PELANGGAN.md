# PHASE 1 — Landing Page Publik & Portal Pelanggan

Dokumen ini menjelaskan apa yang ditambahkan pada Phase 1 dari cetak biru
"RT/RW ISP Billing + Customer Portal + MikroTik Management", bagaimana
menjalankannya, serta apa yang sengaja ditunda ke fase berikutnya.

Phase 1 dibangun **di atas aplikasi yang sudah ada** (billing, MikroTik, OLT/ONU,
GenieACS, hotspot, keuangan), bukan aplikasi baru — sehingga portal pelanggan
langsung memakai data langganan, tagihan, dan perangkat yang sudah berjalan.

---

## 1. Peta URL

| URL | Untuk siapa | Isi |
|---|---|---|
| `/` | Publik | Landing page ISP: paket, coverage, cara bayar, FAQ, status jaringan, cek tagihan, pendaftaran |
| `/portal` | Pelanggan | Dashboard portal (butuh login) |
| `/portal/masuk` | Pelanggan | Masuk: sandi, OTP WhatsApp, lupa sandi |
| `/admin` | Pengelola | Panel admin (sebelumnya di `/`) |
| `/admin/login` | Pengelola | Masuk admin (`/login` diarahkan ke sini) |
| `/captive` | Pelanggan ter-isolir | Halaman captive portal MikroTik (sebelumnya di `/portal`) |
| `/pelanggan` | Pelanggan | Portal lama berbasis deteksi IP (tetap ada) |
| `/voucher` | Publik | Toko voucher hotspot (tetap ada) |

Semua URL admin lama (`/customers`, `/invoices`, …) otomatis diarahkan ke
`/admin/...` sehingga bookmark lama tetap berfungsi.

---

## 2. Skema database yang ditambahkan

Migration: `1717000022000-AddCustomerPortalPhase1.ts`

**Tabel baru**

| Tabel | Isi | Indeks penting |
|---|---|---|
| `customer_sessions` | Sesi login portal (hash token, UA, IP, kedaluwarsa, dicabut) | `(customer_id, revoked_at)`, unik `token_hash` |
| `customer_otps` | OTP login / cek tagihan / reset sandi (kode & target hanya hash) | `(target_hash, purpose, created_at)` |
| `customer_requests` | Pendaftaran calon pelanggan dari landing page | `(status, created_at)`, unik `request_no` |
| `coverage_areas` | Area layanan untuk cek ketersediaan | `(is_active, status)` |
| `customer_notifications` | Lonceng notifikasi portal | `(customer_id, created_at)` |

**Kolom baru**

- `customers`: `email`, `password_hash` (Argon2id), `phone_hash` (HMAC-SHA256),
  `photo_url`, `rt`, `rw`, `portal_enabled`, `last_login_at`
- `service_packages`: `is_public`, `description`, `features` (JSONB),
  `speed_down_mbps`, `speed_up_mbps`, `badge`, `sort_order`
- `portal_settings`: `hero_title`, `hero_subtitle`, `coverage_note`, `faq`,
  `highlights`, `office_address`, `contact_email`, `network_status`,
  `network_status_note`, `registration_enabled`, `portal_features`

Semua tabel baru memakai foreign key ke `customers` / `service_packages` /
`users` dengan `ON DELETE CASCADE` atau `SET NULL` sesuai sifat relasinya.

> **Nomor telepon tidak pernah disimpan plaintext.** Kolom `phone_enc` tetap
> AES-256-GCM; `phone_hash` (HMAC dengan kunci `DATA_ENC_KEY`) hanya dipakai
> untuk mencari pelanggan dari nomor WhatsApp tanpa mendekripsi seluruh tabel.
> Seeder mengisi `phone_hash` otomatis untuk data lama.

---

## 3. Endpoint API

### 3.1 Publik — `/api/public/*` (tanpa login)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/landing` | Seluruh konten landing dalam satu panggilan |
| GET | `/packages` | Kartu paket publik (harga dari database) |
| GET | `/coverage` | Daftar area layanan |
| POST | `/coverage/check` | Cek ketersediaan via alamat/RT-RW atau GPS (haversine) |
| GET | `/status` | Status jaringan (manual admin, atau dihitung dari router & ONU) |
| POST | `/billing-check/request` | **Cek tagihan langkah 1** — kirim OTP ke WA terdaftar |
| POST | `/billing-check/verify` | **Langkah 2** — verifikasi OTP lalu tampilkan tagihan |
| POST | `/register` | Formulir pendaftaran calon pelanggan |
| GET | `/register/:requestNo` | Status pendaftaran (data tersamar) |

### 3.2 Autentikasi pelanggan — `/api/portal/auth/*`

| Method | Path | Keterangan |
|---|---|---|
| POST | `/login` | Nomor pelanggan **atau** email + kata sandi |
| POST | `/otp/request` | Kirim OTP login ke WhatsApp |
| POST | `/otp/verify` | Masuk dengan OTP |
| POST | `/forgot` | Kirim OTP reset kata sandi |
| POST | `/reset` | Setel kata sandi baru + langsung masuk |
| POST | `/logout` | Cabut sesi saat ini |
| POST | `/logout-all` | Keluar dari semua perangkat lain |
| GET | `/sessions` | Daftar perangkat yang masuk |
| DELETE | `/sessions/:id` | Keluarkan satu perangkat |

### 3.3 Data pelanggan — `/api/portal/me/*` (butuh token portal)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/` | Dasbor: status layanan, paket, tagihan, perangkat, notifikasi, saklar fitur |
| GET | `/internet` | "Internet Saya" + sesi PPPoE live dari MikroTik |
| GET | `/device` | Status ONU (label sinyal, bukan angka OID) |
| GET | `/invoices`, `/invoices/:id` | Tagihan (detail memeriksa kepemilikan) |
| GET | `/payments` | Riwayat pembayaran |
| GET/POST | `/wifi` | Info & ubah SSID/kata sandi WiFi (TR-069 via GenieACS) |
| GET | `/notifications`, POST `/notifications/:id/read`, POST `/notifications/read-all` | Notifikasi |
| GET/PATCH | `/profile` | Profil (nama, email, WA, foto) |
| POST | `/password` | Ganti kata sandi portal |

### 3.4 Admin — butuh JWT admin

| Method | Path | Peran |
|---|---|---|
| GET | `/api/customer-requests?status=` | admin, operator |
| GET | `/api/customer-requests/counts` | admin, operator |
| POST | `/api/customer-requests/:id/contacted` | admin, operator |
| POST | `/api/customer-requests/:id/approve` | admin |
| POST | `/api/customer-requests/:id/reject` | admin |
| DELETE | `/api/customer-requests/:id` | admin |
| GET/POST/PATCH/DELETE | `/api/coverage-areas` | baca: admin+operator, tulis: admin |
| GET | `/api/portal-accounts/:customerId` | admin, operator |
| POST | `/api/portal-accounts/:customerId/reset-password` | admin |
| PATCH | `/api/portal-accounts/:customerId/access` | admin |
| POST | `/api/portal-accounts/:customerId/logout-all` | admin |
| PATCH | `/api/portal/settings` | admin (konten landing + saklar fitur portal) |

Dokumentasi interaktif: `http://<host>:3000/api/docs`.

---

## 4. Keamanan yang diterapkan (§38)

- **Identitas selalu dari token.** `CustomerJwtGuard` memvalidasi JWT *dan*
  baris `customer_sessions` (hash token cocok, belum dicabut, belum kedaluwarsa).
  Tidak ada endpoint portal yang menerima `customerId` dari klien.
- **Kepemilikan diperiksa di query.** Detail tagihan/notifikasi/sesi difilter
  dengan `customer_id` milik token; kalau tidak cocok dijawab `404`, bukan `403`,
  agar keberadaan data tidak bocor.
- **Kata sandi** Argon2id, minimal 8 karakter + huruf & angka. Mengganti kata
  sandi mencabut semua sesi.
- **OTP** 6 digit, berlaku 5 menit, sekali pakai, maksimal 5 percobaan,
  disimpan sebagai HMAC (bukan plaintext), dibandingkan dengan `timingSafeEqual`.
- **Rate limit** (in-memory sliding window, `RateLimitService`):
  login 5×/10 menit per IP+identitas, OTP 3×/10 menit per nomor dan 10×/10 menit
  per IP, cek tagihan 8×/10 menit, pendaftaran 5×/jam.
- **Respons seragam** untuk identitas tak dikenal supaya tidak bisa dipakai
  memetakan siapa saja pelanggan.
- **Audit log** mencatat semua POST/PATCH/DELETE; aksi portal tercatat sebagai
  `customer:<id>`. Body request tidak pernah disimpan, jadi kata sandi WiFi &
  kata sandi portal tidak masuk audit.
- **Data teknis** (kredensial MikroTik, kata sandi PPPoE, OID/redaman OLT)
  tidak pernah dikirim ke portal pelanggan.

---

## 5. Menjalankan

### Docker (rekomendasi, sama seperti sebelumnya)

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Entrypoint menjalankan migration lalu seeder. Buka `http://localhost:3000`.

### Pengembangan lokal

```bash
cd rtrw-billing-backend && npm install && npm run migration:run && npm run seed && npm run start:dev
```

```bash
cd rtrw-billing-frontend && npm install && npm run dev
```

Vite dev server di `http://localhost:5173` (proxy `/api` ke `:3000`).

### Akun demo (hasil seeder — GANTI di produksi)

| Peran | Masuk lewat | Kredensial |
|---|---|---|
| Admin | `/admin/login` | `admin@rtrw.local` / `admin12345` |
| Pelanggan | `/portal/masuk` | `CST000001` / `pelanggan123` |

Pelanggan demo lain: `CST000002` … `CST000005`, kata sandi sama.
Login OTP WhatsApp memerlukan gateway WA aktif; tanpa itu kode OTP hanya
dicetak ke log aplikasi (`[WA dev] -> …`) — cukup untuk pengujian lokal.

---

## 6. Yang sengaja ditunda

| Fase | Isi |
|---|---|
| 2 | Payment gateway (Midtrans/Xendit/Tripay/Duitku) di balik `PaymentGatewayInterface`, invoice PDF server-side. Phase 1 memakai transfer/QRIS + konfirmasi manual yang sudah ada. |
| 3 | Auto isolate/activate sudah ada di aplikasi; yang menyusul adalah pilihan aksi isolasi per router di UI |
| 4 | Template notifikasi WhatsApp per kejadian + penjadwalan pengingat |
| 5 | Guest WiFi, sembunyikan SSID, restart perangkat, WiFi lanjutan (mengikuti kemampuan perangkat) |
| 6 | Grafik pemakaian trafik pelanggan (24 jam / 7 hari / 30 hari) |
| 7 | Tiket bantuan + diagnosa otomatis + panel teknisi (`/technician`) |
| 8 | Laporan keuangan lanjutan, backup terjadwal, hardening |

Saklar fitur portal (Pengaturan → **Landing & Portal Pelanggan**) sudah
menyediakan tombol untuk fitur fase berikutnya dalam keadaan mati, sehingga
tidak ada tombol "mati suri" di sisi pelanggan.
