import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * Standalone DataSource for the TypeORM CLI (migrations/seed).
 * The runtime connection is configured in AppModule via TypeOrmModule.forRootAsync.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USER || 'rtrw',
  password: process.env.DB_PASS || 'changeme',
  database: process.env.DB_NAME || 'rtrw_billing',
  entities: ALL_ENTITIES,
  // Resolves to src/database/migrations/*.ts under ts-node, and
  // dist/database/migrations/*.js in the compiled production image.
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
