# Deploy ke CasaOS (atau Docker host apa pun)

CasaOS = host Docker. Anda **tidak perlu Node** di server — build berjalan di dalam
container. Yang dibutuhkan: Docker (bawaan CasaOS) + akses **Terminal/SSH**, dan
kedua folder project (`rtrw-billing-backend` & `rtrw-billing-frontend`) tersalin ke server.

## Langkah (paling andal — lewat SSH/Terminal)

1. **Salin project** ke server, mis. ke `/DATA/AppData/rtrw/`, sehingga ada:
   ```
   /DATA/AppData/rtrw/rtrw-billing-backend/
   /DATA/AppData/rtrw/rtrw-billing-frontend/
   ```

2. **Masuk ke folder backend & siapkan .env:**
   ```sh
   cd /DATA/AppData/rtrw/rtrw-billing-backend
   cp .env.example .env
   # generate kunci enkripsi 32-byte (wajib):
   echo "DATA_ENC_KEY=$(openssl rand -hex 32)"   # salin ke .env
   nano .env                                      # isi JWT_SECRET, JWT_REFRESH_SECRET, dll
   ```
   Minimal yang harus diganti di `.env`: `DATA_ENC_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
   (`DB_HOST`/`REDIS_HOST` diisi otomatis oleh compose.)

3. **Pre-build UI React ke `./client`** (pakai container Node sekali pakai — tanpa Node di host):
   ```sh
   mkdir -p client
   docker run --rm \
     -v "$(pwd)/../rtrw-billing-frontend:/fe" \
     -v "$(pwd)/client:/out" \
     -w /fe node:20-alpine \
     sh -c "npm ci && npm run build -- --outDir /out"
   ```

4. **Build & jalankan** (migrasi + seed otomatis):
   ```sh
   docker compose -f docker-compose.casaos.yml up -d --build
   ```

5. **Buka** `http://IP-CASAOS:3000` → login `admin@rtrw.local` / `admin12345`
   (langsung ganti password lewat menu Pengguna, dan aktifkan 2FA di menu Keamanan).

6. Setelah berjalan normal, set `SEED_ON_START: "false"` di `docker-compose.casaos.yml`
   lalu `docker compose -f docker-compose.casaos.yml up -d` lagi.

> Container akan muncul otomatis di dashboard CasaOS (bagian container/app yang berjalan).

## Paste di App Store CasaOS (Custom Install)

App Store CasaOS menjalankan compose dengan **menarik image jadi** — tidak bisa
build dari source. Jadi: build image lokal **satu kali** via SSH, lalu paste compose
yang menunjuk image lokal itu.

**1. Build image sekali (SSH):**
```sh
cd /DATA/AppData/rtrw/rtrw-billing-backend
cp .env.example .env            # cukup ada filenya (env asli diisi di compose App Store)
mkdir -p client
# build UI React ke ./client
docker run --rm -v "$(pwd)/../rtrw-billing-frontend:/fe" -v "$(pwd)/client:/out" \
  -w /fe node:20-alpine sh -c "npm ci && npm run build -- --outDir /out"
# build image aplikasi & beri tag
docker build -f Dockerfile.casaos -t rtrw-billing:latest .
```

**2. Generate kunci enkripsi** (akan ditempel ke compose):
```sh
openssl rand -hex 32
```

**3. Di CasaOS:** App Store → ikon **+** (pojok kanan atas) → **Install a customized app**
→ pilih tab **Docker Compose** → **paste isi file [`casaos-appstore.yml`](casaos-appstore.yml)**.
Sebelum submit, ganti pada compose: `DATA_ENC_KEY` (hasil langkah 2), `DB_PASS`
(di service app **dan** postgres harus sama), serta `JWT_SECRET`/`JWT_REFRESH_SECRET`.
Klik **Install**.

**4.** Buka aplikasinya dari dashboard CasaOS (atau `http://IP-CASAOS:3000`) →
login `admin@rtrw.local` / `admin12345`.

**5.** Setelah jalan, edit app di CasaOS → set `SEED_ON_START` = `false` → apply.

> Update versi: ulangi langkah 1 (build ulang `rtrw-billing:latest`), lalu di CasaOS
> klik **Recreate** pada app-nya.

### Mau benar-benar "paste tanpa build sama sekali"?
Itu butuh image yang sudah dipublish ke registry publik (GHCR/Docker Hub). Kalau Anda
push kedua folder ini ke satu repo GitHub, saya bisa buatkan GitHub Actions yang otomatis
build & push image ke `ghcr.io`, sehingga compose App Store cukup menunjuk
`ghcr.io/<user>/rtrw-billing:latest` dan CasaOS menariknya sendiri — tinggal beri tahu saya.

## Alternatif: Docker modern (Compose ≥ 2.17)
Jika Docker di server sudah baru, bisa langsung tanpa pre-build manual:
```sh
cd rtrw-billing-backend && cp .env.example .env   # isi secret
docker compose up -d --build                       # pakai docker-compose.yml (additional_contexts)
```

## Update versi
```sh
git pull                       # atau salin ulang file
# ulangi langkah 3 (pre-build UI) bila frontend berubah
docker compose -f docker-compose.casaos.yml up -d --build
```

## Catatan keamanan
- Ganti semua secret default di `.env` sebelum dipakai sungguhan.
- Compose CasaOS ini **tidak** mengekspos Postgres/Redis ke host (hanya internal).
- Taruh di belakang reverse proxy + HTTPS bila diakses dari luar jaringan lokal.
- Jam server harus sinkron (NTP) agar 2FA TOTP akurat.

## Troubleshooting
- **Build gagal di `additional_contexts`** → pakai jalur CasaOS (`docker-compose.casaos.yml`) di atas.
- **Login 2FA selalu ditolak** → cek jam server: `date`, sinkronkan NTP.
- **Port 3000 bentrok** → ubah mapping jadi `"8080:3000"` di compose.
- **Lihat log:** `docker compose -f docker-compose.casaos.yml logs -f app`
