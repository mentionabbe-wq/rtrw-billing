import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMapStatus1717000020000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'up'`);
    await qr.query(`ALTER TABLE map_cables ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'up'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE map_nodes DROP COLUMN IF EXISTS status`);
    await qr.query(`ALTER TABLE map_cables DROP COLUMN IF EXISTS status`);
  }
}
