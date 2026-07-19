import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaAdminNotify1717000014000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS wa_admin_phone VARCHAR`);
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS wa_notify_enabled BOOLEAN NOT NULL DEFAULT false`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS wa_admin_phone`);
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS wa_notify_enabled`);
  }
}
