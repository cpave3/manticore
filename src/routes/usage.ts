import { Hono } from 'hono';
import { apiKeyAuth } from '../middleware/auth.js';
import { extractSessionId } from '../middleware/session.js';
import { usageReportSchema } from '../schemas/usage.js';
import { recordReportedUsage } from '../services/usage-reports.js';
import { buildApiError } from '../lib/errors.js';

const app = new Hono();

app.use('/', apiKeyAuth(), extractSessionId());

app.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(buildApiError('Invalid JSON body', 'invalid_request_error'), 400);
  }

  const parsed = usageReportSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return c.json(buildApiError(message, 'invalid_request_error'), 400);
  }

  const result = recordReportedUsage({
    client: c.var.client,
    sessionId: c.var.sessionId,
    records: parsed.data.records,
  });
  return c.json(result);
});

export default app;
