# RT/RW Net Billing (monorepo)

Sistem billing RT/RW Net: backend NestJS + frontend React, terintegrasi jadi satu
aplikasi (satu image, satu port). Integrasi Mikrotik RouterOS API (auto-suspend,
bandwidth), monitoring SNMP OLT (ZTE/Huawei), tagihan otomatis + WhatsApp,
dashboard real-time, RBAC, 2FA, dan audit log.

```
rtrw-billing/
├── rtrw-billing-backend/    # NestJS API + worker (BullMQ) + serve UI
├── rtrw-billing-frontend/   # React + Vite + Tailwind (di-build ke client/)
├── Dockerfile               # build FE+BE jadi satu image
├── casaos-appstore.yml      # compose siap-paste di CasaOS (image GHCR)
└── .github/workflows/build-image.yml  # auto build & push ke ghcr.io
```

## Image otomatis (GHCR)
Setiap push ke `main`, GitHub Actions build image multi-arch (amd64+arm64) dan push ke:
```
ghcr.io/mentionabbe-wq/rtrw-billing:latest
```

## Pasang di CasaOS (paste di App Store)
1. Pastikan package GHCR sudah **public** (GitHub → repo → Packages → rtrw-billing →
   Package settings → Change visibility → Public). Atau di host: `docker login ghcr.io`.
2. CasaOS → App Store → **+** → *Install a customized app* → tab **Docker Compose** →
   paste isi [`casaos-appstore.yml`](casaos-appstore.yml).
3. Ganti `DATA_ENC_KEY` (hasil `openssl rand -hex 32`), `DB_PASS` (di service app &
   postgres harus sama), serta `JWT_SECRET`/`JWT_REFRESH_SECRET`. Install.
4. Buka `http://IP-CASAOS:3000` → login `admin@rtrw.local` / `admin12345`.
5. Setelah jalan, set `SEED_ON_START: "false"` lalu Recreate.

## Jalankan lokal untuk dev
Lihat README di masing-masing subfolder. Singkatnya: backend `npm run start:dev`
(butuh Postgres+Redis), frontend `npm run dev` (proxy ke :3000).

## Detail teknis
- Backend & arsitektur: [`rtrw-billing-backend/README.md`](rtrw-billing-backend/README.md)
- Frontend: [`rtrw-billing-frontend/README.md`](rtrw-billing-frontend/README.md)
- Deploy non-App-Store (SSH/Docker): [`rtrw-billing-backend/DEPLOY-CASAOS.md`](rtrw-billing-backend/DEPLOY-CASAOS.md)
