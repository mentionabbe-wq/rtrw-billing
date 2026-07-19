import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramNotify1717000015000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS telegram_bot_token_enc BYTEA`);
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR`);
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS telegram_notify_enabled BOOLEAN NOT NULL DEFAULT false`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS telegram_bot_token_enc`);
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS telegram_chat_id`);
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS telegram_notify_enabled`);
  }
}
