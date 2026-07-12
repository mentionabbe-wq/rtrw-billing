import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenieacsIntegration1717000013000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS genieacs_url VARCHAR`);
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS genieacs_username VARCHAR`);
    await qr.query(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS genieacs_password_enc BYTEA`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS genieacs_url`);
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS genieacs_username`);
    await qr.query(`ALTER TABLE integration_settings DROP COLUMN IF EXISTS genieacs_password_enc`);
  }
}
