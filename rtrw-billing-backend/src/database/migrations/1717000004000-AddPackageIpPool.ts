import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPackageIpPool1717000004000 implements MigrationInterface {
  name = 'AddPackageIpPool1717000004000';

  public async up(q: QueryRunner): Promise<void> {
    // Nama IP pool Mikrotik yang dipakai paket (mis. "pool-dhcp"). Opsional.
    await q.query(`ALTER TABLE "service_packages" ADD COLUMN "ip_pool" VARCHAR;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_packages" DROP COLUMN "ip_pool";`);
  }
}
