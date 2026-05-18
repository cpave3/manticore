import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { getDb } from './db/client.js';
import { createApp } from './server.js';

async function main() {
  const config = loadConfig();

  // Ensure DB file exists (opens/creates)
  getDb();

  // Run migrations — migrate.ts executes its side-effects on import
  try {
    await import('./db/migrate.js');
  } catch (err: unknown) {
    console.error(
      '[startup] Migration failed:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }

  const app = createApp();
  const hostname = process.env.MANTICORE_HOST || '127.0.0.1';
  const port = config.port;

  const server = serve({ fetch: app.fetch, port, hostname });

  const dashboardUrl =
    hostname === '0.0.0.0'
      ? `http://localhost:${port}`
      : `http://${hostname}:${port}`;

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  🐉 Manticore                                ║`);
  console.log(`║     Port:     ${String(port).padEnd(30)} ║`);
  console.log(`║     Database: ${config.dbPath.padEnd(30)} ║`);
  console.log(`║     Dashboard: ${dashboardUrl.padEnd(29)} ║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[shutdown] Closing server…');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
