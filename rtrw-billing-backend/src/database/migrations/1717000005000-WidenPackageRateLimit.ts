import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenPackageRateLimit1717000005000 implements MigrationInterface {
  name = 'WidenPackageRateLimit1717000005000';

  public async up(q: QueryRunner): Promise<void> {
    // rate-limit Mikrotik (dengan burst) bisa > 40 char → lebarkan agar muat.
    await q.query(`ALTER TABLE "service_packages" ALTER COLUMN "rate_limit" TYPE VARCHAR(120);`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_packages" ALTER COLUMN "rate_limit" TYPE VARCHAR(40);`);
  }
}
