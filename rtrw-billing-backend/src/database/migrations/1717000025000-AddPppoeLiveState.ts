import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Status PPPoE hasil polling berkala, disimpan per langganan.
 *
 * Sebelumnya status PPPoE hanya dibaca saat halaman dibuka dan tidak pernah
 * disimpan — berbeda dengan ONU yang dipoll cron tiap 5 menit. Akibatnya
 * pelanggan bisa tampil "PPPoE tidak terhubung" padahal jaringannya sehat,
 * hanya karena router sedang tidak terjawab atau berstatus bukan `online`.
 */
export class AddPppoeLiveState1717000025000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_online BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_ip VARCHAR(64)`);
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_uptime VARCHAR(32)`);
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_caller_id VARCHAR(64)`);
    await qr.query(
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_router_id BIGINT REFERENCES routers(id) ON DELETE SET NULL`,
    );
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ`);
    await qr.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS live_checked_at TIMESTAMPTZ`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_subs_live_online ON subscriptions (live_online)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_subs_live_online`);
    for (const col of [
      'live_online', 'live_ip', 'live_uptime', 'live_caller_id', 'live_router_id',
      'last_online_at', 'live_checked_at',
    ]) {
      await qr.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS ${col}`);
    }
  }
}
