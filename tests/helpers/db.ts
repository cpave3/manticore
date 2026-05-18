import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { setDbForTesting, resetDbForTesting } from '../../src/db/client.js';
import * as schema from '../../src/db/schema.js';

export { schema };

export function freshDb() {
  const dbPath = join(tmpdir(), `manticore-test-${randomUUID()}.db`);
  const raw = new Database(dbPath);
  const db = drizzle(raw, { schema });

  migrate(db, { migrationsFolder: join(process.cwd(), 'migrations') });
  setDbForTesting(db);

  return {
    db,
    dbPath,
    cleanup() {
      raw.close();
      resetDbForTesting();
      try {
        unlinkSync(dbPath);
      } catch {
        // ignore
      }
    },
  };
}

export async function withFreshDb<T>(
  fn: (db: ReturnType<typeof drizzle<typeof schema>>) => T
): Promise<T> {
  const { db, cleanup } = freshDb();
  try {
    return await fn(db);
  } finally {
    cleanup();
  }
}
