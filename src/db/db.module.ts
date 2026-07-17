import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

export type Db = NodePgDatabase<typeof schema>;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('pg pool error', err));
export const db: Db = drizzle(pool, { schema });

@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DbModule {}
