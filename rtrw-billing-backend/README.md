# RT/RW Net Billing — Backend (NestJS)

REST API untuk sistem billing RT/RW Net dengan integrasi **Mikrotik RouterOS API**
(auto-suspend / activate / bandwidth) dan **SNMP OLT** (monitoring optical power ONU),
billing otomatis + webhook payment gateway, serta job scheduler (BullMQ + cron).

## Stack
- **NestJS 10** (REST + Swagger + WebSocket)
- **PostgreSQL** (TypeORM) · **Redis + BullMQ** (queue & cron worker)
- **node-routeros** (Mikrotik API-SSL) · **net-snmp** (SNMPv3 authPriv)
- **Argon2id** (password) · **AES-256-GCM** (data sensitif pelanggan)

## Struktur
```
src/
├── main.ts                  # bootstrap + Swagger + validation
├── app.module.ts            # wiring TypeORM / BullMQ / modules
├── config/                  # konfigurasi env
├── common/
│   ├── crypto/              # AES-256-GCM service (data sensitif)
│   ├── guards/              # RolesGuard (RBAC)
│   └── decorators/          # @Roles()
├── database/
│   ├── entities/            # 11 entity (customer, subscription, invoice, olt, ...)
│   ├── migrations/          # InitSchema (skema + partisi device_metrics)
│   ├── data-source.ts       # TypeORM CLI (ts & js) untuk migration/seed
│   └── seed.ts              # admin + paket + router + OLT + pelanggan dummy
└── modules/
    ├── auth/                # JWT login + Argon2 + strategy
    ├── customers/           # CRUD + enkripsi phone/NIK
    ├── mikrotik/            # suspend/activate/setBandwidth/ping (idempoten)
    ├── snmp/                # readOpticalPower / setOnuAdminStatus + vendor-profiles (ZTE/Huawei)
    ├── billing/             # generate invoice + webhook Midtrans/Tripay
    ├── packages/            # GET /packages
    ├── dashboard/           # GET /dashboard/stats
    ├── monitoring/          # Socket.IO gateway + GET /monitoring/devices
    └── scheduler/           # cron + BullMQ processors (queue: mikrotik, monitor)

# Build produksi juga menaruh UI React di ./client (disajikan backend di :3000)
```

## Menjalankan (server, butuh Node 20 + PostgreSQL + Redis)
```bash
cp .env.example .env          # isi DB, Redis, JWT_SECRET, DATA_ENC_KEY, gateway keys
openssl rand -hex 32          # generate DATA_ENC_KEY (32 byte)
npm install
npm run migration:run         # jalankan InitSchema (skema + partisi device_metrics + olts)
npm run seed                  # admin + paket + router + OLT + 5 pelanggan dummy
npm run start:dev
```
Swagger: `http://localhost:3000/api/docs`

## Satu aplikasi (frontend + backend, satu port/image)
Backend menyajikan UI React (hasil build) di port yang sama; `/api` & `/socket.io`
tetap untuk REST/WebSocket, sisanya melayani SPA.

**A. Docker (paling mudah — Postgres + Redis + UI + API sekaligus):**
```bash
cd rtrw-billing-backend
cp .env.example .env          # isi DATA_ENC_KEY, JWT, dll (DB_HOST/REDIS_HOST diisi compose)
docker compose up -d --build  # migrate + seed otomatis (SEED_ON_START=true)
# Buka http://localhost:3000  → login admin@rtrw.local / admin12345
```
Setelah seed pertama, set `SEED_ON_START=false` di `docker-compose.yml`.

**B. Tanpa Docker (manual):**
```bash
cd rtrw-billing-frontend && npm install && npm run build   # build → ../rtrw-billing-backend/client
cd ../rtrw-billing-backend && npm install
npm run build && npm run migration:run:prod && npm run seed:prod
npm run start:prod            # UI + API di http://localhost:3000
```

> Mode pengembangan tetap 2 proses (backend :3000 + `npm run dev` frontend :5173 dengan proxy).

## Alur kunci
- **Auto-suspend**: cron `5 0 * * *` → cari subscription `status=active & due_date<today`
  → enqueue job `suspend` → worker matikan PPPoE secret + isolir (retry otomatis).
- **Monitoring ONU**: cron `*/5 * * * *` → enqueue poll per device → SNMP GET optical
  power → simpan `device_metrics` → push event `onu:status` ke dashboard via Socket.IO.
- **Pembayaran**: webhook `POST /api/payments/webhook/{midtrans|tripay}` → verifikasi
  signature → `settlePayment()` perpanjang due_date + enqueue job `activate`.

## SNMP per-vendor (ZTE & Huawei)
OID + konversi dBm sudah disiapkan di `src/modules/snmp/vendor-profiles.ts`:
- **Huawei** (MA5600T/MA5800): RX `1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4`, unit 0.01 dBm → `dBm = raw/100`.
- **ZTE** (C300/C320): RX `1.3.6.1.4.1.3902.1012.3.50.12.1.1.10`, unit 0.001 dBm → `dBm = raw/1000`.

Vendor diambil dari kolom `olts.vendor` (`zte` | `huawei`). **Wajib validasi** OID &
skala dengan `snmpwalk` di OLT Anda — skala bisa beda antar firmware; cukup sesuaikan
fungsi `toDbm()` di file profil tsb.

## Yang WAJIB disesuaikan sebelum produksi
1. **Validasi OID SNMP** lewat `snmpwalk` lalu samakan `toDbm()` di
   `src/modules/snmp/vendor-profiles.ts` (ZTE/Huawei sudah terisi sebagai default).
2. **Kredensial OLT** — tabel `olts` sudah ada (host + vendor + SNMPv3 auth/priv
   terenkripsi), di-resolve otomatis oleh `monitor.processor.ts`. Ganti nilai dummy hasil seed.
3. **Mikrotik API user** — buat user least-privilege (`policy=api,read,write,test`),
   pakai API-SSL :8729, dan firewall whitelist IP server billing.
4. **Tripay signature** — verifikasi terhadap **raw request body** (aktifkan rawBody di
   `main.ts`), bukan hasil `JSON.stringify` ulang, agar byte-exact.
5. Ganti semua secret default di `.env` (JWT, DATA_ENC_KEY, password admin seed).
6. **Maintenance partisi** — `device_metrics` dipartisi bulanan. Migration awal
   membuat partisi bulan −1..+2 + `device_metrics_default`. Jadwalkan job bulanan
   `CREATE TABLE device_metrics_YYYY_MM PARTITION OF ...` dan drop partisi lama
   sesuai kebijakan retensi.

## Keamanan (ringkas)
- Data sensitif (phone, NIK, password PPPoE, kredensial perangkat) → AES-256-GCM (BYTEA).
- Password admin → Argon2id. Auth → JWT + RBAC (`admin`/`operator`/`finance`).
- Webhook tidak di-guard JWT → **signature wajib diverifikasi** (sudah diimplementasi).
- Semua aksi Mikrotik dicatat ke `mikrotik_sync_logs` (audit + idempotensi).
