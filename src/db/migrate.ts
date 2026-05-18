import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadConfig } from '../config.js';

const config = loadConfig();
const raw = new Database(config.dbPath);
const db = drizzle(raw);

// Run migrations from the generated migration directory
migrate(db, { migrationsFolder: './migrations' });

raw.close();
console.log('Migrations applied.');
