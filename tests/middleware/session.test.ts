import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { extractSessionId } from '../../src/middleware/session.js';

function makeApp() {
  const app = new Hono();
  app.use('/test', extractSessionId());
  app.get('/test', (c) => c.json({ sessionId: c.var.sessionId }));
  return app;
}

describe('extractSessionId middleware', () => {
  it('returns null when header is absent', async () => {
    const app = makeApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeNull();
  });

  it('returns the header value when present', async () => {
    const app = makeApp();
    const res = await app.request('/test', {
      headers: { 'X-Session-Id': 'abc-123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe('abc-123');
  });

  it('handles lowercase header name (case-insensitive)', async () => {
    const app = makeApp();
    const res = await app.request('/test', {
      headers: { 'x-session-id': 'lowercase-456' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe('lowercase-456');
  });

  it('treats empty string as null', async () => {
    const app = makeApp();
    const res = await app.request('/test', {
      headers: { 'X-Session-Id': '' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeNull();
  });

  it('treats whitespace-only string as null', async () => {
    const app = makeApp();
    const res = await app.request('/test', {
      headers: { 'X-Session-Id': '   ' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeNull();
  });

  it('trims whitespace from value', async () => {
    const app = makeApp();
    const res = await app.request('/test', {
      headers: { 'X-Session-Id': '  session-789  ' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe('session-789');
  });

  it('truncates value exceeding 1024 characters', async () => {
    const app = makeApp();
    const longValue = 'a'.repeat(1500);
    const res = await app.request('/test', {
      headers: { 'X-Session-Id': longValue },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toHaveLength(1024);
    expect(body.sessionId).toBe('a'.repeat(1024));
  });
});
