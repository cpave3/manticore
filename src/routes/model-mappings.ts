import { Hono } from 'hono';
import { createModelMappingBodySchema, modelMappingIdParamSchema } from '../schemas/model-mappings.js';
import { createMapping, listMappings, deleteMapping } from '../services/model-mappings.js';
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
  const parsed = createModelMappingBodySchema.safeParse(raw);
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
  const mapping = createMapping({
    abstractName: parsed.data.abstractName,
    upstreamId: parsed.data.upstreamId,
    modelPath: parsed.data.modelPath,
    priority: parsed.data.priority,
  });
  return c.json(mapping, 201 as any);
});

app.get('/', (c) => {
  const mappings = listMappings();
  return c.json(mappings);
});

app.delete('/:id', async (c) => {
  const raw = c.req.param();
  const parsed = modelMappingIdParamSchema.safeParse(raw);
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
  deleteMapping(parsed.data.id);
  return c.body(null, 204 as any);
});

export default app;
