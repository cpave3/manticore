import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MiddlewareHandler } from 'hono';

/**
 * Dashboard SPA static-file middleware.
 *
 * Serves files from `root` and falls back to `index.html` for client-side
 * routes, while never shadowing `/api/*` or `/v1/*`.
 */
export function dashboardStatic(root: string): MiddlewareHandler {
  const staticHandler = serveStatic({ root });

  return async (c, next) => {
    const path = c.req.path;

    // Never intercept API or proxy routes
    if (path.startsWith('/api/') || path.startsWith('/v1/')) {
      return next();
    }

    // Let the asset-specific middleware handle these
    if (path.startsWith('/assets/')) {
      return staticHandler(c, next);
    }

    // For all other GET requests, serve index.html (SPA fallback)
    if (c.req.method === 'GET') {
      const indexPath = join(process.cwd(), root, 'index.html');
      if (existsSync(indexPath)) {
        const file = readFileSync(indexPath);
        return c.newResponse(file, 200, { 'Content-Type': 'text/html' });
      }
    }

    return next();
  };
}
