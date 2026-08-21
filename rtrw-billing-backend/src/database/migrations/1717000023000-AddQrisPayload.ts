import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QRIS dinamis tanpa payment gateway: menyimpan payload QRIS STATIS milik
 * merchant, lalu tiap tagihan menghasilkan QR dengan nominal terisi otomatis.
 * Berbeda dari `qris_image` (gambar QRIS statis) yang sudah ada sebelumnya.
 */
export class AddQrisPayload1717000023000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS qris_payload TEXT`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE portal_settings DROP COLUMN IF EXISTS qris_payload`);
  }
}
