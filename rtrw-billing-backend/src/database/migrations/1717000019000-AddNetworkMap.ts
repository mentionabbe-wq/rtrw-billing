import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNetworkMap1717000019000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS map_nodes (
        id BIGSERIAL PRIMARY KEY,
        type VARCHAR NOT NULL DEFAULT 'odp',
        name VARCHAR NOT NULL,
        lat NUMERIC(10,7) NOT NULL,
        lng NUMERIC(10,7) NOT NULL,
        description TEXT,
        capacity_total INT,
        capacity_used INT,
        color VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS map_cables (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        type VARCHAR NOT NULL DEFAULT 'distribution',
        cores INT NOT NULL DEFAULT 12,
        path JSONB NOT NULL DEFAULT '[]',
        color VARCHAR,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS map_cables`);
    await qr.query(`DROP TABLE IF EXISTS map_nodes`);
  }
}
