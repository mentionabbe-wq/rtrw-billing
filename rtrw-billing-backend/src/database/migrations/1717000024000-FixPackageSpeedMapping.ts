import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perbaiki arah kecepatan paket.
 *
 * Migration Phase 1 mengisi `speed_down_mbps` dari angka PERTAMA rate-limit dan
 * `speed_up_mbps` dari angka kedua. Itu terbalik: rate-limit MikroTik berformat
 * `rx/tx` dilihat dari sisi router, jadi angka pertama adalah UNGGAH pelanggan
 * dan angka kedua UNDUH. Akibatnya paket "HOME 10MBPS" dengan rate-limit
 * `5M/10M` tampil sebagai 5 Mbps di halaman paket.
 *
 * Nilai diturunkan ulang dari `rate_limit`, hanya untuk paket yang punya dua
 * bagian (mengandung "/"). Paket dengan satu angka atau tanpa rate-limit
 * dibiarkan apa adanya.
 */
export class FixPackageSpeedMapping1717000024000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE service_packages SET
        speed_up_mbps   = NULLIF(substring(rate_limit from '^[[:space:]]*([0-9]+)[Mm]'), '')::int,
        speed_down_mbps = NULLIF(substring(rate_limit from '/[[:space:]]*([0-9]+)[Mm]'), '')::int
      WHERE rate_limit LIKE '%/%'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Kembalikan ke pemetaan lama (yang terbalik) agar migration reversibel.
    await qr.query(`
      UPDATE service_packages SET
        speed_down_mbps = NULLIF(substring(rate_limit from '^[[:space:]]*([0-9]+)[Mm]'), '')::int,
        speed_up_mbps   = NULLIF(substring(rate_limit from '/[[:space:]]*([0-9]+)[Mm]'), '')::int
      WHERE rate_limit LIKE '%/%'
    `);
  }
}
