# Panduan Instalasi RT/RW Net Billing

Aplikasi ini terdiri dari **2 komponen terpisah** yang bisa dipasang sesuai kebutuhan:

| Komponen | File Compose | Port | Keterangan |
|---|---|---|---|
| **Billing App** | `casaos-appstore.yml` | 3000 | Wajib |
| **GenieACS** (TR-069) | `genieacs-casaos.yml` | 7547/7557/3001 | Opsional |

---

## PILIHAN METODE INSTALASI

| Metode | Cocok untuk | Butuh GitHub Public? |
|---|---|---|
| [A. CasaOS via GHCR](#a-instalasi-di-casaos-via-ghcr) | Server/mini-PC dengan CasaOS | ✅ Ya |
| [B. Build dari Source (tanpa GitHub Public)](#b-instalasi-lokal-build-dari-source) | Komputer dengan kode sumber | ❌ Tidak |
| [C. Windows — Docker Desktop](#c-instalasi-di-windows-via-docker-desktop) | Windows 10/11 | Bisa keduanya |
| [D. Login GHCR (private)](#d-alternatif-login-ghcr-tanpa-public) | Sudah punya akun GitHub | ❌ Tidak |

---

## B. Instalasi Lokal — Build dari Source

> **Tidak perlu GitHub Public.** Gunakan cara ini jika kode sudah ada di komputer (clone dari repo private Anda).

### Prasyarat
- **Docker Desktop** (Windows/Mac) atau **Docker Engine** (Linux) sudah terpasang
- Kode sumber sudah di-clone: `git clone https://github.com/mentionabbe-wq/rtrw-billing`

### Langkah 1 — Masuk ke Folder Repo

**Windows (PowerShell/CMD):**
```cmd
cd C:\path\ke\rtrw-billing
```

**Linux/Mac:**
```bash
cd /path/ke/rtrw-billing
```

### Langkah 2 — Edit Konfigurasi

Buka file `docker-compose.local.yml` dengan editor teks, ganti nilai berikut:

```yaml
DB_PASS: password-database-anda        # ganti dengan password sesuka Anda
JWT_SECRET: string-acak-panjang-1      # min. 32 karakter acak
JWT_REFRESH_SECRET: string-acak-2      # min. 32 karakter acak, berbeda dari atas
DATA_ENC_KEY: 0f1e2d3c...              # 64 karakter hex — generate di bawah
POSTGRES_PASSWORD: password-database-anda  # HARUS SAMA dengan DB_PASS
```

**Generate `DATA_ENC_KEY` (pilih salah satu):**
- Linux/Mac: `openssl rand -hex 32`
- Windows PowerShell: `[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()`
- Online: [codebeautify.org/generate-random-string](https://codebeautify.org/generate-random-string) → pilih Hex, 64 karakter

### Langkah 3 — Build dan Jalankan

```cmd
docker compose -f docker-compose.local.yml up -d --build
```

> Proses build pertama membutuhkan waktu **5–15 menit** (mengunduh Node.js, mengompilasi frontend+backend).  
> Build berikutnya lebih cepat karena Docker menyimpan cache layer.

### Langkah 4 — Buka Aplikasi

Browser → `http://localhost:3000`

Login: **admin@rtrw.local** / **admin12345**

### Update ke Versi Terbaru (setelah git pull)

```cmd
git pull
docker compose -f docker-compose.local.yml up -d --build
```

---

## D. Alternatif — Login GHCR (tanpa set Public)

Jika tidak mau build dari source tapi package tetap private, bisa login ke GHCR dengan token GitHub.

### Langkah 1 — Buat GitHub Personal Access Token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Klik **Generate new token** → beri nama mis. "docker-pull"
3. Centang scope: **`read:packages`** saja
4. Klik **Generate** → **salin token** (hanya tampil sekali)

### Langkah 2 — Login Docker ke GHCR

**Windows (PowerShell):**
```powershell
echo "TOKEN_ANDA" | docker login ghcr.io -u USERNAME_GITHUB --password-stdin
```

**Linux/Mac:**
```bash
echo "TOKEN_ANDA" | docker login ghcr.io -u USERNAME_GITHUB --password-stdin
```

Ganti `TOKEN_ANDA` dengan token dari langkah 1, dan `USERNAME_GITHUB` dengan username GitHub Anda (`mentionabbe-wq`).

### Langkah 3 — Jalankan dengan Compose Biasa

```cmd
docker compose -f docker-compose.local.yml up -d
```

> Setelah login, gunakan file `docker-compose.local.yml` tapi **hapus bagian `build:`** dan ganti dengan:
> ```yaml
> image: ghcr.io/mentionabbe-wq/rtrw-billing:latest
> ```

---

## A. Instalasi di CasaOS (via GHCR)

### Prasyarat
- CasaOS sudah terpasang ([casaos.io](https://casaos.io))
- Koneksi internet untuk tarik image dari GitHub Container Registry

### Langkah 1 — Izinkan Image dari GHCR

Image disimpan di **GitHub Container Registry (GHCR)**. Paket harus berstatus **Public** agar bisa ditarik tanpa login.

1. Buka [github.com](https://github.com) → login → klik foto profil → **Your packages**
2. Klik paket **rtrw-billing** → **Package settings** → **Change visibility** → **Public** → Confirm
3. *(Opsional)* Ulangi untuk paket **genieacs**

### Langkah 2 — Pasang Billing App

1. Buka CasaOS → **App Store** → ikon **+** pojok kanan atas → **Install a customized app**
2. Hapus isi yang ada, paste isi file `casaos-appstore.yml`
3. **Ganti nilai berikut sebelum klik Install:**

   ```yaml
   DB_PASS: ganti-password-database-anda
   JWT_SECRET: string-acak-minimal-32-karakter
   JWT_REFRESH_SECRET: string-acak-lain-minimal-32-karakter
   DATA_ENC_KEY: 64-karakter-hex  # gunakan: openssl rand -hex 32
   ```

   > **Generate secret secara online:** [generate-secret.vercel.app](https://generate-secret.vercel.app/32)  
   > Untuk `DATA_ENC_KEY` pastikan panjangnya 64 karakter hex (32 byte).

4. Klik **Install** → tunggu download selesai
5. Buka browser → `http://IP-CASAOS:3000`
6. Login default: **admin@rtrw.local** / **admin12345**  
   *(Segera ganti password setelah login pertama!)*

### Langkah 3 — Pasang GenieACS (Opsional, untuk kontrol ONU TR-069)

1. CasaOS → **App Store** → **+** → **Install a customized app**
2. Paste isi file `genieacs-casaos.yml`
3. Ganti `GENIEACS_UI_JWT_SECRET` dengan string acak:
   ```yaml
   GENIEACS_UI_JWT_SECRET: string-acak-genieacs
   ```
4. Klik **Install**
5. Setelah jalan, buka `http://IP-CASAOS:3001` untuk UI GenieACS

### Langkah 4 — Hubungkan GenieACS ke Billing (Opsional)

Di CasaOS, edit app **rtrw-billing** → ubah environment:
```yaml
GENIEACS_URL: http://IP-CASAOS:7557
```
Klik **Update** → app akan restart otomatis.

---

## B. Instalasi di Windows (via Docker Desktop)

### Prasyarat
- Windows 10/11 (64-bit)
- **Docker Desktop** sudah terpasang ([docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/))
- WSL2 diaktifkan (Docker Desktop akan memandu saat pertama kali)

### Langkah 1 — Install Docker Desktop

1. Download dari [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Jalankan installer → ikuti wizard
3. Restart Windows jika diminta
4. Buka Docker Desktop → pastikan status **Running** (ikon paus hijau di system tray)

### Langkah 2 — Buat File Konfigurasi

Buka **Notepad** atau editor teks lain, buat file baru di folder yang diinginkan  
(misalnya `C:\rtrw-billing\`) dengan nama **`docker-compose.yml`**:

```yaml
name: rtrw-billing
services:
  app:
    image: ghcr.io/mentionabbe-wq/rtrw-billing:latest
    container_name: rtrw-billing-app
    restart: unless-stopped
    environment:
      PORT: "3000"
      DB_HOST: rtrw-billing-postgres
      DB_PORT: "5432"
      DB_USER: rtrw
      DB_PASS: password-database-anda        # <-- GANTI
      DB_NAME: rtrw_billing
      REDIS_HOST: rtrw-billing-redis
      REDIS_PORT: "6379"
      JWT_SECRET: string-acak-panjang-1      # <-- GANTI
      JWT_REFRESH_SECRET: string-acak-2      # <-- GANTI
      JWT_EXPIRES: 15m
      JWT_REFRESH_EXPIRES: 7d
      DATA_ENC_KEY: 0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff00  # <-- GANTI (64 hex)
      SEED_ON_START: "true"
      GENIEACS_URL: ""
      GENIEACS_USERNAME: ""
      GENIEACS_PASSWORD: ""
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    networks:
      - rtrw-net

  postgres:
    image: postgres:16-alpine
    container_name: rtrw-billing-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: rtrw
      POSTGRES_PASSWORD: password-database-anda   # <-- sama dengan DB_PASS di atas
      POSTGRES_DB: rtrw_billing
    volumes:
      - rtrw-postgres-data:/var/lib/postgresql/data
    networks:
      - rtrw-net

  redis:
    image: redis:7-alpine
    container_name: rtrw-billing-redis
    restart: unless-stopped
    networks:
      - rtrw-net

volumes:
  rtrw-postgres-data:

networks:
  rtrw-net:
    driver: bridge
```

> **Catatan perbedaan dengan CasaOS:** volume PostgreSQL menggunakan named volume (`rtrw-postgres-data`) agar data tersimpan di dalam Docker — lebih mudah di Windows dibanding bind mount ke path Windows.

### Langkah 3 — Jalankan Aplikasi

Buka **Command Prompt** atau **PowerShell**, masuk ke folder tadi:

```cmd
cd C:\rtrw-billing
docker compose up -d
```

Docker akan otomatis mengunduh image (~300MB) dan menjalankan semua layanan.

### Langkah 4 — Buka Aplikasi

Buka browser → `http://localhost:3000`

Login: **admin@rtrw.local** / **admin12345**

### Langkah 5 — Pasang GenieACS di Windows (Opsional)

Buat file terpisah `C:\rtrw-billing\genieacs-compose.yml`:

```yaml
name: genieacs
services:
  app:
    image: ghcr.io/mentionabbe-wq/genieacs:latest
    container_name: genieacs
    restart: unless-stopped
    environment:
      GENIEACS_MONGODB_CONNECTION_URL: mongodb://genieacs-mongo:27017/genieacs
      GENIEACS_UI_JWT_SECRET: string-acak-genieacs   # <-- GANTI
    depends_on:
      - mongo
    ports:
      - "7547:7547"
      - "7557:7557"
      - "7567:7567"
      - "3001:3000"
    networks:
      - genieacs-net

  mongo:
    image: mongo:4.4
    container_name: genieacs-mongo
    restart: unless-stopped
    volumes:
      - genieacs-mongo-data:/data/db
    networks:
      - genieacs-net

volumes:
  genieacs-mongo-data:

networks:
  genieacs-net:
    driver: bridge
```

Jalankan:
```cmd
docker compose -f genieacs-compose.yml up -d
```

UI GenieACS: `http://localhost:3001`

---

## C. Perintah Berguna

### CasaOS
```bash
# Lihat log aplikasi
docker logs rtrw-billing-app -f

# Restart aplikasi
docker restart rtrw-billing-app

# Update ke versi terbaru
docker pull ghcr.io/mentionabbe-wq/rtrw-billing:latest
docker restart rtrw-billing-app
```

### Windows (PowerShell/CMD di folder project)
```cmd
# Lihat log
docker logs rtrw-billing-app -f

# Stop semua
docker compose down

# Start lagi
docker compose up -d

# Update ke versi terbaru
docker compose pull
docker compose up -d
```

---

## D. Konfigurasi Setelah Install

### 1. Ganti Password Admin
Login → klik nama pengguna → **Profil** → ganti password.

### 2. Tambah Router Mikrotik
Menu **Pengaturan** → **Router** → **+** → isi IP, port (8728), username, password API Mikrotik.

### 3. Tambah OLT
Menu **Pengaturan** → **OLT** → **+** → isi IP, community SNMP, pilih vendor (ZTE/Huawei/C-Data).

### 4. Sinkron Data dari Mikrotik
- Menu **Paket** → klik **Sinkron** (import profil PPPoE sebagai paket)
- Menu **Pelanggan** → klik **Sinkron** (import PPP secret sebagai pelanggan)

### 5. Aktifkan 2FA (Opsional)
Menu **Keamanan** → **Aktifkan 2FA** → scan QR dengan Google Authenticator / Authy.

---

## E. Port yang Digunakan

| Port | Layanan | Keterangan |
|---|---|---|
| 3000 | RT/RW Billing | Web UI + API |
| 3001 | GenieACS UI | Panel kelola ONU TR-069 |
| 7547 | GenieACS CWMP | ONU diarahkan ke sini |
| 7557 | GenieACS NBI | Dipakai app billing |
| 7567 | GenieACS FS | Server firmware ONU |

---

## F. Troubleshooting

**App tidak bisa dibuka:**
```cmd
docker ps -a
docker logs rtrw-billing-app
```

**Database error saat start:**
- Tunggu 10–15 detik lalu refresh — PostgreSQL butuh waktu inisialisasi awal
- Pastikan `DB_PASS` di app dan `POSTGRES_PASSWORD` di postgres **sama persis**

**Mikrotik tidak bisa konek:**
- Pastikan API Mikrotik aktif: Winbox → IP → Services → api (port 8728) → centang Enable
- Coba port 8728 dulu, app akan otomatis fallback ke 8729

**ONU tidak muncul di GenieACS:**
- Pastikan ONU bisa ping ke IP server
- Cek log: `docker logs genieacs -f`
- Pastikan ACS URL di ONU: `http://IP-SERVER:7547`

**Image tidak bisa diunduh (unauthorized):**
- Pastikan paket GHCR di GitHub sudah diset **Public**
- GitHub → profil → Packages → rtrw-billing → Package settings → Change visibility → Public
