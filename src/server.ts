import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import clientsRoutes from './routes/clients.js';
import upstreamsRoutes from './routes/upstreams.js';
import modelMappingsRoutes from './routes/model-mappings.js';
import dashboardRoutes from './routes/dashboard.js';
import proxyRoutes from './routes/proxy.js';

export function createApp(): Hono {
  const config = loadConfig();
  const app = new Hono();

  // Logger middleware — skip in error-only mode
  if (config.logLevel !== 'error') {
    app.use(logger());
  }

  // CORS — permissive defaults for single-user tool (ADR-0001)
  app.use(cors());

  // API sub-apps (must be before static wildcard)
  app.route('/api/clients', clientsRoutes);
  app.route('/api/upstreams', upstreamsRoutes);
  app.route('/api/model-mappings', modelMappingsRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/v1', proxyRoutes);

  // Dashboard static files
  const prod = config.nodeEnv === 'production' || existsSync('dashboard/dist/index.html');

  if (prod) {
    // Assets are served from dashboard/dist/assets/* via the root prefix
    app.use('/assets/*', serveStatic({ root: 'dashboard/dist' }));
    // SPA fallback: serve index.html for all non-API, non-asset GET routes
    app.get('*', (c) => {
      const path = c.req.path;
      if (path.startsWith('/api/') || path.startsWith('/v1/') || path.startsWith('/assets/')) {
        return c.json(
          { error: { message: 'Not Found', type: 'not_found' } },
          404
        );
      }
      const indexPath = join(process.cwd(), 'dashboard/dist/index.html');
      if (existsSync(indexPath)) {
        const file = readFileSync(indexPath);
        return c.newResponse(file, 200, { 'Content-Type': 'text/html' });
      }
      return c.json(
        { error: { message: 'Not Found', type: 'not_found' } },
        404
      );
    });
  } else {
    app.get('/', (c) => {
      return c.text(
        'Manticore server running.\nStart the dashboard dev server with: npm run dashboard:dev (port 5173)'
      );
    });
  }

  // Global 404
  app.notFound((c) => {
    return c.json(
      { error: { message: 'Not Found', type: 'not_found' } },
      404
    );
  });

  // Global error handler
  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err);
    return c.json(
      { error: { message: err.message || 'Internal server error', type: 'internal_server_error' } },
      500
    );
  });

  return app;
}

export default createApp();
