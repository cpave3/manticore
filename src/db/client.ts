import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { loadConfig } from '../config.js';

export { schema };

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (instance) return instance;

  const config = loadConfig();
  const raw = new Database(config.dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  instance = drizzle(raw, { schema });
  return instance;
}

/** Override the singleton with a test database instance. */
export function setDbForTesting(db: ReturnType<typeof drizzle<typeof schema>>): void {
  instance = db;
}

/** Clear the cached instance so the next `getDb()` reopens a fresh connection. */
export function resetDbForTesting(): void {
  instance = undefined;
}
