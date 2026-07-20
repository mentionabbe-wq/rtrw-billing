import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageProfileFields1717000016000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS local_address VARCHAR`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS dns_server VARCHAR`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS only_one VARCHAR NOT NULL DEFAULT 'default'`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS parent_queue VARCHAR`);
    await qr.query(`ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS insert_queue_before VARCHAR`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS local_address`);
    await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS dns_server`);
    await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS only_one`);
    await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS parent_queue`);
    await qr.query(`ALTER TABLE service_packages DROP COLUMN IF EXISTS insert_queue_before`);
  }
}
