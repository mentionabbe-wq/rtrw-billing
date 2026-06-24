import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotpEnabled1717000002000 implements MigrationInterface {
  name = 'AddTotpEnabled1717000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "totp_enabled";`);
  }
}
