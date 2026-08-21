import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 1 — Portal pelanggan & landing page publik.
 *
 * Menambahkan:
 *  - kolom akun portal pada `customers` (email, password, hash telepon utk cari)
 *  - `customer_sessions`  : manajemen sesi + "keluar dari semua perangkat"
 *  - `customer_otps`      : OTP WhatsApp/email (login, cek tagihan, reset sandi)
 *  - `customer_requests`  : formulir pendaftaran calon pelanggan
 *  - `coverage_areas`     : area layanan utk cek ketersediaan di landing page
 *  - `customer_notifications` : lonceng notifikasi di portal
 *  - kolom publik pada `service_packages` (deskripsi, fitur, kecepatan)
 *  - kolom konten landing + saklar fitur portal pada `portal_settings`
 *
 * Catatan: nomor telepon TIDAK pernah disimpan plaintext. Kolom `phone_hash`
 * berisi HMAC-SHA256 (kunci DATA_ENC_KEY) supaya nomor tetap bisa dicari
 * tanpa mendekripsi seluruh tabel.
 */
export class AddCustomerPortalPhase11717000022000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── customers: akun portal ────────────────────────────────────────────
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_hash CHAR(64)`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS rt VARCHAR(8)`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS rw VARCHAR(8)`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT true`);
    await qr.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email ON customers (LOWER(email)) WHERE email IS NOT NULL`,
    );
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_customers_phone_hash ON customers (phone_hash)`);

    // ── sesi portal ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS customer_sessions (
        id BIGSERIAL PRIMARY KEY,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        user_agent VARCHAR(255),
        ip VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_cust_sessions_active ON customer_sessions (customer_id, revoked_at)`,
    );

    // ── OTP ───────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS customer_otps (
        id BIGSERIAL PRIMARY KEY,
        purpose VARCHAR(32) NOT NULL,
        channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp',
        target_hash CHAR(64) NOT NULL,
        target_masked VARCHAR(64) NOT NULL,
        customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
        code_hash CHAR(64) NOT NULL,
        attempts SMALLINT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        ip VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_cust_otp_lookup ON customer_otps (target_hash, purpose, created_at DESC)`,
    );

    // ── pendaftaran calon pelanggan ───────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS customer_requests (
        id BIGSERIAL PRIMARY KEY,
        request_no VARCHAR(24) NOT NULL UNIQUE,
        full_name VARCHAR NOT NULL,
        phone_enc BYTEA NOT NULL,
        phone_hash CHAR(64) NOT NULL,
        phone_masked VARCHAR(32) NOT NULL,
        email VARCHAR,
        address TEXT NOT NULL,
        rt VARCHAR(8),
        rw VARCHAR(8),
        geo_lat NUMERIC(10,7),
        geo_lng NUMERIC(10,7),
        package_id BIGINT REFERENCES service_packages(id) ON DELETE SET NULL,
        note TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        reject_reason TEXT,
        customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
        handled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        handled_at TIMESTAMPTZ,
        ip VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_cust_requests_status ON customer_requests (status, created_at DESC)`,
    );

    // ── area coverage ─────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS coverage_areas (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        village VARCHAR,
        district VARCHAR,
        rt VARCHAR(8),
        rw VARCHAR(8),
        lat NUMERIC(10,7),
        lng NUMERIC(10,7),
        radius_m INT NOT NULL DEFAULT 700,
        status VARCHAR(16) NOT NULL DEFAULT 'available',
        note TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_coverage_active ON coverage_areas (is_active, status)`);

    // ── notifikasi pelanggan ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS customer_notifications (
        id BIGSERIAL PRIMARY KEY,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL DEFAULT 'info',
        title VARCHAR NOT NULL,
        body TEXT,
        link VARCHAR,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_cust_notif ON customer_notifications (customer_id, created_at DESC)`,
    );

    // ── paket: kolom untuk halaman publik ─────────────────────────────────
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS description TEXT`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS speed_down_mbps INT`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS speed_up_mbps INT`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS badge VARCHAR(24)`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0`);

    // Isi kecepatan dari rate_limit lama, mis. "20M/10M" → 20 / 10 Mbps.
    await qr.query(`
      UPDATE service_packages SET
        speed_down_mbps = COALESCE(speed_down_mbps, NULLIF(substring(rate_limit from '^[[:space:]]*([0-9]+)[Mm]'), '')::int),
        speed_up_mbps   = COALESCE(speed_up_mbps,   NULLIF(substring(rate_limit from '/[[:space:]]*([0-9]+)[Mm]'), '')::int)
      WHERE rate_limit IS NOT NULL
    `);

    // ── konten landing page + saklar fitur portal ─────────────────────────
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS hero_title VARCHAR`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS hero_subtitle TEXT`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS coverage_note TEXT`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '[]'`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS office_address TEXT`);
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS contact_email VARCHAR`);
    await qr.query(
      `ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS network_status VARCHAR(16) NOT NULL DEFAULT 'operational'`,
    );
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS network_status_note TEXT`);
    await qr.query(
      `ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS registration_enabled BOOLEAN NOT NULL DEFAULT true`,
    );
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS portal_features JSONB NOT NULL DEFAULT '{}'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS customer_notifications`);
    await qr.query(`DROP TABLE IF EXISTS coverage_areas`);
    await qr.query(`DROP TABLE IF EXISTS customer_requests`);
    await qr.query(`DROP TABLE IF EXISTS customer_otps`);
    await qr.query(`DROP TABLE IF EXISTS customer_sessions`);

    for (const col of [
      'email', 'password_hash', 'phone_hash', 'photo_url', 'rt', 'rw',
      'portal_enabled', 'last_login_at',
    ]) {
      await qr.query(`ALTER TABLE customers DROP COLUMN IF EXISTS ${col}`);
    }
    for (const col of [
      'is_public', 'description', 'features', 'speed_down_mbps', 'speed_up_mbps',
      'badge', 'sort_order',
    ]) {
      await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS ${col}`);
    }
    for (const col of [
      'hero_title', 'hero_subtitle', 'coverage_note', 'faq', 'highlights',
      'office_address', 'contact_email', 'network_status', 'network_status_note',
      'registration_enabled', 'portal_features',
    ]) {
      await qr.query(`ALTER TABLE portal_settings DROP COLUMN IF EXISTS ${col}`);
    }
  }
}
