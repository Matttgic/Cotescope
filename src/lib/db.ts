import "server-only";

import { Pool } from "pg";

const globalForDb = globalThis as unknown as { cotescopePool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: false },
  });
}

export function getDbPool() {
  if (!globalForDb.cotescopePool) {
    const pool = createPool();
    if (!pool) return null;
    globalForDb.cotescopePool = pool;
  }
  return globalForDb.cotescopePool;
}
