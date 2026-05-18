import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const dbPath = join(tmpdir(), `manticore-test-${randomUUID()}.db`);
process.env.MANTICORE_DB_PATH = dbPath;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

process.env.MANTICORE_LOG_LEVEL = 'error';
