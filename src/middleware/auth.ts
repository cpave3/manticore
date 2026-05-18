import { createMiddleware } from 'hono/factory';
import { findClientByApiKey } from '../services/clients.js';
import { buildApiError } from '../lib/errors.js';

export function apiKeyAuth() {
  return createMiddleware(async (c, next) => {
    const auth = c.req.header('authorization');
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      return c.json(
        buildApiError('Missing API key', 'invalid_request_error'),
        401
      );
    }

    const key = auth.slice(7).trim();
    if (!key) {
      return c.json(
        buildApiError('Missing API key', 'invalid_request_error'),
        401
      );
    }

    const client = await findClientByApiKey(key);
    if (!client) {
      return c.json(
        buildApiError('Invalid API key', 'invalid_request_error'),
        401
      );
    }

    c.set('client', client);
    await next();
  });
}

declare module 'hono' {
  interface ContextVariableMap {
    client: { id: string; name: string };
  }
}
