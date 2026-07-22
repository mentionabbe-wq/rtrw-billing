import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceLosStrikes1717000018000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS los_strikes INT NOT NULL DEFAULT 0`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE devices DROP COLUMN IF EXISTS los_strikes`);
  }
}
