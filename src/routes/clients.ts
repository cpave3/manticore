import { Hono } from 'hono';
import { createClientBodySchema, clientIdParamSchema } from '../schemas/clients.js';
import { createClient, listClients, deleteClient } from '../services/clients.js';
import { HttpError, buildApiError } from '../lib/errors.js';

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.toJson(), err.status as 404 | 400 | 401 | 500);
  }
  return c.json(
    { error: { message: err.message || 'Internal server error', type: 'api_error' } },
    500
  );
});

app.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(buildApiError('Invalid JSON body', 'invalid_request_error'), 400);
  }

  const parsed = createClientBodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return c.json(buildApiError(message, 'invalid_request_error'), 400);
  }

  const result = await createClient(parsed.data.name);
  return c.json(
    {
      ...result.client,
      apiKey: result.apiKey,
    },
    201
  );
});

app.get('/', async (c) => {
  const clients = await listClients();
  return c.json(clients);
});

app.delete('/:id', async (c) => {
  const paramParsed = clientIdParamSchema.safeParse({ id: c.req.param('id') });
  if (!paramParsed.success) {
    const message = paramParsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return c.json(buildApiError(message, 'invalid_request_error'), 400);
  }

  await deleteClient(paramParsed.data.id);
  return c.body(null, 204);
});

export default app;
