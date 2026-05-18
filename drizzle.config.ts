import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  out: './migrations',
  dbCredentials: {
    url: process.env.MANTICORE_DB_PATH ?? './manticore.db',
  },
});
