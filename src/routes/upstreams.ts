import { Hono } from 'hono';
import { createUpstreamBodySchema, upstreamIdParamSchema } from '../schemas/upstreams.js';
import { createUpstream, listUpstreams, deleteUpstream } from '../services/upstreams.js';
import { HttpError } from '../lib/errors.js';
import type { ApiError } from '../lib/errors.js';

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.toJson(), err.status as any);
  }

  console.error(err);
  const body: ApiError = {
    error: {
      message: 'Internal server error',
      type: 'internal_server_error',
    },
  };
  return c.json(body, 500 as any);
});

app.post('/', async (c) => {
  const raw = await c.req.json();
  const parsed = createUpstreamBodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ');
    return c.json(
      {
        error: {
          message,
          type: 'invalid_request_error',
        },
      },
      400 as any,
    );
  }
  const upstream = createUpstream({
    name: parsed.data.name,
    baseUrl: parsed.data.baseUrl,
    apiKey: parsed.data.apiKey,
    headers: parsed.data.headers,
  });
  return c.json(upstream, 201 as any);
});

app.get('/', (c) => {
  const upstreams = listUpstreams();
  return c.json(upstreams);
});

app.delete('/:id', async (c) => {
  const raw = c.req.param();
  const parsed = upstreamIdParamSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ');
    return c.json(
      {
        error: {
          message,
          type: 'invalid_request_error',
        },
      },
      400 as any,
    );
  }
  deleteUpstream(parsed.data.id);
  return c.body(null, 204 as any);
});

export default app;
