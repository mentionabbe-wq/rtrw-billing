import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHotspotPackageSharedUsers1717000011000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE hotspot_packages ADD COLUMN IF NOT EXISTS shared_users INT NOT NULL DEFAULT 1`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE hotspot_packages DROP COLUMN IF EXISTS shared_users`);
  }
}
