import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOltSnmpVersion1717000003000 implements MigrationInterface {
  name = 'AddOltSnmpVersion1717000003000';

  public async up(q: QueryRunner): Promise<void> {
    // SNMP transport version per OLT: 'v3' (authPriv, default) atau 'v2c' (community).
    // C-Data / banyak EPON OLT murah hanya mendukung v2c.
    await q.query(
      `ALTER TABLE "olts" ADD COLUMN "snmp_version" VARCHAR NOT NULL DEFAULT 'v3';`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "olts" DROP COLUMN "snmp_version";`);
  }
}
