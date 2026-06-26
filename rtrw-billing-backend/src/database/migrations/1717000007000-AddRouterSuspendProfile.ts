import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouterSuspendProfile1717000007000 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "suspend_profile" VARCHAR`);
  }
  async down(qr: QueryRunner) {
    await qr.query(`ALTER TABLE "routers" DROP COLUMN IF EXISTS "suspend_profile"`);
  }
}
