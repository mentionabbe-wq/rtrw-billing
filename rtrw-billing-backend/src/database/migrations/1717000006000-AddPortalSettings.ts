import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortalSettings1717000006000 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        company_name VARCHAR NOT NULL DEFAULT 'RT/RW Net',
        logo_url VARCHAR,
        primary_color VARCHAR NOT NULL DEFAULT '#012b6d',
        tagline VARCHAR NOT NULL DEFAULT 'Layanan Internet Rumahan',
        suspend_message TEXT NOT NULL DEFAULT 'Internet Anda ditangguhkan karena belum melakukan pembayaran bulan ini.',
        whatsapp_number VARCHAR,
        payment_instructions TEXT,
        bank_accounts JSONB NOT NULL DEFAULT '[]',
        footer_text VARCHAR
      )
    `);
    await qr.query(`INSERT INTO portal_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
  }

  async down(qr: QueryRunner) {
    await qr.query(`DROP TABLE IF EXISTS portal_settings`);
  }
}
