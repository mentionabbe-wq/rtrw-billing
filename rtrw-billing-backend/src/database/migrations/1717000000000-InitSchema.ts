import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Full initial schema. Written as explicit SQL (not synchronize) so we control
 * partitioning of device_metrics and the composite PK it requires.
 *
 * Note: device_metrics is RANGE-partitioned on recorded_at, so its primary key
 * must include recorded_at -> PK (id, recorded_at). The TypeORM entity only
 * declares `id`; that's fine because inserts use the IDENTITY default and reads
 * by id still resolve. Create new monthly partitions ahead of time (cron/ops).
 */
export class InitSchema1717000000000 implements MigrationInterface {
  name = 'InitSchema1717000000000';

  public async up(q: QueryRunner): Promise<void> {
    // ---- users ----
    await q.query(`
      CREATE TABLE "users" (
        "id" BIGSERIAL PRIMARY KEY,
        "email" VARCHAR(120) UNIQUE NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "role" VARCHAR(20) NOT NULL DEFAULT 'operator',
        "totp_secret_enc" BYTEA,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);

    // ---- service_packages ----
    await q.query(`
      CREATE TABLE "service_packages" (
        "id" BIGSERIAL PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "price" NUMERIC(12,2) NOT NULL,
        "rate_limit" VARCHAR(40) NOT NULL,
        "pppoe_profile" VARCHAR(60),
        "billing_cycle" SMALLINT NOT NULL DEFAULT 30,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);

    // ---- routers (Mikrotik) ----
    await q.query(`
      CREATE TABLE "routers" (
        "id" BIGSERIAL PRIMARY KEY,
        "name" VARCHAR(80) NOT NULL,
        "host" INET NOT NULL,
        "api_port" INT NOT NULL DEFAULT 8729,
        "api_username" VARCHAR(60) NOT NULL,
        "api_secret_enc" BYTEA NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'unknown',
        "last_seen_at" TIMESTAMPTZ
      );`);

    // ---- olts (SNMP) ----
    await q.query(`
      CREATE TABLE "olts" (
        "id" BIGSERIAL PRIMARY KEY,
        "name" VARCHAR(80) NOT NULL,
        "host" INET UNIQUE NOT NULL,
        "vendor" VARCHAR(20) NOT NULL DEFAULT 'generic',
        "snmp_user" VARCHAR(60) NOT NULL,
        "snmp_auth_enc" BYTEA NOT NULL,
        "snmp_priv_enc" BYTEA NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'unknown'
      );`);

    // ---- customers ----
    await q.query(`
      CREATE TABLE "customers" (
        "id" BIGSERIAL PRIMARY KEY,
        "customer_no" VARCHAR(20) UNIQUE NOT NULL,
        "full_name" VARCHAR(120) NOT NULL,
        "nik_enc" BYTEA,
        "phone_enc" BYTEA NOT NULL,
        "address" TEXT,
        "geo_lat" NUMERIC(9,6),
        "geo_lng" NUMERIC(9,6),
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);

    // ---- subscriptions ----
    await q.query(`
      CREATE TABLE "subscriptions" (
        "id" BIGSERIAL PRIMARY KEY,
        "customer_id" BIGINT REFERENCES "customers"("id") ON DELETE CASCADE,
        "package_id" BIGINT REFERENCES "service_packages"("id"),
        "router_id" BIGINT REFERENCES "routers"("id"),
        "conn_type" VARCHAR(10) NOT NULL DEFAULT 'pppoe',
        "pppoe_user" VARCHAR(60) UNIQUE,
        "pppoe_pass_enc" BYTEA,
        "ip_static" INET,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "activated_at" DATE,
        "due_date" DATE NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    await q.query(`CREATE INDEX "idx_sub_due" ON "subscriptions" ("due_date", "status");`);

    // ---- devices (ONU) ----
    await q.query(`
      CREATE TABLE "devices" (
        "id" BIGSERIAL PRIMARY KEY,
        "subscription_id" BIGINT REFERENCES "subscriptions"("id") ON DELETE CASCADE,
        "type" VARCHAR(20) NOT NULL DEFAULT 'onu',
        "serial_number" VARCHAR(60),
        "olt_host" INET,
        "olt_if_index" INT,
        "onu_id" INT,
        "last_rx_power" NUMERIC(6,2),
        "last_status" VARCHAR(20),
        "updated_at" TIMESTAMPTZ
      );`);
    await q.query(`CREATE INDEX "idx_device_olt" ON "devices" ("olt_host");`);

    // ---- invoices ----
    await q.query(`
      CREATE TABLE "invoices" (
        "id" BIGSERIAL PRIMARY KEY,
        "invoice_no" VARCHAR(30) UNIQUE NOT NULL,
        "subscription_id" BIGINT REFERENCES "subscriptions"("id"),
        "amount" NUMERIC(12,2) NOT NULL,
        "period_start" DATE,
        "period_end" DATE,
        "due_date" DATE NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    await q.query(`CREATE INDEX "idx_invoice_status" ON "invoices" ("status");`);

    // ---- payments ----
    await q.query(`
      CREATE TABLE "payments" (
        "id" BIGSERIAL PRIMARY KEY,
        "invoice_id" BIGINT REFERENCES "invoices"("id"),
        "gateway" VARCHAR(20),
        "gateway_ref" VARCHAR(80),
        "amount" NUMERIC(12,2) NOT NULL,
        "method" VARCHAR(30),
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "paid_at" TIMESTAMPTZ,
        "raw_payload" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);

    // ---- mikrotik_sync_logs ----
    await q.query(`
      CREATE TABLE "mikrotik_sync_logs" (
        "id" BIGSERIAL PRIMARY KEY,
        "subscription_id" BIGINT,
        "action" VARCHAR(30) NOT NULL,
        "result" VARCHAR(20) NOT NULL,
        "message" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);

    // ---- device_metrics (RANGE partitioned by recorded_at) ----
    await q.query(`
      CREATE TABLE "device_metrics" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY,
        "device_id" BIGINT NOT NULL,
        "rx_power" NUMERIC(6,2),
        "tx_power" NUMERIC(6,2),
        "traffic_in" BIGINT,
        "traffic_out" BIGINT,
        "uptime_sec" BIGINT,
        "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("id", "recorded_at")
      ) PARTITION BY RANGE ("recorded_at");`);
    await q.query(`CREATE INDEX "idx_metric_device_time" ON "device_metrics" ("device_id", "recorded_at");`);

    // Seed a few monthly partitions + a catch-all default partition.
    const now = new Date();
    for (let i = -1; i <= 2; i++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
      const name = `device_metrics_${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      await q.query(`
        CREATE TABLE "${name}" PARTITION OF "device_metrics"
        FOR VALUES FROM ('${start.toISOString().slice(0, 10)}') TO ('${end.toISOString().slice(0, 10)}');`);
    }
    await q.query(`CREATE TABLE "device_metrics_default" PARTITION OF "device_metrics" DEFAULT;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "device_metrics" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "mikrotik_sync_logs";`);
    await q.query(`DROP TABLE IF EXISTS "payments";`);
    await q.query(`DROP TABLE IF EXISTS "invoices";`);
    await q.query(`DROP TABLE IF EXISTS "devices";`);
    await q.query(`DROP TABLE IF EXISTS "subscriptions";`);
    await q.query(`DROP TABLE IF EXISTS "customers";`);
    await q.query(`DROP TABLE IF EXISTS "olts";`);
    await q.query(`DROP TABLE IF EXISTS "routers";`);
    await q.query(`DROP TABLE IF EXISTS "service_packages";`);
    await q.query(`DROP TABLE IF EXISTS "users";`);
  }
}
