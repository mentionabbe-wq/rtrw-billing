import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHotspotPackageRateLimit1717000010000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE hotspot_packages ADD COLUMN IF NOT EXISTS rate_limit VARCHAR`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE hotspot_packages DROP COLUMN IF EXISTS rate_limit`);
  }
}
