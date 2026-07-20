import { Hono } from 'hono';
import { ZodError } from 'zod';
import {
  summaryQuerySchema,
  breakdownQuerySchema,
  timeSeriesQuerySchema,
  eventLogQuerySchema,
} from '../schemas/dashboard.js';
import { summary, breakdown, timeSeries, eventLog } from '../services/aggregations.js';
import { HttpError, buildApiError } from '../lib/errors.js';

function toDateRange(data: { startDate?: string; endDate?: string }) {
  return data.startDate || data.endDate
    ? { start: data.startDate ? new Date(data.startDate) : undefined, end: data.endDate ? new Date(data.endDate) : undefined }
    : undefined;
}

function formatZodMessage(error: ZodError) {
  return error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.toJson(), err.status as 404 | 400 | 401 | 500);
  }
  console.error(err);
  return c.json(
    buildApiError(err.message || 'Internal server error', 'internal_server_error'),
    500,
  );
});

app.get('/summary', async (c) => {
  const parsed = summaryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(buildApiError(formatZodMessage(parsed.error), 'invalid_request_error'), 400);
  }
  const result = await summary(toDateRange(parsed.data));
  return c.json(result);
});

app.get('/breakdown/:groupBy', async (c) => {
  const parsed = breakdownQuerySchema.safeParse({ groupBy: c.req.param('groupBy'), ...c.req.query() });
  if (!parsed.success) {
    return c.json(buildApiError(formatZodMessage(parsed.error), 'invalid_request_error'), 400);
  }
  const result = await breakdown(parsed.data.groupBy, toDateRange(parsed.data), parsed.data.clientId);
  return c.json(result);
});

app.get('/time-series', async (c) => {
  const parsed = timeSeriesQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(buildApiError(formatZodMessage(parsed.error), 'invalid_request_error'), 400);
  }
  const result = await timeSeries(parsed.data.bucket, toDateRange(parsed.data));
  return c.json(result);
});

app.get('/events', async (c) => {
  const parsed = eventLogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(buildApiError(formatZodMessage(parsed.error), 'invalid_request_error'), 400);
  }

  const result = await eventLog({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    sortBy: parsed.data.sortBy,
    sortDir: parsed.data.sortDir,
    clientId: parsed.data.clientId,
    status: parsed.data.status,
    ...toDateRange(parsed.data),
  });
  return c.json(result);
});

export default app;
