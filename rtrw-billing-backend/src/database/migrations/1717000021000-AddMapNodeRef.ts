import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMapNodeRef1717000021000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS ref_type VARCHAR`);
    await qr.query(`ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS ref_id VARCHAR`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE map_nodes DROP COLUMN IF EXISTS ref_type`);
    await qr.query(`ALTER TABLE map_nodes DROP COLUMN IF EXISTS ref_id`);
  }
}
