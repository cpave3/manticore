import { Hono } from 'hono';
import {
  breakdownQuerySchema,
  timeSeriesQuerySchema,
  eventLogQuerySchema,
} from '../schemas/dashboard.js';
import { summary, breakdown, timeSeries, eventLog } from '../services/aggregations.js';
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
      message: err.message || 'Internal server error',
      type: 'internal_server_error',
    },
  };
  return c.json(body, 500 as any);
});

app.get('/summary', async (c) => {
  const result = await summary();
  return c.json(result);
});

app.get('/breakdown/:groupBy', async (c) => {
  const parsed = breakdownQuerySchema.safeParse({ groupBy: c.req.param('groupBy') });
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.message, type: 'invalid_request_error' } }, 400 as any);
  }
  const result = await breakdown(parsed.data.groupBy);
  return c.json(result);
});

app.get('/time-series', async (c) => {
  const parsed = timeSeriesQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.message, type: 'invalid_request_error' } }, 400 as any);
  }
  const result = await timeSeries(parsed.data.bucket);
  return c.json(result);
});

app.get('/events', async (c) => {
  const parsed = eventLogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.message, type: 'invalid_request_error' } }, 400 as any);
  }

  if (parsed.data.sortBy && !['createdAt', 'latencyMs', 'totalTokens', 'status'].includes(parsed.data.sortBy)) {
    return c.json(
      { error: { message: `Invalid sortBy: ${parsed.data.sortBy}`, type: 'invalid_request_error' } },
      400 as any,
    );
  }

  const result = await eventLog({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    sortBy: parsed.data.sortBy,
    sortDir: parsed.data.sortDir,
  });
  return c.json(result);
});

export default app;
