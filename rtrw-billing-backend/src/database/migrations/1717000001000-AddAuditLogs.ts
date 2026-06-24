import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogs1717000001000 implements MigrationInterface {
  name = 'AddAuditLogs1717000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "audit_logs" (
        "id" BIGSERIAL PRIMARY KEY,
        "user_id" BIGINT,
        "user_email" VARCHAR(120),
        "action" VARCHAR(160) NOT NULL,
        "entity" VARCHAR(60),
        "entity_id" VARCHAR(60),
        "ip" INET,
        "status_code" INT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    await q.query(`CREATE INDEX "idx_audit_created" ON "audit_logs" ("created_at");`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "audit_logs";`);
  }
}
