import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationSettings1717000012000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS integration_settings (
        id INT PRIMARY KEY DEFAULT 1,
        tripay_api_key_enc BYTEA,
        tripay_private_key_enc BYTEA,
        tripay_merchant_code VARCHAR,
        tripay_mode VARCHAR NOT NULL DEFAULT 'sandbox',
        midtrans_server_key_enc BYTEA,
        midtrans_mode VARCHAR NOT NULL DEFAULT 'sandbox',
        wa_api_url VARCHAR,
        wa_api_token_enc BYTEA,
        wa_reminder_enabled BOOLEAN NOT NULL DEFAULT false,
        wa_reminder_days INT NOT NULL DEFAULT 3
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS integration_settings`);
  }
}
