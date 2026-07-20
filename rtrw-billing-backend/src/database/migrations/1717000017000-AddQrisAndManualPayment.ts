import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQrisAndManualPayment1717000017000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS qris_image TEXT`);
    // Voucher hotspot dipesan tanpa gateway → pelanggan klaim sudah bayar,
    // admin menyetujui manual. Simpan penanda klaim + catatannya.
    await qr.query(`ALTER TABLE hotspot_vouchers ADD COLUMN IF NOT EXISTS payment_claimed_at TIMESTAMPTZ`);
    await qr.query(`ALTER TABLE hotspot_vouchers ADD COLUMN IF NOT EXISTS payment_note VARCHAR`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE portal_settings DROP COLUMN IF EXISTS qris_image`);
    await qr.query(`ALTER TABLE hotspot_vouchers DROP COLUMN IF EXISTS payment_claimed_at`);
    await qr.query(`ALTER TABLE hotspot_vouchers DROP COLUMN IF EXISTS payment_note`);
  }
}
