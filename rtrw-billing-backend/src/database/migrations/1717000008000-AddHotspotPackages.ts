import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHotspotPackages1717000008000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS hotspot_packages (
        id               SERIAL PRIMARY KEY,
        name             VARCHAR NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 1440,
        price            NUMERIC(10,2) NOT NULL DEFAULT 0,
        mikrotik_profile VARCHAR NOT NULL DEFAULT 'default',
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      INSERT INTO hotspot_packages (name, duration_minutes, price, mikrotik_profile)
      VALUES
        ('1 Jam',  60,    2000, 'default'),
        ('3 Jam',  180,   5000, 'default'),
        ('1 Hari', 1440,  8000, 'default'),
        ('7 Hari', 10080, 40000,'default')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS hotspot_packages`);
  }
}
