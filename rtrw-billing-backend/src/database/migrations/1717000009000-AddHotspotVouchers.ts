import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHotspotVouchers1717000009000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS hotspot_vouchers (
        id               BIGSERIAL PRIMARY KEY,
        code             VARCHAR(20) UNIQUE NOT NULL,
        username         VARCHAR(20) UNIQUE NOT NULL,
        password_enc     BYTEA       NOT NULL,
        package_id       INTEGER     REFERENCES hotspot_packages(id),
        router_id        BIGINT      REFERENCES routers(id),
        status           VARCHAR(20) NOT NULL DEFAULT 'pending',
        buyer_name       VARCHAR,
        buyer_phone_enc  BYTEA,
        payment_ref      VARCHAR,
        payment_gateway  VARCHAR,
        amount           NUMERIC(10,2),
        expires_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_hvoucher_code   ON hotspot_vouchers(code)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_hvoucher_status ON hotspot_vouchers(status)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS hotspot_vouchers`);
  }
}
